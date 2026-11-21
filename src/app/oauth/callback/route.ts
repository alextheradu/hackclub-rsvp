import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  checkState,
  exchangeCode,
  fetchUserinfo,
  safeReturnTo,
} from "@/lib/hca";
import { onFirstLogin } from "@/lib/organizer-invite";
import { clientIp, hit, tooManyRequests } from "@/lib/ratelimit";
import { signSession } from "@/lib/session";
import { fetchSlackAvatar } from "@/lib/slack";
import { upsertUser } from "@/lib/users";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export async function GET(request: Request) {
  if (!(await hit(`callback:ip:${clientIp(request)}`, 20, 60)).allowed) {
    return tooManyRequests();
  }
  const store = await cookies();
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");

  const params = new URL(request.url).searchParams;
  if (!checkState(store.get("hca_state")?.value, params.get("state"))) {
    return new Response("Invalid state", { status: 400 });
  }
  // One try per state, so a failed login can't be replayed with made-up codes.
  store.delete("hca_state");
  if (params.get("error")) {
    store.delete("hca_state");
    store.delete("hca_return_to");
    redirect("/");
  }
  const code = params.get("code");
  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  let uid: number;
  let slackId: string | undefined;
  let isNew: boolean;
  try {
    const { accessToken } = await exchangeCode(code);
    const profile = await fetchUserinfo(accessToken);
    const avatarUrl = await fetchSlackAvatar(profile.slack_id);
    ({ id: uid, isNew } = await upsertUser(profile, avatarUrl));
    slackId = profile.slack_id;
  } catch (error) {
    console.error(
      "login failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return new Response("Login failed", { status: 502 });
  }

  // A missed invite shouldn't block signing in.
  try {
    await onFirstLogin({ id: uid, isNew }, slackId);
  } catch (error) {
    console.error(
      "organizer invite enqueue failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  const returnTo = safeReturnTo(store.get("hca_return_to")?.value ?? null);
  store.delete("hca_return_to");
  store.set("session", signSession({ uid }, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect(returnTo);
}
