// Cloudflare for SaaS custom hostnames client.
//
// Shapes checked against developers.cloudflare.com/api/resources/custom_hostnames
// on 2026-11-21:
// - Base https://api.cloudflare.com/client/v4, auth `Authorization: Bearer`.
//   Token needs the zone permission "SSL and Certificates Write".
// - POST   /zones/{zone}/custom_hostnames      {hostname, ssl: {method, type}}
// - GET    /zones/{zone}/custom_hostnames/{id} (id is a 36-char UUID)
// - DELETE /zones/{zone}/custom_hostnames/{id} -> {id}
// - GET    /zones/{zone}/custom_hostnames?page&per_page (per_page max 1000),
//   result_info.total_pages for paging.
// - Envelope {success, errors: [{code, message}], messages, result}.
// - result.status is the hostname, result.ssl.status the certificate; both
//   must be "active" to serve traffic.
// Not documented: error codes for duplicates/quota and the response when
// deleting an unknown id, so 404 on delete is treated as already gone.

const API = "https://api.cloudflare.com/client/v4";
const PER_PAGE = 1000;
const MAX_PAGES = 100;
const TIMEOUT_MS = 15_000;
const HOSTNAME_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CloudflareError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly codes: number[],
    readonly retryable: boolean,
  ) {
    super(`cloudflare: ${message}`);
    this.name = "CloudflareError";
  }
}

export type CloudflareConfig = {
  token: string;
  zoneId: string;
  fetch?: typeof fetch;
};

export type HostnameStatus = { status: string; sslStatus: string | null };
export type ListedHostname = { id: string; host: string; createdAt: Date };

export type Cloudflare = {
  createHostname(host: string): Promise<{ id: string }>;
  getHostname(id: string): Promise<HostnameStatus>;
  deleteHostname(id: string): Promise<void>;
  listHostnames(): Promise<ListedHostname[]>;
};

type Envelope = {
  success?: boolean;
  errors?: { code?: unknown; message?: unknown }[];
  result?: unknown;
  result_info?: { page?: number; total_pages?: number };
};

type RawHostname = {
  id?: unknown;
  hostname?: unknown;
  status?: unknown;
  created_at?: unknown;
  ssl?: { status?: unknown } | null;
};

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function describe(errors: Envelope["errors"]): {
  codes: number[];
  text: string;
} {
  const list = Array.isArray(errors) ? errors : [];
  const codes = list
    .map((e) => e.code)
    .filter((code): code is number => typeof code === "number");
  const text = list
    .map((e) =>
      [typeof e.code === "number" ? e.code : null, e.message]
        .filter((part) => part !== null && part !== undefined)
        .join(" "),
    )
    .join("; ");
  return { codes, text };
}

function checkId(id: string): string {
  if (!HOSTNAME_ID.test(id)) {
    throw new CloudflareError("invalid custom hostname id", null, [], false);
  }
  return id;
}

export function createCloudflare(config: CloudflareConfig): Cloudflare {
  const fetchFn = config.fetch ?? fetch;
  const base = `${API}/zones/${encodeURIComponent(config.zoneId)}/custom_hostnames`;

  async function request(
    url: string,
    init: { method: string; body?: unknown },
    allow404 = false,
  ): Promise<Envelope | null> {
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      // Only the error's name: messages from fetch are safe today, but this
      // keeps anything request-shaped out of logs.
      const name = error instanceof Error ? error.name : "unknown";
      throw new CloudflareError(`network error (${name})`, null, [], true);
    }

    if (allow404 && res.status === 404) return null;

    let body: Envelope | null = null;
    try {
      body = (await res.json()) as Envelope;
    } catch {
      body = null;
    }

    if (!res.ok || !body || body.success !== true) {
      const { codes, text } = describe(body?.errors);
      throw new CloudflareError(
        `${init.method} failed with HTTP ${res.status}${text ? `: ${text}` : ""}`,
        res.status,
        codes,
        isRetryable(res.status),
      );
    }
    return body;
  }

  return {
    async createHostname(host) {
      const body = await request(base, {
        method: "POST",
        body: { hostname: host, ssl: { method: "http", type: "dv" } },
      });
      const result = body?.result as RawHostname | undefined;
      if (typeof result?.id !== "string") {
        throw new CloudflareError("create returned no id", 200, [], false);
      }
      return { id: result.id };
    },

    async getHostname(id) {
      const body = await request(`${base}/${checkId(id)}`, { method: "GET" });
      const result = (body?.result ?? {}) as RawHostname;
      return {
        status: typeof result.status === "string" ? result.status : "unknown",
        sslStatus:
          typeof result.ssl?.status === "string" ? result.ssl.status : null,
      };
    },

    async deleteHostname(id) {
      await request(`${base}/${checkId(id)}`, { method: "DELETE" }, true);
    },

    async listHostnames() {
      const hostnames: ListedHostname[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `${base}?page=${page}&per_page=${PER_PAGE}`;
        const body = await request(url, { method: "GET" });
        const results = Array.isArray(body?.result)
          ? (body.result as RawHostname[])
          : [];
        for (const item of results) {
          if (typeof item.id !== "string" || typeof item.hostname !== "string")
            continue;
          hostnames.push({
            id: item.id,
            host: item.hostname,
            createdAt: new Date(
              typeof item.created_at === "string" ? item.created_at : 0,
            ),
          });
        }
        const totalPages = body?.result_info?.total_pages ?? 1;
        if (page >= totalPages) break;
      }
      return hostnames;
    },
  };
}

export function cloudflareFromEnv(): Cloudflare {
  const token = process.env.CF_TOKEN;
  const zoneId = process.env.CF_ZONE_ID;
  if (!token || !zoneId) {
    throw new Error("cloudflare: CF_TOKEN and CF_ZONE_ID are not configured");
  }
  return createCloudflare({ token, zoneId });
}
