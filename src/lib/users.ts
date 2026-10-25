import type { HcaProfile } from "@/lib/hca";

export async function upsertUser(
  profile: HcaProfile,
): Promise<{ id: number; isNew: boolean }> {
  throw new Error("not implemented");
}
