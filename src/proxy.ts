import { NextResponse, type NextRequest } from "next/server";
import { rewriteTarget } from "@/lib/hosts";

export function proxy(request: NextRequest) {
  const target = rewriteTarget(request.headers.get("host") ?? "", request.nextUrl.pathname);
  if (!target) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
