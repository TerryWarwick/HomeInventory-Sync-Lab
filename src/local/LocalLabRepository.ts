import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { DB_NAME } from "../config";
import { parseSyntheticRecord, type SyntheticRecord } from "../domain/schemas";

interface LabDatabase extends DBSchema {
  records: {
    key: string;
    value: SyntheticRecord;
    indexes: { "by-updated": string };
  };
  metadata: {
    key: "ownerId";
    value: { key: "ownerId"; value: string };
  };
}

export class OwnerIsolationError extends Error {
  constructor(message = "Local lab data belongs to another owner. Reset it before changing owners.") {
    super(message);
    this.name = "OwnerIsolationError";
  }
}

export class LocalLabRepository {
  private database: Promise<IDBPDatabase<LabDatabase>> | null = null;

  private db(): Promise<IDBPDatabase<LabDatabase>> {
    this.database ??= openDB<LabDatabase>(DB_NAME, 1, {
      upgrade(db) {
        const records = db.createObjectStore("records", { keyPath: "id" });
        records.createIndex("by-updated", "updatedAt");
        db.createObjectStore("metadata", { keyPath: "key" });
      },
    });
    return this.database;
  }

  async ownerId(): Promise<string | null> {
    return (await (await this.db()).get("metadata", "ownerId"))?.value ?? null;
  }

  async claim(ownerId: string): Promise<void> {
    const transaction = (await this.db()).transaction(["metadata", "records"], "readwrite");
    const metadata = transaction.objectStore("metadata");
    const current = (await metadata.get("ownerId"))?.value ?? null;
    if (current !== null && current !== ownerId) throw new OwnerIsolationError();
    await metadata.put({ key: "ownerId", value: ownerId });
    await transaction.done;
  }

  async reset(nextOwnerId?: string): Promise<void> {
    const db = await this.db();
    const transaction = db.transaction(["records", "metadata"], "readwrite");
    await transaction.objectStore("records").clear();
    if (nextOwnerId) {
      await transaction.objectStore("metadata").put({ key: "ownerId", value: nextOwnerId });
    } else {
      await transaction.objectStore("metadata").delete("ownerId");
    }
    await transaction.done;
  }

  private async assertOwner(
    ownerId: string,
    transaction: ReturnType<IDBPDatabase<LabDatabase>["transaction"]>,
  ): Promise<void> {
    const current = (await transaction.objectStore("metadata").get("ownerId"))?.value ?? null;
    if (current !== ownerId) throw new OwnerIsolationError("Claim the local lab identity for this account first.");
  }

  async list(ownerId: string): Promise<SyntheticRecord[]> {
    const transaction = (await this.db()).transaction(["metadata", "records"], "readonly");
    await this.assertOwner(ownerId, transaction);
    const values = await transaction.objectStore("records").index("by-updated").getAll();
    const records = values.map(parseSyntheticRecord);
    if (records.some((record) => record.actorId !== ownerId)) {
      throw new OwnerIsolationError("Local lab data contains records owned by another account.");
    }
    await transaction.done;
    return records.reverse();
  }

  async add(ownerId: string, label: string, payload: string): Promise<SyntheticRecord> {
    const now = new Date().toISOString();
    const record = parseSyntheticRecord({
      schemaVersion: 1,
      id: crypto.randomUUID(),
      label,
      payload,
      createdAt: now,
      updatedAt: now,
      actorId: ownerId,
    });
    const transaction = (await this.db()).transaction(["metadata", "records"], "readwrite");
    await this.assertOwner(ownerId, transaction);
    await transaction.objectStore("records").add(record);
    await transaction.done;
    return record;
  }

  async update(ownerId: string, id: string, label: string, payload: string): Promise<SyntheticRecord> {
    const transaction = (await this.db()).transaction(["metadata", "records"], "readwrite");
    await this.assertOwner(ownerId, transaction);
    const records = transaction.objectStore("records");
    const current = await records.get(id);
    if (!current) throw new Error(`Synthetic record ${id} does not exist.`);
    if (current.actorId !== ownerId) throw new OwnerIsolationError();
    const updated = parseSyntheticRecord({
      ...current,
      label,
      payload,
      updatedAt: new Date().toISOString(),
    });
    await records.put(updated);
    await transaction.done;
    return updated;
  }

  async delete(ownerId: string, id: string): Promise<void> {
    const transaction = (await this.db()).transaction(["metadata", "records"], "readwrite");
    await this.assertOwner(ownerId, transaction);
    const records = transaction.objectStore("records");
    const current = await records.get(id);
    if (!current) {
      await transaction.done;
      return;
    }
    if (current.actorId !== ownerId) throw new OwnerIsolationError();
    await records.delete(id);
    await transaction.done;
  }
}
