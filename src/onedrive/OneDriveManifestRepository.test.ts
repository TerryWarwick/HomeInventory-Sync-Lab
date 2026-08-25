import { describe, expect, it } from "vitest";
import { GraphClient, type GraphTransportRequest, type GraphTransportResponse } from "../graph/GraphClient";
import { OneDriveManifestRepository } from "./OneDriveManifestRepository";

const response = (status: number, body: unknown): GraphTransportResponse => ({
  status,
  headers: new Headers(),
  body: body === "" ? "" : JSON.stringify(body),
});

describe("OneDriveManifestRepository", () => {
  it("conditionally creates a manifest and reads it back", async () => {
    const requests: GraphTransportRequest[] = [];
    const manifestBody = {
      schemaVersion: 1,
      labMarker: "homeinventory-sync-lab.synthetic",
      ownerId: "a".repeat(64),
      generatedAt: "2026-08-25T00:00:00.000Z",
      appVersion: "1.0.0",
      protocolVersion: 1,
      syntheticRecords: { count: 3, summary: "3 synthetic lab records" },
    };
    const queue = [
      response(200, { id: "approot", name: "approot" }),
      response(201, { id: "manifests", name: "manifests" }),
      response(404, { error: "missing" }),
      response(201, { id: "manifest", name: "owner-manifest.json", eTag: '"v1"' }),
      response(200, { id: "manifest", name: "owner-manifest.json", eTag: '"v1"' }),
      response(200, { placeholder: "content response is generated below" }),
    ];
    const repository = new OneDriveManifestRepository(new GraphClient(async (request) => {
      requests.push(request);
      const next = queue.shift();
      if (!next) throw new Error("Unexpected Graph request.");
      if (request.path.endsWith(":/content") && request.method === "GET") {
        return response(200, manifestBody);
      }
      return next;
    }));

    const manifest = repository.createManifest("a".repeat(64), 3, new Date("2026-08-25T00:00:00Z"));
    const saved = await repository.publish(manifest);
    expect(saved.eTag).toBe('"v1"');
    const put = requests.find((request) => request.method === "PUT");
    expect(put?.headers["If-None-Match"]).toBe("*");
    expect(put?.headers["If-Match"]).toBeUndefined();

    const read = await repository.read();
    expect(read?.manifest.syntheticRecords.count).toBe(3);
    expect(read?.eTag).toBe('"v1"');
  });

  it("uses the current ETag for an update and handles an existing folder", async () => {
    const requests: GraphTransportRequest[] = [];
    const currentManifest = {
      schemaVersion: 1,
      labMarker: "homeinventory-sync-lab.synthetic",
      ownerId: "b".repeat(64),
      generatedAt: "2026-08-25T00:00:00.000Z",
      appVersion: "1.0.0",
      protocolVersion: 1,
      syntheticRecords: { count: 1, summary: "1 synthetic lab record" },
    };
    const queue = [
      response(200, { id: "approot", name: "approot" }),
      response(409, { error: "nameAlreadyExists" }),
      response(200, { id: "manifests", name: "manifests" }),
      response(200, { id: "manifest", name: "owner-manifest.json", eTag: '"v4"' }),
      response(200, currentManifest),
      response(200, { id: "manifest", name: "owner-manifest.json", eTag: '"v5"' }),
    ];
    const repository = new OneDriveManifestRepository(new GraphClient(async (request) => {
      requests.push(request);
      const next = queue.shift();
      if (!next) throw new Error("Unexpected Graph request.");
      return next;
    }));

    const updated = repository.createManifest("b".repeat(64), 2, new Date("2026-08-25T01:00:00Z"));
    expect((await repository.publish(updated)).eTag).toBe('"v5"');
    const put = requests.find((request) => request.method === "PUT");
    expect(put?.headers["If-Match"]).toBe('"v4"');
    expect(put?.headers["If-None-Match"]).toBeUndefined();
    expect(requests.some((request) => request.path === "/me/drive/special/approot:/manifests")).toBe(true);
  });
});
