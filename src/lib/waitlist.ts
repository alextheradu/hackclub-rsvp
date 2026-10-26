export type RsvpStatus = "confirmed" | "waitlisted" | "cancelled";

export function decideStatus(input: {
  capacity: number | null;
  confirmedCount: number;
}): "confirmed" | "waitlisted" {
  throw new Error("not implemented");
}

export function promotionCount(input: {
  capacity: number | null;
  confirmedCount: number;
  waitlistedCount: number;
}): number {
  throw new Error("not implemented");
}
