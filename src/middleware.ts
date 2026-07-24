import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

  // Public routes that don't require authentication
  const publicRoutes = ["/", "/api/auth-handler"]
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route))

  // API routes for auth are always allowed
  if (pathname.startsWith("/api/auth-handler")) {
    return NextResponse.next()
  }

  // Log auth status for demo visibility (permissive mode for sandbox)
  console.log(`[Auth Middleware] ${pathname} | authenticated: ${isLoggedIn}`)

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
