export type RsvpButtonState =
  | "cancelled"
  | "closed"
  | "confirmed"
  | "waitlisted"
  | "signed_out"
  | "full"
  | "open";

export type RsvpButtonInput = {
  cancelled: boolean;
  startsAt: Date;
  endsAt: Date | null;
  capacity: number | null;
  confirmedCount: number;
  myStatus: "confirmed" | "waitlisted" | null;
  signedIn: boolean;
  now: Date;
};

export function rsvpButtonState(input: RsvpButtonInput): RsvpButtonState {
  if (input.cancelled) return "cancelled";
  if (input.myStatus) return input.myStatus;

  const end = input.endsAt ?? input.startsAt;
  if (input.now > end) return "closed";

  if (!input.signedIn) return "signed_out";
  const isFull = input.capacity !== null && input.confirmedCount >= input.capacity;
  return isFull ? "full" : "open";
}
