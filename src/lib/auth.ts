export type CurrentUser = {
  id: number;
  hcaId: string;
  email: string;
  name: string | null;
  slackId: string | null;
  yswsEligible: boolean | null;
};

export async function userFromSessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<CurrentUser | null> {
  throw new Error("not implemented");
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  throw new Error("not implemented");
}
