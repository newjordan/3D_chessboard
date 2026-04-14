import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return NextResponse.next();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-internal-secret", secret);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  // All /api/* except NextAuth routes (handled internally by Next.js)
  matcher: "/api/((?!auth).*)",
};
