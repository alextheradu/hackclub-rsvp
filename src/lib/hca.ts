import { timingSafeEqual } from "node:crypto";

const TOKEN_URL = "https://auth.hackclub.com/oauth/token";
const AUTHORIZE_URL = "https://auth.hackclub.com/oauth/authorize";
const SCOPE = "openid profile email name slack_id verification_status";

export type HcaProfile = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  nickname?: string;
  slack_id?: string;
  verification_status?: string;
  ysws_eligible?: boolean;
};

export function buildAuthorizeUrl(state: string): string {
  const clientId = process.env.HCA_CLIENT_ID;
  const redirectUri = process.env.HCA_REDIRECT_URI;
  if (!clientId || !redirectUri)
    throw new Error("HCA_CLIENT_ID and HCA_REDIRECT_URI must be set");
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export function checkState(
  cookie: string | undefined,
  param: string | null,
): boolean {
  if (!cookie || !param) return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(param);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function safeReturnTo(raw: string | null): string {
  if (raw == null || !raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  if (/[\u0000-\u001F\u007F]/.test(raw)) return "/dashboard";
  return raw;
}

export async function exchangeCode(
  code: string,
): Promise<{ accessToken: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.HCA_CLIENT_ID ?? "",
      client_secret: process.env.HCA_CLIENT_SECRET ?? "",
      redirect_uri: process.env.HCA_REDIRECT_URI ?? "",
    }),
  });
  if (!res.ok) {
    throw new Error(`HCA token exchange failed with status ${res.status}`);
  }
  const data = await res.json();
  if (typeof data.access_token !== "string") {
    throw new Error("HCA token response had no access_token");
  }
  return { accessToken: data.access_token };
}

export async function fetchUserinfo(accessToken: string): Promise<HcaProfile> {
  const res = await fetch("https://auth.hackclub.com/oauth/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(`HCA userinfo fetch failed with status ${res.status}`);
  }
  const data = await res.json();
  if (typeof data.sub !== "string") {
    throw new Error("HCA userinfo response had no sub");
  }
  return data as HcaProfile;
}
