import { z } from "zod";
import { LAB_MARKER, PROTOCOL_VERSION } from "../config";

const isoDateTime = z.iso.datetime({ offset: true });

export const syntheticRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.uuid(),
  label: z.string().trim().min(1).max(120),
  payload: z.string().max(4_000),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  actorId: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type SyntheticRecord = z.infer<typeof syntheticRecordSchema>;

export const ownerManifestSchema = z.object({
  schemaVersion: z.literal(1),
  labMarker: z.literal(LAB_MARKER),
  ownerId: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: isoDateTime,
  appVersion: z.string().min(1),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  syntheticRecords: z.object({
    count: z.number().int().nonnegative(),
    summary: z.string().max(240),
  }).strict(),
}).strict();

export type OwnerManifest = z.infer<typeof ownerManifestSchema>;

export const parseOwnerManifest = (input: unknown): OwnerManifest =>
  ownerManifestSchema.parse(input);

export const parseSyntheticRecord = (input: unknown): SyntheticRecord =>
  syntheticRecordSchema.parse(input);
