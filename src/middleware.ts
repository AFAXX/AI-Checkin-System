import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Middleware: resolves tenant from subdomain or query param.
// Sets x-tenant-slug header for API routes to pick up.
export default function middleware(request: NextRequest) {
  const url = request.nextUrl
  const response = NextResponse.next()

  // 1. Check subdomain: e.g. hertz-malta.app.example.com
  const hostname = request.headers.get('host') || ''
  const parts = hostname.split('.')
  if (parts.length > 2) {
    // First part is subdomain (skip www)
    const subdomain = parts[0]
    if (subdomain && subdomain !== 'www' && subdomain !== 'app') {
      response.headers.set('x-tenant-slug', subdomain)
      return response
    }
  }

  // 2. Check /t/[slug] path prefix: e.g. /t/hertz-malta/dashboard
  const pathMatch = url.pathname.match(/^\/t\/([a-z0-9-]+)(\/|$)/)
  if (pathMatch) {
    const slug = pathMatch[1]
    response.headers.set('x-tenant-slug', slug)

    // Rewrite to strip the /t/[slug] prefix so Next.js routes work unchanged
    const newPath = url.pathname.replace(/^\/t\/[a-z0-9-]+/, '') || '/'
    return NextResponse.rewrite(new URL(newPath + url.search, request.url))
  }

  // 3. Default: let tenant helper fall back to 'hertz-malta'
  return response
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
