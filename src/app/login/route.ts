import {randomBytes} from "node:crypto";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {buildAuthorizeUrl, safeReturnTo} from "@/lib/hca";

export async function GET(request: Request) {
    const store = await cookies();
    const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
    const state = randomBytes(32).toString("base64url");
    const cookieOptions = {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 600, // 10 minutes
    } as const;
    store.set("hca_state", state, cookieOptions);
    store.set("hca_return_to", returnTo, cookieOptions);
    redirect(buildAuthorizeUrl(state));
}
