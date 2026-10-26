import { timingSafeEqual } from "crypto";

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
  throw new Error("not implemented");
}

export function checkState(
  cookie: string | undefined,
  param: string | null,
): boolean {
  if (!cookie || !param) return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(param);
  if( a.length !== b.length) return false;
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
  throw new Error("not implemented");
}

export async function fetchUserinfo(accessToken: string): Promise<HcaProfile> {
  throw new Error("not implemented");
}
