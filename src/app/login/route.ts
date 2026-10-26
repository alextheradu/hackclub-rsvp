import {randomBytes} from "crypto";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {buildAuthorizeUrl} from "../../lib/hca";
import {safeReturnTo} from "../../lib/hca";

export async function GET(request: Request) {
    const returnTo = new URL(request.url).searchParams.get("returnTo");
    const state = randomBytes(32).toString("base64url");
    const store = await cookies();
    store.set("hca_state", state, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 600, // 10 minutes
    });
    redirect(buildAuthorizeUrl(state));
}