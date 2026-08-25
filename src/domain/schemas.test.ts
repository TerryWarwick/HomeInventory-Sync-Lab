import { describe, expect, it } from "vitest";
import { LAB_MARKER } from "../config";
import { ownerManifestSchema, syntheticRecordSchema } from "./schemas";

const ownerId = "a".repeat(64);

describe("strict versioned schemas", () => {
  it("accepts a valid synthetic record and rejects unknown fields", () => {
    const record = {
      schemaVersion: 1,
      id: "123e4567-e89b-42d3-a456-426614174000",
      label: "Fake probe",
      payload: "Synthetic only",
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
      actorId: ownerId,
    };
    expect(syntheticRecordSchema.parse(record)).toEqual(record);
    expect(() => syntheticRecordSchema.parse({ ...record, catalogId: "forbidden" })).toThrow();
    expect(() => syntheticRecordSchema.parse({ ...record, schemaVersion: 2 })).toThrow();
  });

  it("requires a versioned lab marker and digest owner ID", () => {
    const manifest = {
      schemaVersion: 1,
      labMarker: LAB_MARKER,
      ownerId,
      generatedAt: "2026-08-25T00:00:00.000Z",
      appVersion: "1.0.0",
      protocolVersion: 1,
      syntheticRecords: { count: 2, summary: "2 synthetic lab records" },
    };
    expect(ownerManifestSchema.parse(manifest)).toEqual(manifest);
    expect(() => ownerManifestSchema.parse({ ...manifest, ownerId: "raw-home-account-id" })).toThrow();
    expect(() => ownerManifestSchema.parse({ ...manifest, extra: true })).toThrow();
  });
});
