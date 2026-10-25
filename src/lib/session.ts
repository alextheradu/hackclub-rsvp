import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sign(secret: string, signedPart: string): Buffer {
  return createHmac("sha256", secret).update(signedPart).digest();
}

export function signSession(
  payload: { uid: number },
  secret: string,
  now = Date.now(),
): string {
  const payloadSegment = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const expiresAt = now + SESSION_TTL_MS;
  const signature = sign(secret, `${payloadSegment}.${expiresAt}`).toString("base64url");
  return `${payloadSegment}.${expiresAt}.${signature}`;
}

export function verifySession(
  token: string,
  secret: string,
  now = Date.now(),
): { uid: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [payloadSegment, expiry, signature] = parts;

  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || now >= expiresAt) return null;

  const expected = sign(secret, `${payloadSegment}.${expiry}`);
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(
      Buffer.from(payloadSegment, "base64url").toString("utf8"),
    );
    if (
      typeof payload === "object" &&
      payload !== null &&
      "uid" in payload &&
      typeof payload.uid === "number"
    ) {
      return { uid: payload.uid };
    }
  } catch {
  }
  return null;
}
