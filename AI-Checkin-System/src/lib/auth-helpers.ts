import { auth } from "@/lib/auth"
import type { UserRole } from "@/lib/types"
import { NextResponse } from "next/server"

// Role hierarchy: staff < manager < admin
const ROLE_LEVELS: Record<UserRole, number> = {
  staff: 1,
  manager: 2,
  admin: 3,
}

// Typed session with user role
type SessionUser = {
  id: string
  email: string
  name: string
  role: UserRole
}

export type AuthSession = {
  user: SessionUser
  expires: string
}

/**
 * Get the current server-side session with typed user role.
 * Returns null if not authenticated.
 */
export async function getServerSession(): Promise<AuthSession | null> {
  const session = await auth()
  if (!session?.user) {
    return null
  }
  return session as unknown as AuthSession
}

/**
 * Require authentication. Throws a 401 error if no session.
 * Use in API route handlers and server components.
 */
export async function requireAuth(): Promise<AuthSession> {
  const session = await getServerSession()
  if (!session) {
    throw new AuthError("Authentication required", 401)
  }
  return session
}

/**
 * Require a minimum role level. Throws 403 if role is insufficient.
 * Hierarchy: staff < manager < admin
 */
export async function requireRole(
  minRole: "staff" | "manager" | "admin"
): Promise<AuthSession> {
  const session = await requireAuth()
  const userLevel = ROLE_LEVELS[session.user.role]
  const requiredLevel = ROLE_LEVELS[minRole]

  if (userLevel < requiredLevel) {
    throw new AuthError(
      `Insufficient permissions. Required: ${minRole}, got: ${session.user.role}`,
      403
    )
  }

  return session
}

/**
 * Check if a session has the given role or higher.
 * Returns false if not authenticated or insufficient role.
 */
export async function hasRole(
  minRole: "staff" | "manager" | "admin"
): Promise<boolean> {
  try {
    await requireRole(minRole)
    return true
  } catch {
    return false
  }
}

/**
 * Create a JSON error response for auth failures.
 */
export function authErrorResponse(error: AuthError) {
  return NextResponse.json(
    { error: error.message },
    { status: error.statusCode }
  )
}

// Custom error class for authentication/authorization
export class AuthError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number = 401) {
    super(message)
    this.name = "AuthError"
    this.statusCode = statusCode
  }
}
