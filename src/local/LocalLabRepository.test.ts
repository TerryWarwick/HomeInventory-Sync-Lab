import { beforeEach, describe, expect, it } from "vitest";
import { DB_NAME } from "../config";
import type { SyntheticRecord } from "../domain/schemas";
import { LocalLabRepository, OwnerIsolationError } from "./LocalLabRepository";

const ownerA = "a".repeat(64);
const ownerB = "b".repeat(64);

async function replaceRecordOwner(id: string, actorId: string): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transaction = database.transaction("records", "readwrite");
  const store = transaction.objectStore("records");
  const current = await new Promise<SyntheticRecord>((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result as SyntheticRecord);
    request.onerror = () => reject(request.error);
  });
  store.put({ ...current, actorId });
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

describe("LocalLabRepository owner isolation", () => {
  let repository: LocalLabRepository;

  beforeEach(async () => {
    repository = new LocalLabRepository();
    await repository.reset();
  });

  it("refuses cross-owner reads and writes until an explicit reset", async () => {
    await repository.claim(ownerA);
    const record = await repository.add(ownerA, "Fake A", "Synthetic payload");
    expect((await repository.list(ownerA))[0]?.actorId).toBe(ownerA);

    await expect(repository.claim(ownerB)).rejects.toBeInstanceOf(OwnerIsolationError);
    await expect(repository.add(ownerB, "Fake B", "Blocked")).rejects.toBeInstanceOf(OwnerIsolationError);
    await expect(repository.update(ownerB, record.id, "Changed", "Blocked")).rejects.toBeInstanceOf(OwnerIsolationError);
    await expect(repository.delete(ownerB, record.id)).rejects.toBeInstanceOf(OwnerIsolationError);

    await repository.reset(ownerB);
    expect(await repository.list(ownerB)).toEqual([]);
    expect((await repository.add(ownerB, "Fake B", "Allowed")).actorId).toBe(ownerB);
  });

  it("fails closed when a claimed database contains a mixed-owner record", async () => {
    await repository.claim(ownerA);
    const record = await repository.add(ownerA, "Fake A", "Synthetic payload");
    await replaceRecordOwner(record.id, ownerB);

    await expect(repository.list(ownerA)).rejects.toThrow(
      "Local lab data contains records owned by another account.",
    );
  });

  it("prevents a stale repository instance from writing after another instance switches owners", async () => {
    const switchingRepository = new LocalLabRepository();
    await repository.claim(ownerA);
    await switchingRepository.ownerId();

    await switchingRepository.reset(ownerB);

    await expect(repository.add(ownerA, "Stale A", "Must be rejected"))
      .rejects.toBeInstanceOf(OwnerIsolationError);
    expect(await switchingRepository.list(ownerB)).toEqual([]);
  });
});
