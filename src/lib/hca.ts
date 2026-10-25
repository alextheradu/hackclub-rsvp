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

export function checkState(cookie: string | undefined, param: string | null): boolean {
  throw new Error("not implemented");
}

export function safeReturnTo(raw: string | null): string {
  throw new Error("not implemented");
}

export async function exchangeCode(code: string): Promise<{ accessToken: string }> {
  throw new Error("not implemented");
}

export async function fetchUserinfo(accessToken: string): Promise<HcaProfile> {
  throw new Error("not implemented");
}
