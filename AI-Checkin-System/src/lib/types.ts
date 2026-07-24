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

export interface StaffUser {
  id: string
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
}

export interface Contract {
  id: string
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
}

export interface CheckinVideo {
  id: string
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
