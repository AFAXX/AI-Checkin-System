import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Lightweight middleware - no NextAuth dependency to avoid env var issues
// Auth is handled client-side with the demo mode
export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Log for demo visibility
  console.log(`[Middleware] ${pathname}`)

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
