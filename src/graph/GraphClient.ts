export interface GraphTransportRequest {
  method: "GET" | "POST" | "PUT";
  path: string;
  headers: Readonly<Record<string, string>>;
  body?: string;
}

export interface GraphTransportResponse {
  status: number;
  headers: Headers;
  body: string;
}

export type GraphTransport = (request: GraphTransportRequest) => Promise<GraphTransportResponse>;

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs: number | null,
    readonly detail: string,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

export function isNewConsentServiceReadOnly(error: unknown): boolean {
  return (
    error instanceof GraphError &&
    error.status === 403 &&
    error.detail.includes('"code":"serviceReadOnly"') &&
    error.detail.includes('"message":"Database Is Read Only"')
  );
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (value === null) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export const createFetchGraphTransport = (getAccessToken: () => Promise<string>): GraphTransport =>
  async (request) => {
    const token = await getAccessToken();
    const response = await fetch(`https://graph.microsoft.com/v1.0${request.path}`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...request.headers,
      },
      body: request.body,
    });
    return { status: response.status, headers: response.headers, body: await response.text() };
  };

export class GraphClient {
  constructor(
    private readonly transport: GraphTransport,
    private readonly sleep: (milliseconds: number) => Promise<void> =
      (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  async request<T>(request: GraphTransportRequest, retry = true): Promise<T> {
    const response = await this.transport(request);
    if (response.status >= 200 && response.status < 300) {
      if (!response.body) return undefined as T;
      try {
        return JSON.parse(response.body) as T;
      } catch (error: unknown) {
        throw new GraphError(
          `Microsoft Graph returned invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`,
          response.status,
          null,
          response.body,
        );
      }
    }

    const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
    if (retry && retryAfterMs !== null && (response.status === 429 || response.status === 503)) {
      await this.sleep(retryAfterMs);
      return this.request<T>(request, false);
    }

    throw new GraphError(
      `Microsoft Graph request failed (${response.status}).`,
      response.status,
      retryAfterMs,
      response.body,
    );
  }
}
