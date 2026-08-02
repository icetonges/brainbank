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
  //
  // /diary and /assistant are owner-only in full: unlike the classroom
  // (public read, private edit), there is no anonymous view of either.
  // Each page also checks the session itself and redirects — this matcher
  // is the outer layer of that defense in depth, not the only one.
  matcher: ["/admin/:path*", "/diary/:path*", "/assistant/:path*"],
};
