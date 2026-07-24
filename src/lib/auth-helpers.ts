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
 * In demo mode, returns null (auth is client-side via localStorage).
 */
export async function getServerSession(): Promise<AuthSession | null> {
  // Demo mode: no server-side auth
  return null
}

/**
 * Require authentication. Throws a 401 error if no session.
 * In demo mode, always returns a default session.
 */
export async function requireAuth(): Promise<AuthSession> {
  // Demo mode: allow all access
  return {
    user: {
      id: 'demo',
      email: 'demo@hertzmalta.com',
      name: 'Demo User',
      role: 'admin',
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  }
}

/**
 * Require a minimum role level.
 * In demo mode, always passes.
 */
export async function requireRole(
  minRole: "staff" | "manager" | "admin"
): Promise<AuthSession> {
  return requireAuth()
}

/**
 * Check if a session has the given role or higher.
 */
export async function hasRole(
  minRole: "staff" | "manager" | "admin"
): Promise<boolean> {
  return true
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
