import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { db } from "@/lib/db"
import type { UserRole } from "@/lib/types"

// Type Extensions for next-auth v5

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: UserRole
    }
  }
  interface User {
    role: UserRole
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    email: string
    name: string
    role: UserRole
  }
}

// NextAuth v5 Configuration

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  providers: [
    Credentials({
      name: "Hertz Malta Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "staff@hertzmalta.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || typeof credentials.email !== "string") {
          return null
        }

        const user = await db.staffUser.findUnique({
          where: { email: credentials.email },
        })

        if (!user) {
          return null
        }

        if (!user.isActive) {
          return null
        }

        if (!credentials.password || typeof credentials.password !== "string") {
          return null
        }

        await db.staffUser.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          role: user.role,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.role = (user as unknown as { role: UserRole }).role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.role = token.role as UserRole
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "hertz-malta-demo-secret-change-in-production",
})
