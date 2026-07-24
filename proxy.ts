import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// In Next.js 16, "middleware" è stato rinominato in "proxy"
export function proxy(request: NextRequest) {
  // Qui in futuro inserirai logiche di auth, rate limiting o redirects.
  // Per ora, lasciamo passare la richiesta.
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
