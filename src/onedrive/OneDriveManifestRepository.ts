import { APP_VERSION, LAB_MARKER, PROTOCOL_VERSION } from "../config";
import { ownerManifestSchema, parseOwnerManifest, type OwnerManifest } from "../domain/schemas";
import { GraphClient, GraphError } from "../graph/GraphClient";

interface DriveItem {
  id: string;
  name: string;
  eTag?: string;
}

interface ManifestRead {
  manifest: OwnerManifest;
  eTag: string;
}

export class OneDriveManifestRepository {
  constructor(private readonly graph: GraphClient) {}

  async initialize(): Promise<DriveItem> {
    const appRoot = await this.graph.request<DriveItem>({
      method: "GET",
      path: "/me/drive/special/approot",
      headers: {},
    });
    try {
      return await this.graph.request<DriveItem>({
        method: "POST",
        path: `/me/drive/items/${encodeURIComponent(appRoot.id)}/children`,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "manifests", folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
      });
    } catch (error: unknown) {
      if (!(error instanceof GraphError) || error.status !== 409) throw error;
      return this.graph.request<DriveItem>({
        method: "GET",
        path: "/me/drive/special/approot:/manifests",
        headers: {},
      });
    }
  }

  createManifest(ownerId: string, count: number, generatedAt = new Date()): OwnerManifest {
    return ownerManifestSchema.parse({
      schemaVersion: 1,
      labMarker: LAB_MARKER,
      ownerId,
      generatedAt: generatedAt.toISOString(),
      appVersion: APP_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      syntheticRecords: {
        count,
        summary: count === 1 ? "1 synthetic lab record" : `${count} synthetic lab records`,
      },
    });
  }

  async read(): Promise<ManifestRead | null> {
    try {
      const item = await this.graph.request<DriveItem>({
        method: "GET",
        path: "/me/drive/special/approot:/manifests/owner-manifest.json",
        headers: {},
      });
      if (!item.eTag) throw new Error("The owner manifest response did not include an ETag.");
      const raw = await this.graph.request<unknown>({
        method: "GET",
        path: "/me/drive/special/approot:/manifests/owner-manifest.json:/content",
        headers: {},
      });
      return { manifest: parseOwnerManifest(raw), eTag: item.eTag };
    } catch (error: unknown) {
      if (error instanceof GraphError && error.status === 404) return null;
      throw error;
    }
  }

  async publish(manifest: OwnerManifest): Promise<ManifestRead> {
    const validManifest = ownerManifestSchema.parse(manifest);
    await this.initialize();
    const existing = await this.read();
    const saved = await this.graph.request<DriveItem>({
      method: "PUT",
      path: "/me/drive/special/approot:/manifests/owner-manifest.json:/content",
      headers: {
        "Content-Type": "application/json",
        ...(existing ? { "If-Match": existing.eTag } : { "If-None-Match": "*" }),
      },
      body: JSON.stringify(validManifest, null, 2),
    });
    if (!saved.eTag) throw new Error("Microsoft Graph did not return an ETag after saving the manifest.");
    return { manifest: validManifest, eTag: saved.eTag };
  }
}

export type { ManifestRead };
