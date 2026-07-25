// ─── Local Types ──────────────────────────────────────────────────────────────
// These types replace the @prisma/client imports so the app works without Prisma.

export type UserRole = 'staff' | 'manager' | 'admin'
export type VideoKind = 'pickup' | 'return'
export type VideoStatus = 'pending_upload' | 'uploading' | 'processing' | 'completed' | 'failed'
export type InspectionStatus =
  | 'awaiting_pickup_video'
  | 'pickup_processing'
  | 'awaiting_return_video'
  | 'return_processing'
  | 'awaiting_signature'
  | 'completed'
export type DamageSeverity = 'low' | 'medium' | 'high'
export type TenantStatus = 'active' | 'suspended' | 'trial'

// ─── Multi-Tenant ───────────────────────────────────────────────────────────

export interface Tenant {
  id: string
  slug: string            // "hertz-malta", "avis-italia"
  name: string            // "Hertz Malta"
  status: TenantStatus
  config: {
    roboflow?: { enabled: boolean; apiKey?: string; modelId?: string }
    branding?: { primaryColor: string; logoUrl?: string }
  } | null
  createdAt: Date
  updatedAt: Date
}

// ─── Models (with tenantId) ─────────────────────────────────────────────────

export interface StaffUser {
  id: string
  tenantId: string
  entraOid: string
  email: string
  displayName: string
  role: UserRole
  locationCode: string | null
  isActive: boolean
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
  // Relations (resolved at query time)
  inspections?: CheckinVideo[]
  reviews?: DamageComparison[]
  _count?: { inspections: number }
  tenant?: Tenant
}

export interface Contract {
  id: string
  tenantId: string
  reservationNumber: string
  customerName: string
  customerEmail: string
  vehicleReg: string
  vehicleModel: string
  pickupDate: Date
  returnDate: Date | null
  status: string
  locationCode: string | null
  createdAt: Date
  updatedAt: Date
  // Relations
  inspections?: CheckinVideo[]
  comparisons?: DamageComparison[]
  tenant?: Tenant
}

export interface CheckinVideo {
  id: string
  tenantId: string
  contractId: string
  kind: VideoKind
  storageUrl: string | null
  storageProvider: string | null
  duration: number | null
  sizeBytes: number | null
  status: VideoStatus
  tusUploadId: string | null
  recordedById: string | null
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
  // Relations
  contract?: Contract
  recordedBy?: StaffUser
  damageReport?: DamageReport | null
}

export interface DamageReport {
  id: string
  tenantId: string
  checkinVideoId: string
  modelVersion: string
  rawJsonUrl: string | null
  damages: string
  frameCount: number | null
  processingMs: number | null
  createdAt: Date
  // Relations
  checkinVideo?: CheckinVideo
}

export interface DamageComparison {
  id: string
  tenantId: string
  contractId: string
  pickupReportId: string
  returnReportId: string
  newDamages: string
  preExistingDamages: string
  signatureUrl: string | null
  signedAt: Date | null
  signedByName: string | null
  reviewedById: string | null
  reviewedAt: Date | null
  status: InspectionStatus
  overrideNotes: string | null
  createdAt: Date
  updatedAt: Date
  // Relations
  contract?: Contract
  pickupReport?: DamageReport
  returnReport?: DamageReport
  reviewedBy?: StaffUser
}
