import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {checkState, exchangeCode, fetchUserinfo, safeReturnTo} from "@/lib/hca";
import {signSession} from "@/lib/session";
import {upsertUser} from "@/lib/users";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export async function GET(request: Request) {
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error("SESSION_SECRET is not set");

    const params = new URL(request.url).searchParams;
    const store = await cookies();
    if (!checkState(store.get("hca_state")?.value, params.get("state"))) {
        return new Response("Invalid state", {status: 400});
    }
    if (params.get("error")) {
        store.delete("hca_state");
        store.delete("hca_return_to");
        redirect("/");
    }
    const code = params.get("code");
    if (!code) {
        return new Response("Missing code", {status: 400});
    }

    let uid: number;
    try {
        const {accessToken} = await exchangeCode(code);
        const profile = await fetchUserinfo(accessToken);
        uid = (await upsertUser(profile)).id;
    } catch (error) {
        console.error("login failed:", error instanceof Error ? error.message : "unknown error");
        return new Response("Login failed", {status: 502});
    }

    const returnTo = safeReturnTo(store.get("hca_return_to")?.value ?? null);
    store.delete("hca_state");
    store.delete("hca_return_to");
    store.set("session", signSession({uid}, secret), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_MAX_AGE,
    });
    redirect(returnTo);
}
