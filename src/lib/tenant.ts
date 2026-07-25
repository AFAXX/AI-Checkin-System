// ─── Tenant Helper ───────────────────────────────────────────────────────────
// Resolves current tenant from headers (set by middleware) or defaults to
// 'hertz-malta' for local dev.

import { headers } from 'next/headers'
import { db } from '@/lib/db'
import type { Tenant } from './types'

let _defaultTenant: Tenant | null = null

export async function getCurrentTenant(): Promise<Tenant> {
  const headersList = await headers()
  const slug = headersList.get('x-tenant-slug') || 'hertz-malta'

  // Cache the default tenant lookup
  if (slug === 'hertz-malta' && _defaultTenant) return _defaultTenant

  const tenant = await db.tenant.findUnique({ where: { slug } })

  if (!tenant) {
    throw new Error(`Tenant not found: ${slug}`)
  }

  if (slug === 'hertz-malta') _defaultTenant = tenant
  return tenant
}

export async function getCurrentTenantId(): Promise<string> {
  const tenant = await getCurrentTenant()
  return tenant.id
}
