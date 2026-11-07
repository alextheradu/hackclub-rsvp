import { afterEach, describe, expect, it, vi } from "vitest";
import { checkEligibility } from "@/lib/eligibility";

function hcaReplies(body: unknown, status = 200) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkEligibility", () => {
  it("asks HCA's public check endpoint by slack_id", async () => {
    const fetchMock = hcaReplies({ result: "verified_eligible" });
    await checkEligibility("U0ADA");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://auth.hackclub.com/api/external/check?slack_id=U0ADA",
    );
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("maps verified_eligible to eligible", async () => {
    hcaReplies({ result: "verified_eligible" });
    await expect(checkEligibility("U0ADA")).resolves.toBe("eligible");
  });

  it.each(["verified_but_over_18", "rejected", "needs_submission", "pending"])(
    "maps %s to not_eligible",
    async (result) => {
      hcaReplies({ result });
      await expect(checkEligibility("U0ADA")).resolves.toBe("not_eligible");
    },
  );

  it.each(["not_found", "unknown", "something_new"])(
    "maps %s to unknown",
    async (result) => {
      hcaReplies({ result });
      await expect(checkEligibility("U0ADA")).resolves.toBe("unknown");
    },
  );

  it("treats a body without a result string as unknown", async () => {
    hcaReplies({ nope: true });
    await expect(checkEligibility("U0ADA")).resolves.toBe("unknown");
  });

  it("throws on a network failure so the outbox retries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(checkEligibility("U0ADA")).rejects.toThrow();
  });

  it("throws on a 5xx so the outbox retries", async () => {
    hcaReplies({}, 503);
    await expect(checkEligibility("U0ADA")).rejects.toThrow();
  });

  it("encodes the Slack ID in the query string", async () => {
    const fetchMock = hcaReplies({ result: "not_found" });
    await checkEligibility("U0&x=1");
    const [url] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("slack_id")).toBe("U0&x=1");
  });
});
