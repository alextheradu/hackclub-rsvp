import { getPool } from "@/lib/db";
import { HcaProfile } from "./hca";

export async function upsertUser(
  profile: HcaProfile,
): Promise<{ id: number; isNew: boolean }> {
  const { rows } = await getPool().query(
    `INSERT INTO users 
        (hca_id, email, email_verified, name, given_name, family_name, nickname, slack_id, verification_status, ysws_eligible, last_login_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (hca_id) DO UPDATE SET
          email = EXCLUDED.email,
          email_verified = EXCLUDED.email_verified,
          name = EXCLUDED.name,
          given_name = EXCLUDED.given_name,
          family_name = EXCLUDED.family_name,
          nickname = EXCLUDED.nickname,
          slack_id = EXCLUDED.slack_id,
          verification_status = EXCLUDED.verification_status,
          ysws_eligible = EXCLUDED.ysws_eligible,
          last_login_at = NOW(),
          updated_at = NOW()
        RETURNING id, (xmax = 0) AS is_new`,
    [
      profile.sub,
      profile.email,
      profile.email_verified,
      profile.name,
      profile.given_name,
      profile.family_name,
      profile.nickname,
      profile.slack_id,
      profile.verification_status,
      profile.ysws_eligible,
    ],
  );
  return { id: rows[0].id, isNew: rows[0].is_new };
}