export type RsvpStatus = "confirmed" | "waitlisted" | "cancelled";

export function decideStatus(input: {
  capacity: number | null;
  confirmedCount: number;
}): "confirmed" | "waitlisted" {
  if (input.capacity === null) {
    return "confirmed";
  }
  return input.confirmedCount < input.capacity ? "confirmed" : "waitlisted";
}

export function promotionCount(input: {
  capacity: number | null;
  confirmedCount: number;
  waitlistedCount: number;
}): number {
  if (input.capacity === null) return input.waitlistedCount;
  const freeSeats = Math.max(0, input.capacity - input.confirmedCount);
  return Math.min(freeSeats, input.waitlistedCount);
}
