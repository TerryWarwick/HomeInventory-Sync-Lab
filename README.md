# HomeInventory Sync Lab

An intentionally standalone React/TypeScript research app for proving that two
personal Microsoft accounts can independently authenticate and maintain a small,
read-only owner summary in each account's OneDrive AppFolder.

> **Milestone 1 does not implement cross-account transport.** It does not share,
> discover, copy, or synchronize records between Owner A and Owner B.

## Safety boundaries

- Synthetic, module-neutral records only. Never import real catalog data.
- Milestone 1 is local-only at `http://localhost:5173`.
- Public deployment requires a dedicated hostname/custom domain or a separate
  host account so the lab has its own origin.
- Separate IndexedDB database: `homeinventory-sync-lab`.
- Separate PWA identity, service worker, manifest, and icons.
- Separate Entra application registration. Never reuse HomeInventory credentials
  or deployment assets.
- One delegated permission only: `Files.ReadWrite.AppFolder`.
- No client secret, application permission, shared link, or broad OneDrive scope.
- The manifest stores a SHA-256 owner digest, never the raw `homeAccountId`.
- The app does not read or modify the production HomeInventory repository,
  IndexedDB, service worker, data, app registration, or OneDrive files.

## Entra registration (exact settings)

1. Register an application named **HomeInventory Sync Lab**.
2. Under **Supported account types**, choose **Personal Microsoft accounts only**.
3. Add these **Single-page application** redirect URIs:
   - `http://localhost:5173/auth-popup.html`
   - `http://localhost:5173/`
4. Add Microsoft Graph delegated permission **Files.ReadWrite.AppFolder** only.
5. Do **not** create a client secret.
6. Copy the Application (client) ID to local `.env.local`:

   ```dotenv
   VITE_MICROSOFT_CLIENT_ID=your-dedicated-lab-client-id
   VITE_BASE_PATH=/
   ```

The production redirect URI is intentionally TBD until a dedicated public origin
is provisioned. `VITE_BASE_PATH` and `VITE_PWA_ID` default to `/` and remain
configurable for that future dedicated root origin.

## Prohibited GitHub Pages project-path deployment

Do not publish this lab under
`https://terrywarwick.github.io/HomeInventory-Sync-Lab/`. A URL path is not an
origin boundary: that project path shares the `https://terrywarwick.github.io`
origin with the real HomeInventory app. Path separation therefore cannot isolate
IndexedDB, service workers, browser storage, or other origin-scoped state. The
GitHub Pages deployment workflow has intentionally been removed.

Authentication uses the `consumers` authority, popup sign-in with
`prompt=select_account` only for initial connection, localStorage MSAL cache, and
exactly `Files.ReadWrite.AppFolder`. Interactive token renewal pins and verifies
the established owner account. Tokens are never rendered.

## Local development

Requires Node.js 24.

```powershell
npm ci
npm run dev
npm test
npm run lint
npm run build
```

A missing client ID intentionally renders a setup-required screen while the app
continues to build. Nothing is seeded automatically.

## Owner A / Owner B test plan

1. Open browser profile A, visit the lab, and connect the normal Outlook/Microsoft
   account (Owner A).
2. Confirm the displayed username and browser-only home account ID, then claim the
   local lab identity.
3. Explicitly seed fake examples or add a synthetic record. Publish and refresh
   Owner A's manifest. Confirm its count and SHA-256 owner ID.
4. Open a separate browser profile B and connect the disposable Outlook.com
   account (Owner B). Repeat claim, synthetic add, publish, and refresh.
5. In each profile, confirm the app sees only that profile's local database and
   that account's `/special/approot/manifests/owner-manifest.json`.
6. Attempt to switch accounts in one profile. Confirm local writes are refused
   until the destructive **Reset & claim identity** confirmation is accepted.
7. Confirm no shared links exist and no data moves between profiles/accounts.

Success proves only independent authentication and own-AppFolder manifest
create/update/read with ETag protection. Cross-account exchange remains future work.
