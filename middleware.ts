import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  // /llm is intentionally public — see the auth-removal comments on
  // src/app/llm/page.tsx, src/app/api/ai/health/route.ts, and the
  // context === "knowledge" branch of src/app/api/ai/assist/route.ts.
  matcher: ["/new/:path*", "/admin/:path*"],
};
