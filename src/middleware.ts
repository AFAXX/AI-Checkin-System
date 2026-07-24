import { NextResponse } from "next/server"

// Simplified middleware — no next-auth dependency.
// Auth is handled client-side via localStorage demo.
export default function middleware(request: Request) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
