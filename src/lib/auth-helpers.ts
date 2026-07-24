import type { UserRole } from "@/lib/types"
import { NextResponse } from "next/server"

// Role hierarchy: staff < manager < admin
const ROLE_LEVELS: Record<UserRole, number> = {
  staff: 1,
  manager: 2,
  admin: 3,
}

// Demo session - no next-auth dependency
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

const DEMO_SESSION: AuthSession = {
  user: {
    id: "demo-admin-001",
    email: "admin@hertzmalta.com",
    name: "Hertz Admin",
    role: "admin",
  },
  expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
}

export async function getServerSession(): Promise<AuthSession | null> {
  return DEMO_SESSION
}

export async function requireAuth(): Promise<AuthSession> {
  return DEMO_SESSION
}

export async function requireRole(
  minRole: "staff" | "manager" | "admin"
): Promise<AuthSession> {
  return DEMO_SESSION
}

export async function hasRole(
  minRole: "staff" | "manager" | "admin"
): Promise<boolean> {
  return true
}

export function authErrorResponse(error: AuthError) {
  return NextResponse.json(
    { error: error.message },
    { status: error.statusCode }
  )
}

export class AuthError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number = 401) {
    super(message)
    this.name = "AuthError"
    this.statusCode = statusCode
  }
}
