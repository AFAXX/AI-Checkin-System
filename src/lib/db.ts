// ─── In-Memory Database ───────────────────────────────────────────────────────
// Drop-in replacement for Prisma Client. Works on ANY deployment platform
// (Vercel, Netlify, Docker, VPS, etc.) without needing an external database.
// Now with file-based persistence layer.

import type {
  StaffUser, Contract, CheckinVideo, DamageReport, DamageComparison,
  UserRole, VideoKind, VideoStatus,
} from './types'

// ─── UUID Generator ──────────────────────────────────────────────────────────

function cuid(): string {
  return crypto.randomUUID()
}

// ─── In-Memory Store ─────────────────────────────────────────────────────────

const staffUsers: Map<string, StaffUser> = new Map()
const contracts: Map<string, Contract> = new Map()
const checkinVideos: Map<string, CheckinVideo> = new Map()
const damageReports: Map<string, DamageReport> = new Map()
const damageComparisons: Map<string, DamageComparison> = new Map()

// ─── Persistence Layer ──────────────────────────────────────────────────────
// Saves to /tmp/hertz-db.json on every write. Loads on first access.
// On Vercel serverless, this persists within warm function instances.
// For true cross-redeploy persistence, use Vercel KV/Postgres.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const DB_FILE = '/tmp/hertz-db.json'

function saveToDisk() {
  try {
    const data = {
      staffUsers: [...staffUsers.entries()].map(([k, v]) => [k, serialize(v)]),
      contracts: [...contracts.entries()].map(([k, v]) => [k, serialize(v)]),
      checkinVideos: [...checkinVideos.entries()].map(([k, v]) => [k, serialize(v)]),
      damageReports: [...damageReports.entries()].map(([k, v]) => [k, serialize(v)]),
      damageComparisons: [...damageComparisons.entries()].map(([k, v]) => [k, serialize(v)]),
    }
    writeFileSync(DB_FILE, JSON.stringify(data), 'utf-8')
  } catch (e) {
    // Silently fail on read-only filesystems
  }
}

function serialize(item: any): any {
  const result: any = {}
  for (const [key, value] of Object.entries(item)) {
    if (value instanceof Date) {
      result[key] = { __type: 'Date', value: value.toISOString() }
    } else if (Array.isArray(value)) {
      result[key] = value.map(serialize)
    } else if (value && typeof value === 'object' && !(value instanceof Date)) {
      // Don't serialize relation fields (they're computed at query time)
      if (['inspections', 'comparisons', 'contract', 'recordedBy', 'damageReport',
           'checkinVideo', 'pickupReport', 'returnReport', 'reviewedBy', '_count'].includes(key)) {
        continue
      }
      result[key] = value
    } else {
      result[key] = value
    }
  }
  return result
}

function deserialize(item: any): any {
  const result: any = {}
  for (const [key, value] of Object.entries(item)) {
        if (value && typeof value === 'object' && '__type' in value) {
      if (value.__type === 'Date') {
        result[key] = new Date(value.value)
      }
    }
      result[key] = value
    }
  }
  return result
}

function loadFromDisk(): boolean {
  try {
    if (!existsSync(DB_FILE)) return false
    const raw = readFileSync(DB_FILE, 'utf-8')
    const data = JSON.parse(raw)
    if (data.staffUsers) data.staffUsers.forEach(([k, v]: [string, any]) => staffUsers.set(k, deserialize(v)))
    if (data.contracts) data.contracts.forEach(([k, v]: [string, any]) => contracts.set(k, deserialize(v)))
    if (data.checkinVideos) data.checkinVideos.forEach(([k, v]: [string, any]) => checkinVideos.set(k, deserialize(v)))
    if (data.damageReports) data.damageReports.forEach(([k, v]: [string, any]) => damageReports.set(k, deserialize(v)))
    if (data.damageComparisons) data.damageComparisons.forEach(([k, v]: [string, any]) => damageComparisons.set(k, deserialize(v)))
    return true
  } catch (e) {
    return false
  }
}

// ─── Query Helpers ──────────────────────────────────────────────────────────

function applyIncludes<T extends Record<string, any>>(
  item: T,
  include: Record<string, any> | undefined,
  context: 'staffUser' | 'contract' | 'checkinVideo' | 'damageReport' | 'damageComparison'
): T {
  if (!include) return item
  const result = { ...item }

  if (context === 'staffUser') {
    const user = result as unknown as StaffUser
    if (include.inspections) {
      result.inspections = [...checkinVideos.values()]
        .filter(v => v.recordedById === user.id)
        .map(v => applyIncludes(v, include.inspections === true ? {} : include.inspections, 'checkinVideo')) as any
    }
    if (include.reviews) {
      result.reviews = [...damageComparisons.values()]
        .filter(c => c.reviewedById === user.id) as any
    }
    if (include._count) {
      result._count = {
        inspections: [...checkinVideos.values()].filter(v => v.recordedById === user.id).length,
      }
    }
  }

  if (context === 'contract') {
    const contract = result as unknown as Contract
    if (include.inspections) {
      const vids = [...checkinVideos.values()]
        .filter(v => v.contractId === contract.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      result.inspections = vids.map(v => {
        const r = { ...v }
        if (include.inspections === true) return r
        if (include.inspections.damageReport) {
          r.damageReport = [...damageReports.values()].find(dr => dr.checkinVideoId === v.id) || null
        }
        if (include.inspections.recordedBy) {
          r.recordedBy = staffUsers.get(v.recordedById || '') || undefined
        }
        return r
      }) as any
    }
    if (include.comparisons) {
      const comps = [...damageComparisons.values()]
        .filter(c => c.contractId === contract.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, include.comparisons.take || 999)
      result.comparisons = comps.map(c => {
        const r = { ...c }
        if (include.comparisons === true) return r
        if (include.comparisons.pickupReport) r.pickupReport = damageReports.get(c.pickupReportId)
        if (include.comparisons.returnReport) r.returnReport = damageReports.get(c.returnReportId)
        if (include.comparisons.reviewedBy) r.reviewedBy = staffUsers.get(c.reviewedById || '') || undefined
        return r
      }) as any
    }
  }

  if (context === 'checkinVideo') {
    const video = result as unknown as CheckinVideo
    if (include.damageReport) {
      result.damageReport = [...damageReports.values()].find(dr => dr.checkinVideoId === video.id) || null
    }
    if (include.contract) {
      const c = contracts.get(video.contractId)
      if (c && include.contract !== true) {
        const contractResult = { ...c }
        if (include.contract.inspections) {
          contractResult.inspections = [...checkinVideos.values()]
            .filter(v => v.contractId === c.id)
            .map(v => {
              const vr = { ...v }
              if (include.contract.inspections.damageReport) {
                vr.damageReport = [...damageReports.values()].find(dr => dr.checkinVideoId === v.id) || null
              }
              return vr
            })
        }
        if (include.contract.comparisons) {
          contractResult.comparisons = [...damageComparisons.values()]
            .filter(cmp => cmp.contractId === c.id)
        }
        result.contract = contractResult as any
      } else {
        result.contract = c || undefined
      }
    }
    if (include.recordedBy) {
      result.recordedBy = staffUsers.get(video.recordedById || '') || undefined
    }
  }

  if (context === 'damageReport') {
    const report = result as unknown as DamageReport
    if (include.checkinVideo) {
      result.checkinVideo = checkinVideos.get(report.checkinVideoId) || undefined
    }
  }

  if (context === 'damageComparison') {
    const cmp = result as unknown as DamageComparison
    if (include.contract) {
      result.contract = contracts.get(cmp.contractId) || undefined
    }
    if (include.pickupReport) {
      result.pickupReport = damageReports.get(cmp.pickupReportId) || undefined
    }
    if (include.returnReport) {
      result.returnReport = damageReports.get(cmp.returnReportId) || undefined
    }
    if (include.reviewedBy) {
      result.reviewedBy = staffUsers.get(cmp.reviewedById || '') || undefined
    }
  }

  return result
}

function matchesWhere(item: Record<string, any>, where: Record<string, any> | undefined): boolean {
  if (!where) return true

  for (const [key, value] of Object.entries(where)) {
    if (key === 'OR') {
      const orConditions = value as Record<string, any>[]
      if (!orConditions.some(cond => matchesWhere(item, cond))) return false
      continue
    }
    if (key === 'AND') {
      const andConditions = value as Record<string, any>[]
      if (!andConditions.every(cond => matchesWhere(item, cond))) return false
      continue
    }
    if (key === 'NOT') {
      if (matchesWhere(item, value as Record<string, any>)) return false
      continue
    }

    const itemValue = item[key]

    if (value === null || value === undefined) {
      if (itemValue !== null && itemValue !== undefined) return false
      continue
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      if ('contains' in value) {
        const str = (itemValue as string) || ''
        const mode = (value as any).mode
        if (mode === 'insensitive') {
          if (!str.toLowerCase().includes((value as any).contains.toLowerCase())) return false
        } else {
          if (!str.includes((value as any).contains)) return false
        }
        continue
      }
      if ('startsWith' in value) {
        const str = (itemValue instanceof Date ? itemValue.toISOString() : String(itemValue || ''))
        if (!str.startsWith((value as any).startsWith)) return false
        continue
      }
      if ('gte' in value) {
        if (!(itemValue >= (value as any).gte)) return false
        continue
      }
      if ('gt' in value) {
        if (!(itemValue > (value as any).gt)) return false
        continue
      }
      if ('lte' in value) {
        if (!(itemValue <= (value as any).lte)) return false
        continue
      }
      if ('lt' in value) {
        if (!(itemValue < (value as any).lt)) return false
        continue
      }
      if ('in' in value) {
        if (!(value as any).in.includes(itemValue)) return false
        continue
      }
      if ('some' in value) {
        const relationName = key
        const relatedItems = [...checkinVideos.values()].filter(v => v.contractId === item.id)
        if (!relatedItems.some(ri => matchesWhere(ri as any, (value as any).some))) return false
        continue
      }
      if (JSON.stringify(itemValue) !== JSON.stringify(value)) return false
      continue
    }

    if (itemValue !== value) return false
  }
  return true
}

function applyOrderBy<T>(items: T[], orderBy: Record<string, any> | undefined): T[] {
  if (!orderBy) return items
  const sorted = [...items]
  const keys = Object.keys(orderBy)
  for (const key of keys.reverse()) {
    const direction = orderBy[key] === 'desc' ? -1 : 1
    sorted.sort((a, b) => {
      const aVal = (a as any)[key]
      const bVal = (b as any)[key]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      if (aVal < bVal) return -1 * direction
      if (aVal > bVal) return 1 * direction
      return 0
    })
  }
  return sorted
}

// ─── Seed Data ───────────────────────────────────────────────────────────────

let seeded = false

function seed() {
  if (seeded) return
  seeded = true

  const now = new Date()
  const day = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000)

  // Staff Users
  const users: StaffUser[] = [
    {
      id: cuid(), entraOid: 'demo-staff-oid-001',
      email: 'staff@hertzmalta.com', displayName: 'Maria Borg',
      role: 'staff', locationCode: 'MLA', isActive: true,
      lastLoginAt: null, createdAt: day(-30), updatedAt: now,
    },
    {
      id: cuid(), entraOid: 'demo-manager-oid-002',
      email: 'manager@hertzmalta.com', displayName: 'Mark Vella',
      role: 'manager', locationCode: 'MLA', isActive: true,
      lastLoginAt: null, createdAt: day(-30), updatedAt: now,
    },
    {
      id: cuid(), entraOid: 'demo-admin-oid-003',
      email: 'admin@hertzmalta.com', displayName: 'Claire Farrugia',
      role: 'admin', locationCode: 'MLA', isActive: true,
      lastLoginAt: null, createdAt: day(-30), updatedAt: now,
    },
  ]
  users.forEach(u => staffUsers.set(u.id, u))

  // Contracts
  const contractData = [
    {
      reservationNumber: 'RES-2024-001', customerName: 'John Smith',
      customerEmail: 'john.smith@email.com', vehicleReg: 'MAL-001-A',
      vehicleModel: 'Toyota Corolla', pickupDate: day(-3), returnDate: day(4),
    },
    {
      reservationNumber: 'RES-2024-002', customerName: 'Sarah Johnson',
      customerEmail: 'sarah.j@email.com', vehicleReg: 'MAL-002-B',
      vehicleModel: 'VW Golf', pickupDate: day(-2), returnDate: day(5),
    },
    {
      reservationNumber: 'RES-2024-003', customerName: 'Luigi Rossi',
      customerEmail: 'luigi.rossi@email.com', vehicleReg: 'MAL-003-C',
      vehicleModel: 'Fiat 500', pickupDate: day(-1), returnDate: day(6),
    },
    {
      reservationNumber: 'RES-2024-004', customerName: 'Anna Bauer',
      customerEmail: 'anna.bauer@email.com', vehicleReg: 'MAL-004-D',
      vehicleModel: 'BMW 3 Series', pickupDate: day(-5), returnDate: day(2),
    },
    {
      reservationNumber: 'RES-2024-005', customerName: 'Pierre Dupont',
      customerEmail: 'pierre.dupont@email.com', vehicleReg: 'MAL-005-E',
      vehicleModel: 'Peugeot 208', pickupDate: day(-4), returnDate: day(3),
    },
  ]
  contractData.forEach(cd => {
    const c: Contract = {
      id: cuid(), ...cd, status: 'active', locationCode: 'MLA',
      createdAt: day(-7), updatedAt: now,
    }
    contracts.set(c.id, c)
  })
}

// Try to load persisted data first; if not found, seed fresh
const loaded = loadFromDisk()
if (!loaded) {
  seed()
}

// ─── Database Client ──────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV !== 'production'

function logQuery(msg: string) {
  if (isDev) console.log(`[MockDB] ${msg}`)
}

// Helper: persist after every write
function persist() {
  saveToDisk()
}

export const db = {
  // ─── StaffUser Model ─────────────────────────────────────────────────
  staffUser: {
    findUnique({ where, include }: { where: Record<string, any>; include?: Record<string, any> }) {
      logQuery(`staffUser.findUnique where=${JSON.stringify(where)}`)
      let user: StaffUser | undefined
      if (where.id) {
        user = staffUsers.get(where.id)
      } else if (where.email) {
        user = [...staffUsers.values()].find(u => u.email === where.email)
      }
      if (!user) return null
      return applyIncludes({ ...user }, include, 'staffUser')
    },

    findMany({ where, include, orderBy, take }: {
      where?: Record<string, any>; include?: Record<string, any>;
      orderBy?: Record<string, any>; take?: number
    } = {}) {
      logQuery(`staffUser.findMany`)
      let results = [...staffUsers.values()]
      if (where) results = results.filter(u => matchesWhere(u, where))
      results = applyOrderBy(results, orderBy)
      if (take) results = results.slice(0, take)
      return results.map(u => applyIncludes({ ...u }, include, 'staffUser'))
    },

    update({ where, data }: { where: Record<string, any>; data: Record<string, any> }) {
      logQuery(`staffUser.update where=${JSON.stringify(where)}`)
      let user: StaffUser | undefined
      if (where.id) user = staffUsers.get(where.id)
      if (!user) throw new Error('StaffUser not found')
      const updated = { ...user, ...data, updatedAt: new Date() }
      staffUsers.set(updated.id, updated)
      persist()
      return updated
    },

    create({ data }: { data: Record<string, any> }) {
      logQuery(`staffUser.create`)
      const now = new Date()
      const user: StaffUser = {
        id: data.id || cuid(),
        entraOid: data.entraOid || cuid(),
        email: data.email,
        displayName: data.displayName,
        role: data.role || 'staff',
        locationCode: data.locationCode || null,
        isActive: data.isActive ?? true,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      }
      staffUsers.set(user.id, user)
      persist()
      return user
    },
  },

  // ─── Contract Model ────────────────────────────────────────────────────
  contract: {
    findUnique({ where, include }: { where: Record<string, any>; include?: Record<string, any> }) {
      logQuery(`contract.findUnique where=${JSON.stringify(where)}`)
      let contract: Contract | undefined
      if (where.id) {
        contract = contracts.get(where.id)
      } else if (where.reservationNumber) {
        contract = [...contracts.values()].find(c => c.reservationNumber === where.reservationNumber)
      }
      if (!contract) return null
      return applyIncludes({ ...contract }, include, 'contract')
    },

    findMany({ where, include, orderBy, take }: {
      where?: Record<string, any>; include?: Record<string, any>;
      orderBy?: Record<string, any>; take?: number
    } = {}) {
      logQuery(`contract.findMany`)
      let results = [...contracts.values()]
      if (where) results = results.filter(c => matchesWhere(c, where))
      results = applyOrderBy(results, orderBy)
      if (take) results = results.slice(0, take)
      return results.map(c => applyIncludes({ ...c }, include, 'contract'))
    },

    findFirst({ where, include, orderBy }: {
      where?: Record<string, any>; include?: Record<string, any>;
      orderBy?: Record<string, any>
    } = {}) {
      logQuery(`contract.findFirst`)
      let results = [...contracts.values()]
      if (where) results = results.filter(c => matchesWhere(c, where))
      results = applyOrderBy(results, orderBy)
      const c = results[0]
      if (!c) return null
      return applyIncludes({ ...c }, include, 'contract')
    },

    count({ where }: { where?: Record<string, any> } = {}) {
      logQuery(`contract.count`)
      let results = [...contracts.values()]
      if (where) results = results.filter(c => matchesWhere(c, where))
      return results.length
    },

    create({ data }: { data: Record<string, any> }) {
      logQuery(`contract.create`)
      const now = new Date()
      const contract: Contract = {
        id: data.id || cuid(),
        reservationNumber: data.reservationNumber,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        vehicleReg: data.vehicleReg,
        vehicleModel: data.vehicleModel,
        pickupDate: data.pickupDate,
        returnDate: data.returnDate || null,
        status: data.status || 'active',
        locationCode: data.locationCode || null,
        createdAt: data.createdAt || now,
        updatedAt: now,
      }
      contracts.set(contract.id, contract)
      persist()
      return contract
    },

    update({ where, data }: { where: Record<string, any>; data: Record<string, any> }) {
      logQuery(`contract.update where=${JSON.stringify(where)}`)
      let contract: Contract | undefined
      if (where.id) {
        contract = contracts.get(where.id)
      } else if (where.reservationNumber) {
        contract = [...contracts.values()].find(c => c.reservationNumber === where.reservationNumber)
      }
      if (!contract) throw new Error('Contract not found')
      const updated = { ...contract, ...data, updatedAt: new Date() }
      contracts.set(updated.id, updated)
      persist()
      return updated
    },

    delete({ where }: { where: Record<string, any> }) {
      logQuery(`contract.delete where=${JSON.stringify(where)}`)
      const id = where.id
      if (id && contracts.has(id)) {
        // Also delete related records
        const vids = [...checkinVideos.values()].filter(v => v.contractId === id)
        vids.forEach(v => {
          checkinVideos.delete(v.id)
          const dr = [...damageReports.values()].find(r => r.checkinVideoId === v.id)
          if (dr) damageReports.delete(dr.id)
        })
        const comps = [...damageComparisons.values()].filter(c => c.contractId === id)
        comps.forEach(c => damageComparisons.delete(c.id))
        contracts.delete(id)
        persist()
        return { id }
      }
      throw new Error('Contract not found')
    },

    deleteMany() {
      logQuery(`contract.deleteMany`)
      contracts.clear()
      persist()
      return { count: 0 }
    },
  },

  // ─── CheckinVideo Model ─────────────────────────────────────────────────
  checkinVideo: {
    findUnique({ where, include }: { where: Record<string, any>; include?: Record<string, any> }) {
      logQuery(`checkinVideo.findUnique where=${JSON.stringify(where)}`)
      const video = where.id ? checkinVideos.get(where.id) : undefined
      if (!video) return null
      return applyIncludes({ ...video }, include, 'checkinVideo')
    },

    findFirst({ where, include, orderBy }: {
      where?: Record<string, any>; include?: Record<string, any>;
      orderBy?: Record<string, any>
    } = {}) {
      logQuery(`checkinVideo.findFirst`)
      let results = [...checkinVideos.values()]
      if (where) results = results.filter(v => matchesWhere(v, where))
      results = applyOrderBy(results, orderBy)
      const video = results[0]
      if (!video) return null
      return applyIncludes({ ...video }, include, 'checkinVideo')
    },

    findMany({ where, include, orderBy, take }: {
      where?: Record<string, any>; include?: Record<string, any>;
      orderBy?: Record<string, any>; take?: number
    } = {}) {
      logQuery(`checkinVideo.findMany`)
      let results = [...checkinVideos.values()]
      if (where) results = results.filter(v => matchesWhere(v, where))
      results = applyOrderBy(results, orderBy)
      if (take) results = results.slice(0, take)
      return results.map(v => applyIncludes({ ...v }, include, 'checkinVideo'))
    },

    count({ where }: { where?: Record<string, any> } = {}) {
      logQuery(`checkinVideo.count`)
      let results = [...checkinVideos.values()]
      if (where) results = results.filter(v => matchesWhere(v, where))
      return results.length
    },

    create({ data }: { data: Record<string, any> }) {
      logQuery(`checkinVideo.create`)
      const now = new Date()
      const video: CheckinVideo = {
        id: data.id || cuid(),
        contractId: data.contractId,
        kind: data.kind as VideoKind,
        storageUrl: data.storageUrl || null,
        storageProvider: data.storageProvider || null,
        duration: data.duration || null,
        sizeBytes: data.sizeBytes || null,
        status: data.status || 'pending_upload',
        tusUploadId: data.tusUploadId || null,
        recordedById: data.recordedById || null,
        errorMessage: data.errorMessage || null,
        createdAt: now,
        updatedAt: now,
      }
      checkinVideos.set(video.id, video)
      persist()
      return video
    },

    update({ where, data }: { where: Record<string, any>; data: Record<string, any> }) {
      logQuery(`checkinVideo.update where=${JSON.stringify(where)}`)
      const video = checkinVideos.get(where.id)
      if (!video) throw new Error('CheckinVideo not found')
      const updated = { ...video, ...data, updatedAt: new Date() }
      checkinVideos.set(updated.id, updated)
      persist()
      return updated
    },

    deleteMany() {
      logQuery(`checkinVideo.deleteMany`)
      checkinVideos.clear()
      persist()
      return { count: 0 }
    },
  },

  // ─── DamageReport Model ───────────────────────────────────────────────
  damageReport: {
    findUnique({ where, include }: { where: Record<string, any>; include?: Record<string, any> }) {
      logQuery(`damageReport.findUnique where=${JSON.stringify(where)}`)
      let report: DamageReport | undefined
      if (where.id) report = damageReports.get(where.id)
      if (!report) return null
      return applyIncludes({ ...report }, include, 'damageReport')
    },

    findFirst({ where, include, orderBy }: {
      where?: Record<string, any>; include?: Record<string, any>;
      orderBy?: Record<string, any>
    } = {}) {
      logQuery(`damageReport.findFirst`)
      let results = [...damageReports.values()]
      if (where) results = results.filter(r => matchesWhere(r, where))
      results = applyOrderBy(results, orderBy)
      const report = results[0]
      if (!report) return null
      return applyIncludes({ ...report }, include, 'damageReport')
    },

    findMany({ where, include, orderBy, take }: {
      where?: Record<string, any>; include?: Record<string, any>;
      orderBy?: Record<string, any>; take?: number
    } = {}) {
      logQuery(`damageReport.findMany`)
      let results = [...damageReports.values()]
      if (where) results = results.filter(r => matchesWhere(r, where))
      results = applyOrderBy(results, orderBy)
      if (take) results = results.slice(0, take)
      return results.map(r => applyIncludes({ ...r }, include, 'damageReport'))
    },

    create({ data }: { data: Record<string, any> }) {
      logQuery(`damageReport.create`)
      const now = new Date()
      const report: DamageReport = {
        id: data.id || cuid(),
        checkinVideoId: data.checkinVideoId,
        modelVersion: data.modelVersion,
        rawJsonUrl: data.rawJsonUrl || null,
        damages: typeof data.damages === 'string' ? data.damages : JSON.stringify(data.damages),
        frameCount: data.frameCount ?? null,
        processingMs: data.processingMs ?? null,
        createdAt: now,
      }
      damageReports.set(report.id, report)
      persist()
      return report
    },

    update({ where, data }: { where: Record<string, any>; data: Record<string, any> }) {
      logQuery(`damageReport.update where=${JSON.stringify(where)}`)
      const report = damageReports.get(where.id)
      if (!report) throw new Error('DamageReport not found')
      const updated = { ...report, ...data, updatedAt: new Date() }
      damageReports.set(updated.id, updated)
      persist()
      return updated
    },

    upsert({ where, create, update: updateData }: {
      where: Record<string, any>; create: Record<string, any>; update: Record<string, any>
    }) {
      logQuery(`damageReport.upsert`)
      const existing = damageReports.get(where.id)
      if (existing) {
        const updated = { ...existing, ...updateData }
        damageReports.set(updated.id, updated)
        persist()
        return updated
      }
      return db.damageReport.create({ data: create })
    },

    deleteMany() {
      logQuery(`damageReport.deleteMany`)
      damageReports.clear()
      persist()
      return { count: 0 }
    },
  },

  // ─── DamageComparison Model ────────────────────────────────────────────
  damageComparison: {
    findUnique({ where, include }: { where: Record<string, any>; include?: Record<string, any> }) {
      logQuery(`damageComparison.findUnique where=${JSON.stringify(where)}`)
      const cmp = where.id ? damageComparisons.get(where.id) : undefined
      if (!cmp) return null
      return applyIncludes({ ...cmp }, include, 'damageComparison')
    },

    findFirst({ where, include, orderBy }: {
      where?: Record<string, any>; include?: Record<string, any>;
      orderBy?: Record<string, any>
    } = {}) {
      logQuery(`damageComparison.findFirst`)
      let results = [...damageComparisons.values()]
      if (where) results = results.filter(c => matchesWhere(c, where))
      results = applyOrderBy(results, orderBy)
      const cmp = results[0]
      if (!cmp) return null
      return applyIncludes({ ...cmp }, include, 'damageComparison')
    },

    findMany({ where, include, orderBy, take }: {
      where?: Record<string, any>; include?: Record<string, any>;
      orderBy?: Record<string, any>; take?: number
    } = {}) {
      logQuery(`damageComparison.findMany`)
      let results = [...damageComparisons.values()]
      if (where) results = results.filter(c => matchesWhere(c, where))
      results = applyOrderBy(results, orderBy)
      if (take) results = results.slice(0, take)
      return results.map(c => applyIncludes({ ...c }, include, 'damageComparison'))
    },

    count({ where }: { where?: Record<string, any> } = {}) {
      logQuery(`damageComparison.count`)
      let results = [...damageComparisons.values()]
      if (where) results = results.filter(c => matchesWhere(c, where))
      return results.length
    },

    create({ data }: { data: Record<string, any> }) {
      logQuery(`damageComparison.create`)
      const now = new Date()
      const cmp: DamageComparison = {
        id: data.id || cuid(),
        contractId: data.contractId,
        pickupReportId: data.pickupReportId,
        returnReportId: data.returnReportId,
        newDamages: typeof data.newDamages === 'string' ? data.newDamages : JSON.stringify(data.newDamages),
        preExistingDamages: typeof data.preExistingDamages === 'string' ? data.preExistingDamages : JSON.stringify(data.preExistingDamages),
        signatureUrl: data.signatureUrl || null,
        signedAt: data.signedAt || null,
        signedByName: data.signedByName || null,
        reviewedById: data.reviewedById || null,
        reviewedAt: data.reviewedAt || null,
        status: data.status || 'awaiting_signature',
        overrideNotes: data.overrideNotes || null,
        createdAt: now,
        updatedAt: now,
      }
      damageComparisons.set(cmp.id, cmp)
      persist()
      return cmp
    },

    update({ where, data }: { where: Record<string, any>; data: Record<string, any> }) {
      logQuery(`damageComparison.update where=${JSON.stringify(where)}`)
      const cmp = damageComparisons.get(where.id)
      if (!cmp) throw new Error('DamageComparison not found')
      const updated = { ...cmp, ...data, updatedAt: new Date() }
      damageComparisons.set(updated.id, updated)
      persist()
      return updated
    },

    deleteMany() {
      logQuery(`damageComparison.deleteMany`)
      damageComparisons.clear()
      persist()
      return { count: 0 }
    },
  },

  // ─── User Model (legacy, unused but kept for compatibility) ────────────
  user: {
    findUnique() { return null },
    findMany() { return [] },
    create() { return {} as any },
    update() { return {} as any },
    deleteMany() { return { count: 0 } },
  },
}
