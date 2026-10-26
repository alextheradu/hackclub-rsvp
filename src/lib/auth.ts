import { verifySession } from "@/lib/session";
import { getPool } from "./db";
import { cookies } from "next/headers";

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
  if (!token) return null;
  const session = await verifySession(token, secret, now);
  if (!session) return null;
  const { rows } = await getPool().query(
    `
      SELECT id, hca_id, email, name, slack_id, ysws_eligible
      FROM users
      WHERE id = $1
    `,
    [session.uid],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: Number(row.id),
    hcaId: row.hca_id,
    email: row.email,
    name: row.name,
    slackId: row.slack_id,
    yswsEligible: row.ysws_eligible,
  };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return userFromSessionToken(store.get("session")?.value, secret);
}
