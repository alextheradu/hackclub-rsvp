import { q, sql } from "@/lib/db";
import { HcaProfile } from "./hca";

export async function upsertUser(
  profile: HcaProfile,
  avatarUrl: string | null = null,
): Promise<{ id: number; isNew: boolean }> {
  const row = await q().one<{ id: string; is_new: boolean }>(sql`
    INSERT INTO users
        (hca_id, email, email_verified, name, given_name, family_name, nickname, slack_id, avatar_url, verification_status, ysws_eligible, last_login_at)
        VALUES (${profile.sub}, ${profile.email}, ${profile.email_verified}, ${profile.name},
                ${profile.given_name}, ${profile.family_name}, ${profile.nickname}, ${profile.slack_id}, ${avatarUrl},
                ${profile.verification_status}, ${profile.ysws_eligible}, NOW())
        ON CONFLICT (hca_id) DO UPDATE SET
          email = EXCLUDED.email,
          email_verified = EXCLUDED.email_verified,
          name = EXCLUDED.name,
          given_name = EXCLUDED.given_name,
          family_name = EXCLUDED.family_name,
          nickname = EXCLUDED.nickname,
          slack_id = EXCLUDED.slack_id,
          avatar_url = CASE WHEN EXCLUDED.slack_id IS NULL THEN NULL
                            ELSE COALESCE(EXCLUDED.avatar_url, users.avatar_url) END,
          verification_status = EXCLUDED.verification_status,
          ysws_eligible = EXCLUDED.ysws_eligible,
          last_login_at = NOW(),
          updated_at = NOW()
        RETURNING id, (xmax = 0) AS is_new`);
  return { id: Number(row.id), isNew: row.is_new };
}
