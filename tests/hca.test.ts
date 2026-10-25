import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  checkState,
  exchangeCode,
  fetchUserinfo,
  safeReturnTo,
} from "@/lib/hca";

const CLIENT_ID = "client-id-123";
const CLIENT_SECRET = "super-secret-value-xyz";
const REDIRECT = "https://hackclub.rsvp/oauth/callback";

beforeEach(() => {
  vi.stubEnv("HCA_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("HCA_CLIENT_SECRET", CLIENT_SECRET);
  vi.stubEnv("HCA_REDIRECT_URI", REDIRECT);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("buildAuthorizeUrl", () => {
  it("includes client_id, scopes, state, redirect_uri and response_type=code", () => {
    const url = new URL(buildAuthorizeUrl("abc123"));
    expect(url.origin + url.pathname).toBe("https://auth.hackclub.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("abc123");
    expect(url.searchParams.get("scope")).toBe(
      "openid profile email name slack_id verification_status",
    );
  });

  it("never requests a scope outside the community-app set", () => {
    const scope = new URL(buildAuthorizeUrl("s")).searchParams.get("scope") ?? "";
    for (const forbidden of ["phone", "birthdate", "address", "legal_name", "basic_info"]) {
      expect(scope.split(" ")).not.toContain(forbidden);
    }
  });

  it("throws when HCA_CLIENT_ID is missing", () => {
    vi.stubEnv("HCA_CLIENT_ID", "");
    expect(() => buildAuthorizeUrl("s")).toThrow();
  });
});

describe("checkState", () => {
  it("accepts a matching state", () => {
    expect(checkState("abc123", "abc123")).toBe(true);
  });

  it.each([
    ["missing cookie", undefined, "abc123"],
    ["missing param", "abc123", null],
    ["both missing", undefined, null],
    ["empty strings", "", ""],
    ["different value, same length", "abc123", "abc124"],
    ["different length", "abc123", "abc1234"],
  ])("rejects: %s", (_name, cookie, param) => {
    expect(checkState(cookie, param)).toBe(false);
  });
});

describe("safeReturnTo", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/dashboard/events/3?tab=roster", "/dashboard/events/3?tab=roster"],
    ["/", "/"],
  ])("keeps the same-site path %s", (raw, expected) => {
    expect(safeReturnTo(raw)).toBe(expected);
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["absolute https", "https://evil.com"],
    ["absolute http", "http://evil.com/x"],
    ["backslash trick", "/\\evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["no leading slash", "evil.com"],
    ["empty", ""],
    ["null", null],
  ])("falls back to /dashboard for %s", (_name, raw) => {
    expect(safeReturnTo(raw)).toBe("/dashboard");
  });
});

describe("exchangeCode", () => {
  it("posts the code to the HCA token endpoint and returns the access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "idntk.abc", token_type: "Bearer" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeCode("the-code")).resolves.toEqual({ accessToken: "idntk.abc" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://auth.hackclub.com/oauth/token");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("redirect_uri")).toBe(REDIRECT);
    expect(body.get("client_id")).toBe(CLIENT_ID);
    expect(body.get("client_secret")).toBe(CLIENT_SECRET);
  });

  it("throws on a non-200 response without leaking the client secret", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(`{"error":"invalid_grant"}`, { status: 400 })),
    );
    const error = await exchangeCode("bad").catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(CLIENT_SECRET);
  });

  it("throws when the response has no access_token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    );
    await expect(exchangeCode("x")).rejects.toThrow();
  });
});

describe("fetchUserinfo", () => {
  it("sends the bearer token and returns the profile", async () => {
    const profile = { sub: "ident!abc", email: "a@example.com", name: "Ada" };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUserinfo("idntk.abc")).resolves.toEqual(profile);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://auth.hackclub.com/oauth/userinfo");
    expect(init.headers.Authorization).toBe("Bearer idntk.abc");
  });

  it("throws on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(fetchUserinfo("bad")).rejects.toThrow();
  });

  it("throws when the profile has no sub or email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "x" }), { status: 200 })),
    );
    await expect(fetchUserinfo("t")).rejects.toThrow();
  });
});
