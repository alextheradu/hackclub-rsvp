import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CloudflareError,
  cloudflareFromEnv,
  createCloudflare,
} from "@/lib/cloudflare";

const TOKEN = "cf-secret-token-do-not-leak";
const ZONE = "023e105f4ecef8ad9ca31a8372d0c353";
const BASE = `https://api.cloudflare.com/client/v4/zones/${ZONE}/custom_hostnames`;
const ID = "0d89c70d-ad9f-4843-b99f-6cc0252067e9";

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function ok(result: unknown, extra: Record<string, unknown> = {}): Response {
  return reply({ success: true, errors: [], messages: [], result, ...extra });
}

function failed(status: number, code = 1000, message = "Something broke") {
  return reply(
    { success: false, errors: [{ code, message }], messages: [], result: null },
    status,
  );
}

function setup(...responses: (Response | Error)[]) {
  const fetchFn = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetchFn.mockRejectedValueOnce(response);
    else fetchFn.mockResolvedValueOnce(response);
  }
  const cf = createCloudflare({ token: TOKEN, zoneId: ZONE, fetch: fetchFn });
  return { cf, fetchFn };
}

function call(fetchFn: ReturnType<typeof vi.fn<typeof fetch>>, n = 0) {
  const [url, init] = fetchFn.mock.calls[n];
  return { url: String(url), init: init ?? {} };
}

function header(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createHostname", () => {
  it("POSTs the hostname with HTTP DV validation and returns the id", async () => {
    const { cf, fetchFn } = setup(ok({ id: ID, hostname: "rsvp.club.org" }));
    expect(await cf.createHostname("rsvp.club.org")).toEqual({ id: ID });
    const { url, init } = call(fetchFn);
    expect(url).toBe(BASE);
    expect(init.method).toBe("POST");
    expect(header(init, "Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(header(init, "Content-Type")).toMatch(/^application\/json/);
    expect(JSON.parse(String(init.body))).toEqual({
      hostname: "rsvp.club.org",
      ssl: { method: "http", type: "dv" },
    });
  });

  it("throws Cloudflare's code and message when creation fails", async () => {
    const { cf } = setup(failed(409, 1406, "Duplicate custom hostname found."));
    const error = await cf.createHostname("rsvp.club.org").catch((e) => e);
    expect(error).toBeInstanceOf(CloudflareError);
    expect(error).toMatchObject({ status: 409, codes: [1406] });
    expect(error.message).toContain("1406");
    expect(error.message).toContain("Duplicate custom hostname found.");
    expect(error.retryable).toBe(false);
  });

  it("treats a 200 with success: false as a failure", async () => {
    const { cf } = setup(failed(200, 1407, "Invalid custom hostname."));
    await expect(cf.createHostname("rsvp.club.org")).rejects.toMatchObject({
      codes: [1407],
    });
  });
});

describe("getHostname", () => {
  it("returns the hostname status and the certificate status", async () => {
    const { cf, fetchFn } = setup(
      ok({
        id: ID,
        hostname: "rsvp.club.org",
        status: "active",
        ssl: { status: "pending_validation" },
      }),
    );
    expect(await cf.getHostname(ID)).toEqual({
      status: "active",
      sslStatus: "pending_validation",
    });
    const { url, init } = call(fetchFn);
    expect(url).toBe(`${BASE}/${ID}`);
    expect(init.method ?? "GET").toBe("GET");
    expect(header(init, "Authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("reports a missing ssl object as no certificate status", async () => {
    const { cf } = setup(ok({ id: ID, status: "pending" }));
    expect(await cf.getHostname(ID)).toEqual({
      status: "pending",
      sslStatus: null,
    });
  });

  it.each(["", "../../zones", `${ID}/x`, "not-a-uuid"])(
    "refuses the malformed id %j without calling Cloudflare",
    async (id) => {
      const { cf, fetchFn } = setup();
      await expect(cf.getHostname(id)).rejects.toBeInstanceOf(CloudflareError);
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );
});

describe("deleteHostname", () => {
  it("DELETEs the hostname", async () => {
    const { cf, fetchFn } = setup(ok({ id: ID }));
    await expect(cf.deleteHostname(ID)).resolves.toBeUndefined();
    const { url, init } = call(fetchFn);
    expect(url).toBe(`${BASE}/${ID}`);
    expect(init.method).toBe("DELETE");
  });

  it("treats 404 as success, because the hostname is already gone", async () => {
    const { cf } = setup(failed(404, 1436, "Custom hostname not found."));
    await expect(cf.deleteHostname(ID)).resolves.toBeUndefined();
  });

  it("throws a retryable error on a 500", async () => {
    const { cf } = setup(failed(500));
    await expect(cf.deleteHostname(ID)).rejects.toMatchObject({
      status: 500,
      retryable: true,
    });
  });

  it("throws a permanent error on a 403", async () => {
    const { cf } = setup(failed(403, 10000, "Authentication error"));
    await expect(cf.deleteHostname(ID)).rejects.toMatchObject({
      status: 403,
      retryable: false,
    });
  });
});

describe("listHostnames", () => {
  it("walks every page and returns id, host and creation time", async () => {
    const OTHER = "7c5dae5552338874e5053f2534d2767a".replace(
      /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
      "$1-$2-$3-$4-$5",
    );
    const { cf, fetchFn } = setup(
      ok(
        [
          {
            id: ID,
            hostname: "rsvp.club.org",
            created_at: "2026-11-01T10:00:00Z",
          },
        ],
        { result_info: { page: 1, per_page: 1000, total_pages: 2 } },
      ),
      ok(
        [
          {
            id: OTHER,
            hostname: "rsvp.other.org",
            created_at: "2026-11-02T10:00:00Z",
          },
        ],
        { result_info: { page: 2, per_page: 1000, total_pages: 2 } },
      ),
    );
    expect(await cf.listHostnames()).toEqual([
      {
        id: ID,
        host: "rsvp.club.org",
        createdAt: new Date("2026-11-01T10:00:00Z"),
      },
      {
        id: OTHER,
        host: "rsvp.other.org",
        createdAt: new Date("2026-11-02T10:00:00Z"),
      },
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const first = new URL(call(fetchFn, 0).url);
    const second = new URL(call(fetchFn, 1).url);
    expect(`${first.origin}${first.pathname}`).toBe(BASE);
    expect(first.searchParams.get("page")).toBe("1");
    expect(first.searchParams.get("per_page")).toBe("1000");
    expect(second.searchParams.get("page")).toBe("2");
  });

  it("stops after one page when there is no result_info", async () => {
    const { cf, fetchFn } = setup(ok([]));
    expect(await cf.listHostnames()).toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("errors", () => {
  it("wraps a network failure as a retryable error", async () => {
    const { cf } = setup(new TypeError("fetch failed"));
    await expect(cf.getHostname(ID)).rejects.toMatchObject({
      retryable: true,
    });
  });

  it("handles a non-JSON error page, e.g. a 502 from a proxy", async () => {
    const { cf } = setup(
      new Response("<html>Bad gateway</html>", { status: 502 }),
    );
    await expect(cf.getHostname(ID)).rejects.toMatchObject({
      status: 502,
      retryable: true,
    });
  });

  it("treats a 429 as retryable", async () => {
    const { cf } = setup(
      failed(429, 971, "Please wait and consider throttling"),
    );
    await expect(cf.getHostname(ID)).rejects.toMatchObject({
      status: 429,
      retryable: true,
    });
  });

  it("never puts the token in errors or logs", async () => {
    const logged: unknown[] = [];
    for (const method of ["log", "warn", "error", "info", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args) => {
        logged.push(...args);
      });
    }
    const { cf } = setup(
      failed(403, 10000, "Authentication error"),
      new TypeError("fetch failed"),
      new Response("<html>oops</html>", { status: 500 }),
    );
    const errors = [
      await cf.createHostname("rsvp.club.org").catch((e) => e),
      await cf.getHostname(ID).catch((e) => e),
      await cf.deleteHostname(ID).catch((e) => e),
    ];
    for (const error of errors) {
      expect(error).toBeInstanceOf(CloudflareError);
      expect(String(error)).not.toContain(TOKEN);
      expect(JSON.stringify(error)).not.toContain(TOKEN);
      expect(String(error.stack)).not.toContain(TOKEN);
    }
    expect(JSON.stringify(logged)).not.toContain(TOKEN);
  });
});

describe("cloudflareFromEnv", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("refuses to build a client without CF_TOKEN or CF_ZONE_ID", () => {
    delete process.env.CF_TOKEN;
    process.env.CF_ZONE_ID = ZONE;
    expect(() => cloudflareFromEnv()).toThrow(/not configured/);
    process.env.CF_TOKEN = TOKEN;
    delete process.env.CF_ZONE_ID;
    expect(() => cloudflareFromEnv()).toThrow(/not configured/);
  });

  it("does not echo the token when it refuses", () => {
    process.env.CF_TOKEN = TOKEN;
    delete process.env.CF_ZONE_ID;
    expect(() => cloudflareFromEnv()).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(TOKEN),
      }),
    );
  });
});
