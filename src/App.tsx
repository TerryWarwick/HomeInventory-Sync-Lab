import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { InteractionRequiredAuthError, type AccountInfo } from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { loginRequest, tokenRequest } from "./auth/msal";
import { acceptInteractiveAccessToken } from "./auth/interactiveToken";
import { DB_NAME, GRAPH_SCOPE, runtimeConfig } from "./config";
import { deriveOwnerId } from "./domain/identity";
import type { OwnerManifest, SyntheticRecord } from "./domain/schemas";
import { createFetchGraphTransport, GraphClient, GraphError } from "./graph/GraphClient";
import { LocalLabRepository } from "./local/LocalLabRepository";
import { OneDriveManifestRepository } from "./onedrive/OneDriveManifestRepository";

const localRepository = new LocalLabRepository();

function messageFrom(error: unknown): string {
  if (error instanceof GraphError) return `${error.message} ${error.detail}`.trim();
  if (error instanceof Error) return error.message;
  return "An unexpected operation failure occurred.";
}

function IsolationCards() {
  return (
    <section aria-labelledby="isolation-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Hard boundaries</p>
          <h2 id="isolation-title">Isolation status</h2>
        </div>
        <span className="status safe">Synthetic data only</span>
      </div>
      <div className="status-grid">
        <article><span>Actual origin</span><strong>{window.location.origin}</strong></article>
        <article><span>Base path (not an origin boundary)</span><strong>{runtimeConfig.basePath}</strong></article>
        <article><span>Hosting boundary</span><strong>Local-only; dedicated public origin required</strong></article>
        <article><span>IndexedDB</span><strong>{DB_NAME}</strong></article>
        <article><span>OneDrive storage</span><strong>AppFolder only</strong></article>
        <article><span>Authentication</span><strong>{runtimeConfig.clientId ? "Separate lab registration configured" : "Setup required"}</strong></article>
      </div>
    </section>
  );
}

function SetupRequired() {
  return (
    <section className="panel setup" aria-labelledby="setup-title">
      <p className="eyebrow">Configuration needed</p>
      <h2 id="setup-title">Add the lab application registration</h2>
      <p>
        Set <code>VITE_MICROSOFT_CLIENT_ID</code> to the client ID of the dedicated
        <strong> HomeInventory Sync Lab</strong> personal-account registration, then restart Vite.
      </p>
      <p>No production HomeInventory identity or storage is used.</p>
    </section>
  );
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <aside className="update" aria-live="polite">
      <span>A new lab version is ready.</span>
      <button onClick={() => void updateServiceWorker(true)}>Update now</button>
      <button className="quiet" onClick={() => setNeedRefresh(false)}>Later</button>
    </aside>
  );
}

function AuthenticatedLab() {
  const { instance, accounts } = useMsal();
  const [account, setAccount] = useState<AccountInfo | null>(() => instance.getActiveAccount() ?? accounts[0] ?? null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [localOwnerId, setLocalOwnerId] = useState<string | null>(null);
  const [records, setRecords] = useState<SyntheticRecord[]>([]);
  const [manifest, setManifest] = useState<OwnerManifest | null>(null);
  const [label, setLabel] = useState("");
  const [payload, setPayload] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Connect Owner A or Owner B to begin.");
  const isClaimed = ownerId !== null && localOwnerId === ownerId;

  const manifestRepository = useMemo(() => {
    if (!account) return null;
    const transport = createFetchGraphTransport(async () => {
      try {
        return (await instance.acquireTokenSilent(tokenRequest(account))).accessToken;
      } catch (error: unknown) {
        if (!(error instanceof InteractionRequiredAuthError)) throw error;
        const expectedAccount = account;
        const result = await instance.acquireTokenPopup(tokenRequest(expectedAccount));
        return acceptInteractiveAccessToken(expectedAccount, result.account, result.accessToken);
      }
    });
    return new OneDriveManifestRepository(new GraphClient(transport));
  }, [account, instance]);

  const refreshLocal = useCallback(async (currentOwnerId: string) => {
    const claimed = await localRepository.ownerId();
    setLocalOwnerId(claimed);
    setRecords(claimed === currentOwnerId ? await localRepository.list(currentOwnerId) : []);
  }, []);

  useEffect(() => {
    if (!account) {
      setOwnerId(null);
      setRecords([]);
      setLocalOwnerId(null);
      return;
    }
    void deriveOwnerId(account.homeAccountId)
      .then(async (derived) => {
        setOwnerId(derived);
        await refreshLocal(derived);
      })
      .catch((error: unknown) => setNotice(messageFrom(error)));
  }, [account, refreshLocal]);

  async function run(operation: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await operation();
    } catch (error: unknown) {
      setNotice(messageFrom(error));
    } finally {
      setBusy(false);
    }
  }

  const connect = () => run(async () => {
    const result = await instance.loginPopup(loginRequest);
    instance.setActiveAccount(result.account);
    setAccount(result.account);
    setNotice("Connected. Claim or reset the isolated local identity before writing records.");
  });

  const disconnect = () => run(async () => {
    if (!account) return;
    await instance.logoutPopup({ account });
    instance.setActiveAccount(null);
    setAccount(null);
    setManifest(null);
    setNotice("Disconnected. Local synthetic records remain isolated in this lab database.");
  });

  const claim = () => run(async () => {
    if (!ownerId) throw new Error("Connect an account first.");
    const changingOwner = localOwnerId !== null && localOwnerId !== ownerId;
    const prompt = changingOwner
      ? "This deletes all local lab records and reassigns this browser profile to the connected owner. Continue?"
      : "Claim this isolated browser lab database for the connected owner?";
    if (!window.confirm(prompt)) return;
    if (changingOwner) await localRepository.reset(ownerId);
    else await localRepository.claim(ownerId);
    await refreshLocal(ownerId);
    setNotice(changingOwner ? "Local lab identity reset and claimed." : "Local lab identity claimed.");
  });

  const reset = () => run(async () => {
    if (!window.confirm("Delete every synthetic record and remove the local owner claim? This cannot be undone.")) return;
    await localRepository.reset();
    setLocalOwnerId(null);
    setRecords([]);
    setNotice("Local lab database reset. OneDrive content was not changed.");
  });

  const add = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (!ownerId) throw new Error("Connect and claim an owner first.");
      await localRepository.add(ownerId, label, payload);
      setLabel("");
      setPayload("");
      await refreshLocal(ownerId);
      setNotice("Synthetic record added locally.");
    });
  };

  const seed = () => run(async () => {
    if (!ownerId) throw new Error("Connect and claim an owner first.");
    await localRepository.add(ownerId, "Fake alpha probe", "Synthetic payload A — not inventory data.");
    await localRepository.add(ownerId, "Fake beta probe", "Synthetic payload B — generated only for this lab.");
    await refreshLocal(ownerId);
    setNotice("Two obvious fake examples were seeded.");
  });

  const remove = (id: string) => run(async () => {
    if (!ownerId) throw new Error("Connect and claim an owner first.");
    await localRepository.delete(ownerId, id);
    await refreshLocal(ownerId);
    setNotice("Synthetic record deleted.");
  });

  const publish = () => run(async () => {
    if (!ownerId || !manifestRepository) throw new Error("Connect an account first.");
    if (!isClaimed) throw new Error("Claim the local lab identity before publishing.");
    const saved = await manifestRepository.publish(manifestRepository.createManifest(ownerId, records.length));
    setManifest(saved.manifest);
    setNotice("Read-only owner summary published with conditional ETag protection.");
  });

  const readManifest = () => run(async () => {
    if (!manifestRepository) throw new Error("Connect an account first.");
    const result = await manifestRepository.read();
    setManifest(result?.manifest ?? null);
    setNotice(result ? "Own owner manifest refreshed from AppFolder." : "No owner manifest exists yet.");
  });

  return (
    <>
      <section className="panel account-panel" aria-labelledby="account-title">
        <div>
          <p className="eyebrow">Personal Microsoft account</p>
          <h2 id="account-title">{account ? "Owner connected" : "Connect an owner"}</h2>
          {account ? (
            <dl className="identity">
              <div><dt>Username</dt><dd>{account.username}</dd></div>
              <div><dt>Home account ID (browser only)</dt><dd className="break">{account.homeAccountId}</dd></div>
            </dl>
          ) : <p>Use separate browser profiles for Owner A and Owner B.</p>}
        </div>
        <button disabled={busy} onClick={() => void (account ? disconnect() : connect())}>
          {account ? "Disconnect" : "Connect Microsoft account"}
        </button>
      </section>

      {account && ownerId && (
        <>
          <section className="panel" aria-labelledby="local-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Isolated IndexedDB</p>
                <h2 id="local-title">Local synthetic records</h2>
              </div>
              <span className={`status ${isClaimed ? "safe" : "warning"}`}>
                {isClaimed ? "Claimed by connected owner" : localOwnerId ? "Owned by another account" : "Unclaimed"}
              </span>
            </div>
            <div className="button-row">
              {!isClaimed && <button disabled={busy} onClick={() => void claim()}>{localOwnerId ? "Reset & claim identity" : "Claim local identity"}</button>}
              <button className="danger" disabled={busy} onClick={() => void reset()}>Reset local lab</button>
            </div>
            <form className="record-form" onSubmit={add}>
              <label>Label<input value={label} onChange={(event) => setLabel(event.target.value)} required maxLength={120} disabled={!isClaimed || busy} /></label>
              <label>Payload<textarea value={payload} onChange={(event) => setPayload(event.target.value)} maxLength={4000} disabled={!isClaimed || busy} /></label>
              <div className="button-row">
                <button type="submit" disabled={!isClaimed || busy}>Add synthetic record</button>
                <button type="button" className="secondary" disabled={!isClaimed || busy} onClick={() => void seed()}>Seed fake examples</button>
              </div>
            </form>
            <div className="record-list" aria-live="polite">
              {records.length === 0 ? <p className="empty">No synthetic records. Nothing is seeded automatically.</p> :
                records.map((record) => (
                  <article key={record.id}>
                    <div><h3>{record.label}</h3><p>{record.payload || "Empty synthetic payload"}</p><small>Updated {new Date(record.updatedAt).toLocaleString()}</small></div>
                    <button className="quiet danger-text" disabled={busy} onClick={() => void remove(record.id)}>Delete</button>
                  </article>
                ))}
            </div>
          </section>

          <section className="panel" aria-labelledby="manifest-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">OneDrive AppFolder</p>
                <h2 id="manifest-title">Own read-only owner manifest</h2>
              </div>
              <span className="status neutral">{GRAPH_SCOPE}</span>
            </div>
            <p>Only a count and synthetic summary are published. No records, credentials, tokens, or raw home account ID are written.</p>
            <div className="button-row">
              <button disabled={!isClaimed || busy} onClick={() => void publish()}>Publish own manifest</button>
              <button className="secondary" disabled={busy} onClick={() => void readManifest()}>Refresh own manifest</button>
            </div>
            {manifest && <pre aria-label="Validated owner manifest">{JSON.stringify(manifest, null, 2)}</pre>}
          </section>
        </>
      )}
      <p className="notice" role="status">{busy ? "Working… " : ""}{notice}</p>
    </>
  );
}

export function App() {
  return (
    <div className="app">
      <header>
        <div className="brand-mark" aria-hidden="true">HL</div>
        <div><p className="kicker">Standalone research environment</p><h1>HomeInventory Sync Lab</h1></div>
        <span className="header-badge">Synthetic data only</span>
      </header>
      <main>
        <section className="hero">
          <div><p className="eyebrow">Milestone 1 · local-only at http://localhost:5173</p><h2>Prove isolated owner access.</h2><p>Authenticate each owner and create or read only that owner's manifest in its own OneDrive AppFolder. Public deployment requires a dedicated hostname, custom domain, or separate host account.</p></div>
          <aside><strong>No cross-account transport</strong><span>This milestone does not exchange records between accounts.</span></aside>
        </section>
        <IsolationCards />
        {runtimeConfig.clientId ? <AuthenticatedLab /> : <SetupRequired />}
      </main>
      <footer>Experimental and isolated · Personal Microsoft accounts only · No production HomeInventory access</footer>
      <UpdatePrompt />
    </div>
  );
}
