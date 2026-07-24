'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Car, Search, Video, Camera, Square, Loader2, Shield, Eye, EyeOff,
  ChevronLeft, CheckCircle2, AlertTriangle, AlertOctagon, CircleDot,
  PenLine, RotateCcw, ArrowRight, FileText, Users, BarChart3,
  Clock, MapPin, Signpost, Wrench, Upload, Sparkles, X,
  ArrowDownLeft, ArrowUpRight, UploadCloud, FileSpreadsheet, Archive,
} from 'lucide-react'
import * as XLSX from 'xlsx'

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserSession {
  email: string
  name: string
  role: string
}

interface DamageItem {
  id: string
  class: string
  severity: string
  confidence: number
  location: string
  bbox: { x: number; y: number; width: number; height: number }
  frameIndex: number
}

interface Contract {
  id: string
  reservationNumber: string
  customerName: string
  vehicleModel: string
  vehicleReg: string
  pickupDate: string
  returnDate: string | null
  status: string
  inspections: Inspection[]
  comparisons: Comparison[]
}

interface Inspection {
  id: string
  kind: string
  status: string
  createdAt: string
  damageReport: DamageReport | null
}

interface DamageReport {
  id: string
  modelVersion: string
  damages: string
  frameCount: number | null
  processingMs: number | null
}

interface Comparison {
  id: string
  newDamages: string
  preExistingDamages: string
  status: string
  signedByName: string | null
  signedAt: string | null
}

type View = 'login' | 'dashboard' | 'inspect' | 'pickup_sign' | 'return_report' | 'success'
type DashboardTab = 'active' | 'archive'

// ─── LocalStorage persistence keys ─────────────────────────────────────────

const LS_SESSION = 'hertz_session'
const LS_CONTRACTS = 'hertz_contracts_cache'

// ─── Severity helpers ──────────────────────────────────────────────────────

function severityColor(s: string) {
  switch (s) {
    case 'high': return 'bg-red-100 text-red-800 border-red-200'
    case 'medium': return 'bg-amber-100 text-amber-800 border-amber-200'
    default: return 'bg-green-100 text-green-800 border-green-200'
  }
}

function severityIcon(s: string) {
  switch (s) {
    case 'high': return <AlertOctagon className="w-4 h-4 text-red-600" />
    case 'medium': return <AlertTriangle className="w-4 h-4 text-amber-600" />
    default: return <CircleDot className="w-4 h-4 text-green-600" />
  }
}

function damageTypeIcon(cls: string) {
  switch (cls) {
    case 'Scratch': return '〰️'
    case 'Dent': return '⬤'
    case 'Crack': return '✦'
    case 'Tire Damage': return '◎'
    default: return '●'
  }
}

// ─── Contract status helpers ─────────────────────────────────────────────────

function getContractPhase(contract: Contract): 'pickup_pending' | 'return_pending' | 'completed' {
  const hasPickup = contract.inspections.some(i => i.kind === 'pickup')
  const hasReturn = contract.inspections.some(i => i.kind === 'return')
  if (hasReturn) return 'completed'
  if (hasPickup) return 'return_pending'
  return 'pickup_pending'
}

function isFullyCompleted(contract: Contract): boolean {
  return getContractPhase(contract) === 'completed'
}

// ─── Excel Serial Number to Date ────────────────────────────────────────────

function excelSerialToDate(serial: number): Date {
  // Excel epoch is Jan 1, 1900 (with the 1900 leap year bug)
  // JS epoch is Jan 1, 1970. Offset = 25569 days.
  return new Date((serial - 25569) * 86400000)
}

// ─── Excel Parsing ─────────────────────────────────────────────────────────

interface ParsedRow {
  rentalNumber: string
  customerName: string
  vehicleModel: string
  vehicleReg: string
  groupCode: string
  fuelType: string
  transmission: string
  days: number
  station: string
  confirmation: string
  pickupDate: string
  returnDate: string
}

function parseCheckOutsFile(buffer: ArrayBuffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null })
  return rows.map(row => {
    const timeVal = row['Time']
    const days = Number(row['Days']) || 7
    let pickupDate: Date

    // Handle Excel serial number (number) or already-parsed Date
    if (typeof timeVal === 'number') {
      pickupDate = excelSerialToDate(timeVal)
    } else if (timeVal instanceof Date) {
      pickupDate = timeVal
    } else {
      pickupDate = new Date()
    }

    const returnDate = new Date(pickupDate.getTime() + days * 86400000)

    return {
      rentalNumber: String(row['Rental'] || ''),
      customerName: String(row['Customer'] || ''),
      vehicleModel: String(row['Model'] || row['Group'] || ''), // Check-outs may not have Model column
      vehicleReg: String(row['Vehicle'] || ''), // Check-outs may not have Vehicle column
      groupCode: String(row['Group'] || ''),
      fuelType: String(row['Fuel type'] || ''),
      transmission: String(row['Transmission'] || ''),
      days,
      station: String(row['Station'] || ''),
      confirmation: String(row['Confirmation #'] || ''),
      pickupDate: pickupDate.toISOString(),
      returnDate: returnDate.toISOString(),
    }
  }).filter(r => r.rentalNumber)
}

function parseCheckInsFile(buffer: ArrayBuffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null })
  return rows.map(row => {
    const timeVal = row['Time']
    const days = Number(row['Days']) || 7
    let returnDate: Date

    if (typeof timeVal === 'number') {
      returnDate = excelSerialToDate(timeVal)
    } else if (timeVal instanceof Date) {
      returnDate = timeVal
    } else {
      returnDate = new Date()
    }

    const pickupDate = new Date(returnDate.getTime() - days * 86400000)

    return {
      rentalNumber: String(row['Rental'] || ''),
      customerName: String(row['Customer'] || ''),
      vehicleModel: String(row['Model'] || ''),
      vehicleReg: String(row['Vehicle'] || ''),
      groupCode: String(row['Group'] || ''),
      fuelType: String(row['Fuel type'] || ''),
      transmission: String(row['Transmission'] || ''),
      days,
      station: String(row['Station'] || ''),
      confirmation: String(row['Confirmation #'] || ''),
      pickupDate: pickupDate.toISOString(),
      returnDate: returnDate.toISOString(),
    }
  }).filter(r => r.rentalNumber)
}

// ─── Main App ───────────────────────────────────────────────────────────────

export default function HomePage() {
  const [user, setUser] = useState<UserSession | null>(null)
  const [view, setView] = useState<View>('login')
  const [contracts, setContracts] = useState<Contract[]>([])
  const [search, setSearch] = useState('')
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [activeKind, setActiveKind] = useState<'pickup' | 'return'>('pickup')
  const [lastDamages, setLastDamages] = useState<DamageItem[]>([])
  const [showUpload, setShowUpload] = useState(false)

  // Restore session
  useEffect(() => {
    const saved = localStorage.getItem(LS_SESSION)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as UserSession
        setUser(parsed)
        setView('dashboard')
      } catch { /* ignore */ }
    }
  }, [])

  // Load contracts — from localStorage cache first, then refresh from API
  const loadContracts = useCallback(async () => {
    // Show cached data immediately
    try {
      const cached = localStorage.getItem(LS_CONTRACTS)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setContracts(parsed)
        }
      }
    } catch { /* ignore */ }

    // Fetch fresh from API
    try {
      const data = await fetch('/api/contracts').then(r => r.json()).catch(() => [])
      if (Array.isArray(data)) {
        setContracts(data)
        // Persist to localStorage for survival across reloads/redeploys
        try {
          localStorage.setItem(LS_CONTRACTS, JSON.stringify(data))
        } catch { /* ignore quota */ }
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (view !== 'dashboard') return
    loadContracts()
  }, [view, loadContracts])

  const handleLogout = () => {
    localStorage.removeItem(LS_SESSION)
    setUser(null)
    setView('login')
    setSearch('')
    setContracts([])
  }

  const handleLogin = (session: UserSession) => {
    localStorage.setItem(LS_SESSION, JSON.stringify(session))
    setUser(session)
    setView('dashboard')
  }

  const openInspect = (contract: Contract, kind: 'pickup' | 'return') => {
    setSelectedContract(contract)
    setActiveKind(kind)
    setLastDamages([])
    setView('inspect')
  }

  const onInspectionComplete = (_videoId: string | null, damages: DamageItem[]) => {
    setLastDamages(damages)
    if (activeKind === 'pickup') {
      setView('pickup_sign')
    } else {
      setView('return_report')
    }
  }

  const onSigned = () => {
    if (activeKind === 'pickup') {
      setSelectedContract(null)
      setView('dashboard')
    } else {
      setView('success')
    }
  }

  const handleImportComplete = () => {
    setShowUpload(false)
    // Refresh contracts from API and cache
    loadContracts()
  }

  // ─── LOGIN ──────────────────────────────────────────────────────────────

  if (view === 'login' || !user) {
    return <LoginView onLogin={handleLogin} />
  }

  // ─── DASHBOARD ──────────────────────────────────────────────────────────

  if (view === 'dashboard') {
    return (
      <>
        <DashboardView
          user={user}
          contracts={contracts}
          search={search}
          setSearch={setSearch}
          onInspect={openInspect}
          onLogout={handleLogout}
          onUploadClick={() => setShowUpload(true)}
        />
        <AnimatePresence>
          {showUpload && (
            <ExcelUploadDialog
              onClose={() => setShowUpload(false)}
              onComplete={handleImportComplete}
            />
          )}
        </AnimatePresence>
      </>
    )
  }

  // ─── INSPECTION ────────────────────────────────────────────────────────

  if (view === 'inspect' && selectedContract) {
    return (
      <InspectionView
        contract={selectedContract}
        kind={activeKind}
        userRole={user.role}
        onBack={() => setView('dashboard')}
        onComplete={onInspectionComplete}
      />
    )
  }

  // ─── PICKUP SIGN ─────────────────────────────────────────────────────────

  if (view === 'pickup_sign' && selectedContract) {
    return (
      <PickupSignView
        contract={selectedContract}
        damages={lastDamages}
        userRole={user.role}
        onBack={() => setView('inspect')}
        onSigned={onSigned}
      />
    )
  }

  // ─── RETURN REPORT ──────────────────────────────────────────────────────

  if (view === 'return_report' && selectedContract) {
    return (
      <ReturnReportView
        contract={selectedContract}
        damages={lastDamages}
        userRole={user.role}
        onBack={() => setView('inspect')}
        onSigned={onSigned}
      />
    )
  }

  // ─── SUCCESS ────────────────────────────────────────────────────────────

  if (view === 'success' && selectedContract) {
    return (
      <SuccessView
        contract={selectedContract}
        onBack={() => { setSelectedContract(null); setView('dashboard') }}
      />
    )
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN VIEW
// ═══════════════════════════════════════════════════════════════════════════

function LoginView({ onLogin }: { onLogin: (session: UserSession) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const DEMO_ACCOUNTS: { email: string; role: string; name: string; pw: string }[] = [
    { email: 'staff@hertzmalta.com', role: 'Staff', name: 'Maria Borg', pw: 'demo123' },
    { email: 'manager@hertzmalta.com', role: 'Manager', name: 'Mark Vella', pw: 'demo123' },
    { email: 'admin@hertzmalta.com', role: 'Admin', name: 'Claire Farrugia', pw: 'demo123' },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    await new Promise(r => setTimeout(r, 600))
    const account = DEMO_ACCOUNTS.find(a => a.email.toLowerCase() === email.toLowerCase())
    if (account) {
      onLogin({ email: account.email, name: account.name, role: account.role.toLowerCase() })
    } else {
      setError('Invalid credentials. Try a demo account below.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="p-4 sm:p-6">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center">
            <Car className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">Hertz Malta</h1>
            <p className="text-slate-400 text-xs">AI Inspection Platform</p>
          </div>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Card className="border-slate-700 bg-slate-800/50 backdrop-blur-sm shadow-2xl">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-3">
                  <Shield className="w-7 h-7 text-amber-500" />
                </div>
                <CardTitle className="text-2xl font-bold text-white">Sign In</CardTitle>
                <CardDescription className="text-slate-400">Access the Hertz Malta AI Inspection system</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-slate-300">Email</Label>
                    <Input id="email" type="email" placeholder="staff@hertzmalta.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-slate-300">Password</Label>
                    <div className="relative">
                      <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter any password (demo)" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 pr-10" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {error && (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-md p-3">
                      {error}
                    </motion.div>
                  )}
                  <Button type="submit" disabled={loading} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold h-11">
                    {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Sign In
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}>
            <Card className="border-slate-700 bg-slate-800/50 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-300">Demo Accounts</CardTitle>
                <CardDescription className="text-xs text-slate-500">Click to auto-fill. Any password works in demo mode.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button key={account.email} onClick={() => { setEmail(account.email); setPassword(account.pw) }} className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-700/30 border border-slate-600/50 hover:border-amber-500/50 hover:bg-slate-700/50 transition-colors text-left">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{account.name}</p>
                        <p className="text-xs text-slate-400 truncate">{account.email}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0 ml-2 text-xs border-slate-500 text-slate-300">{account.role}</Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <p className="text-center text-xs text-slate-500">Hertz Malta AI Inspection Platform v1.0 — Demo</p>
        </div>
      </main>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD VIEW (Active + Archive tabs + Upload)
// ═══════════════════════════════════════════════════════════════════════════

function DashboardView({
  user, contracts, search, setSearch, onInspect, onLogout, onUploadClick,
}: {
  user: UserSession; contracts: Contract[]; search: string; setSearch: (s: string) => void
  onInspect: (c: Contract, k: 'pickup' | 'return') => void; onLogout: () => void; onUploadClick: () => void
}) {
  const [tab, setTab] = useState<DashboardTab>('active')

  const filtered = contracts.filter(c =>
    c.reservationNumber.toLowerCase().includes(search.toLowerCase()) ||
    c.customerName.toLowerCase().includes(search.toLowerCase())
  )

  const activeContracts = filtered.filter(c => !isFullyCompleted(c))
  const archiveContracts = filtered.filter(c => isFullyCompleted(c))

  const phaseCounts = {
    pickup_pending: contracts.filter(c => !isFullyCompleted(c) && getContractPhase(c) === 'pickup_pending').length,
    return_pending: contracts.filter(c => !isFullyCompleted(c) && getContractPhase(c) === 'return_pending').length,
    completed: contracts.filter(c => isFullyCompleted(c)).length,
    total: contracts.length,
  }

  const displayContracts = tab === 'active' ? activeContracts : archiveContracts

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center">
              <Car className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 text-lg leading-tight">Hertz Malta</h1>
              <p className="text-slate-500 text-xs">AI Inspection Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onUploadClick} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3">
              <UploadCloud className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Upload Excel</span>
            </Button>
            <div className="hidden sm:flex items-center gap-2 text-sm ml-2">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                {user.name?.charAt(0) || 'U'}
              </div>
              <div className="text-right">
                <p className="font-medium text-slate-900 text-sm leading-tight">{user.name}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
              <Badge className={
                user.role === 'admin' ? 'bg-red-100 text-red-800' :
                user.role === 'manager' ? 'bg-amber-100 text-amber-800' :
                'bg-slate-100 text-slate-700'
              }>
                {user.role}
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout} className="text-slate-600">
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input placeholder="Search by reservation number or customer name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-12 text-base bg-white border-slate-200" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Pickup Pending', value: phaseCounts.pickup_pending, icon: ArrowUpRight, color: 'text-blue-600 bg-blue-50' },
            { label: 'Return Pending', value: phaseCounts.return_pending, icon: ArrowDownLeft, color: 'text-purple-600 bg-purple-50' },
            { label: 'Completed', value: phaseCounts.completed, icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
            { label: 'Total Contracts', value: phaseCounts.total, icon: FileText, color: 'text-amber-600 bg-amber-50' },
          ].map(stat => (
            <Card key={stat.label} className="bg-white border-slate-200">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                  <p className="text-xs text-slate-500">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs: Active | Archive */}
        <div className="flex items-center gap-1 bg-slate-200 rounded-lg p-1 w-fit">
          <button onClick={() => setTab('active')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            <Car className="w-4 h-4 inline mr-1" />
            Active ({activeContracts.length})
          </button>
          <button onClick={() => setTab('archive')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'archive' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            <Archive className="w-4 h-4 inline mr-1" />
            Archive ({archiveContracts.length})
          </button>
        </div>

        {/* Contract List */}
        <Card className="bg-white border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">
              {tab === 'active' ? 'Active Contracts' : 'Completed Archive'}
            </CardTitle>
            <CardDescription>{displayContracts.length} contract{displayContracts.length !== 1 ? 's' : ''} found</CardDescription>
          </CardHeader>
          <CardContent>
            {displayContracts.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Car className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">
                  {tab === 'active'
                    ? (search ? 'No active contracts match your search.' : 'No active contracts. Upload an Excel file to add check-outs.')
                    : (search ? 'No archived contracts match your search.' : 'No completed contracts yet.')}
                </p>
                {!search && tab === 'active' && (
                  <Button onClick={onUploadClick} variant="outline" className="mt-3 text-sm">
                    <UploadCloud className="w-4 h-4 mr-2" />
                    Upload Check-outs / Check-ins
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {displayContracts.map((contract, idx) => {
                  const phase = getContractPhase(contract)
                  const completed = isFullyCompleted(contract)
                  return (
                    <motion.div key={contract.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
                      <Card className="border-slate-200 hover:border-amber-300 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${completed ? 'bg-green-50' : 'bg-amber-50'}`}>
                                <Car className={`w-5 h-5 ${completed ? 'text-green-600' : 'text-amber-600'}`} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-slate-900">{contract.reservationNumber}</span>
                                  <Badge variant="outline" className={
                                    completed ? 'border-green-300 text-green-700' :
                                    contract.status === 'active' ? 'border-green-300 text-green-700' : 'border-slate-300 text-slate-600'
                                  }>
                                    {completed ? 'completed' : contract.status}
                                  </Badge>
                                  {contract.vehicleReg !== 'TBD' && (
                                    <Badge variant="outline" className="border-slate-300 text-slate-600 text-xs">
                                      <Signpost className="w-3 h-3 mr-1" />
                                      {contract.vehicleReg}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-slate-600 mt-0.5">{contract.customerName}</p>
                                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                                  <span className="flex items-center gap-1">
                                    <Car className="w-3 h-3" />
                                    {contract.vehicleModel}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {contract.pickupDate ? new Date(contract.pickupDate).toLocaleDateString() : 'N/A'}
                                  </span>
                                  {contract.returnDate && (
                                    <span className="flex items-center gap-1">
                                      <ArrowRight className="w-3 h-3" />
                                      {new Date(contract.returnDate).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>

                                {/* Phase badges */}
                                {!completed && (
                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    {phase === 'pickup_pending' && (
                                      <Badge className="bg-blue-100 text-blue-700 text-xs">
                                        <ArrowUpRight className="w-3 h-3 mr-1" /> Pickup Required
                                      </Badge>
                                    )}
                                    {phase === 'return_pending' && (
                                      <>
                                        <Badge className="bg-green-100 text-green-700 text-xs">
                                          <CheckCircle2 className="w-3 h-3 mr-1" /> Pickup Done
                                        </Badge>
                                        <Badge className="bg-purple-100 text-purple-700 text-xs">
                                          <ArrowDownLeft className="w-3 h-3 mr-1" /> Return Required
                                        </Badge>
                                      </>
                                    )}
                                  </div>
                                )}

                                {completed && (
                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <Badge className="bg-green-100 text-green-700 text-xs">
                                      <CheckCircle2 className="w-3 h-3 mr-1" /> Pickup Done
                                    </Badge>
                                    <Badge className="bg-green-100 text-green-700 text-xs">
                                      <CheckCircle2 className="w-3 h-3 mr-1" /> Return Done
                                    </Badge>
                                    <Badge className="bg-slate-100 text-slate-700 text-xs">
                                      <FileText className="w-3 h-3 mr-1" /> Archived
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-2 shrink-0 sm:ml-4">
                              {phase === 'pickup_pending' && !completed && (
                                <Button size="sm" className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5" onClick={() => onInspect(contract, 'pickup')}>
                                  <ArrowUpRight className="w-4 h-4 mr-1" /> Start Pick Up
                                </Button>
                              )}
                              {phase === 'return_pending' && !completed && (
                                <>
                                  <Button size="sm" variant="outline" disabled className="text-xs border-green-300 text-green-600 bg-green-50">
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Pickup Done
                                  </Button>
                                  <Button size="sm" className="text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5" onClick={() => onInspect(contract, 'return')}>
                                    <ArrowDownLeft className="w-4 h-4 mr-1" /> Start Return
                                  </Button>
                                </>
                              )}
                              {completed && (
                                <Button size="sm" variant="outline" disabled className="text-xs border-green-300 text-green-600 bg-green-50">
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// EXCEL UPLOAD DIALOG
// ═══════════════════════════════════════════════════════════════════════════

function ExcelUploadDialog({ onClose, onComplete }: { onClose: () => void; onComplete: () => void }) {
  const [importType, setImportType] = useState<'checkout' | 'checkin'>('checkout')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ created: number; updated: number; errors?: string[] } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = async (file: File) => {
    setUploading(true)
    setResult(null)
    try {
      const buffer = await file.arrayBuffer()
      const rows = importType === 'checkout' ? parseCheckOutsFile(buffer) : parseCheckInsFile(buffer)
      if (rows.length === 0) {
        setResult({ created: 0, updated: 0, errors: ['No valid rows found in the Excel file.'] })
        setUploading(false)
        return
      }
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: importType, items: rows }),
      })
      const data = await res.json()
      setResult({ created: data.created || 0, updated: data.updated || 0, errors: data.errors })
    } catch (err: any) {
      setResult({ created: 0, updated: 0, errors: ['Upload failed: ' + err.message] })
    }
    setUploading(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Upload Excel</h2>
              <p className="text-xs text-slate-500">Import check-outs or check-ins</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Type selector */}
          <div className="flex gap-2">
            <button
              onClick={() => { setImportType('checkout'); setResult(null) }}
              className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                importType === 'checkout'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <ArrowUpRight className="w-4 h-4 inline mr-1" />
              Check-outs (Pick Up)
            </button>
            <button
              onClick={() => { setImportType('checkin'); setResult(null) }}
              className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                importType === 'checkin'
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4 inline mr-1" />
              Check-ins (Return)
            </button>
          </div>

          {/* Description */}
          <div className={`p-3 rounded-lg text-xs ${
            importType === 'checkout' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
          }`}>
            {importType === 'checkout'
              ? 'Upload the "Check-outs.xlsx" file to import new rentals that need a Pick Up inspection. Each row creates a contract.'
              : 'Upload the "Check-ins.xlsx" file to import returns. Existing contracts will be updated with vehicle info and return dates.'
            }
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-amber-500 bg-amber-50' : 'border-slate-300 hover:border-slate-400'
            }`}
          >
            <UploadCloud className={`w-10 h-10 mx-auto mb-3 ${dragOver ? 'text-amber-500' : 'text-slate-400'}`} />
            <p className="text-sm font-medium text-slate-700">
              {uploading ? 'Processing...' : 'Drop .xlsx file here or click to browse'}
            </p>
            <p className="text-xs text-slate-500 mt-1">Supports .xlsx format</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Loading */}
          {uploading && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              Parsing Excel and importing contracts...
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-green-700 font-medium">
                  <CheckCircle2 className="w-4 h-4 inline mr-1" />
                  {result.created} created
                </span>
                {result.updated > 0 && (
                  <span className="text-blue-700 font-medium">
                    <RotateCcw className="w-4 h-4 inline mr-1" />
                    {result.updated} updated
                  </span>
                )}
              </div>
              {result.errors && result.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-800 mb-1">Errors:</p>
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600">{err}</p>
                  ))}
                </div>
              )}
              <Button onClick={onComplete} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold">
                Done — Refresh Dashboard
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// INSPECTION VIEW (Video Recording + AI Processing)
// ═══════════════════════════════════════════════════════════════════════════

function InspectionView({
  contract, kind, userRole, onBack, onComplete,
}: {
  contract: Contract; kind: 'pickup' | 'return'; userRole: string
  onBack: () => void; onComplete: (videoId: string | null, damages: DamageItem[]) => void
}) {
  const [videoId, setVideoId] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [damages, setDamages] = useState<DamageItem[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [recordingTime, setRecordingTime] = useState(0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const videoIdRef = useRef<string | null>(null)

  const stopRecording = useCallback(async () => {
    setIsRecording(false)
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop()
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop())

    setIsProcessing(true)
    setUploadProgress(0)
    const uploadInterval = setInterval(() => {
      setUploadProgress(p => { if (p >= 100) { clearInterval(uploadInterval); return 100 } return p + Math.floor(Math.random() * 15 + 5) })
    }, 200)

    setTimeout(async () => {
      const vid = videoIdRef.current
      let gotDamages = false
      if (vid) {
        try {
          const res = await fetch(`/api/inspect/${vid}/simulate-complete`, { method: 'POST' })
          const data = await res.json()
          if (data.damageReport?.damages) { setDamages(data.damageReport.damages); gotDamages = true }
        } catch { /* mock fallback */ }
      }
      if (!gotDamages) {
        setDamages([
          { id: '1', class: 'Scratch', severity: 'low', confidence: 87, location: 'Driver door', bbox: { x: 100, y: 200, width: 150, height: 80 }, frameIndex: 0 },
          { id: '2', class: 'Dent', severity: 'medium', confidence: 92, location: 'Rear bumper', bbox: { x: 300, y: 150, width: 120, height: 100 }, frameIndex: 2 },
          { id: '3', class: 'Crack', severity: 'high', confidence: 78, location: 'Windshield', bbox: { x: 200, y: 50, width: 200, height: 60 }, frameIndex: 5 },
        ])
      }
      setIsProcessing(false)
    }, 3000)
  }, [])

  const startRecording = useCallback(() => {
    setIsRecording(true)
    setRecordingTime(0)
    fetch('/api/inspect/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contractId: contract.id, kind }) })
      .then(r => r.json())
      .then(data => { if (data.videoId) { setVideoId(data.videoId); videoIdRef.current = data.videoId } })
      .catch(() => {})
    navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'environment' }, audio: false })
      .then(stream => {
        mediaStreamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=h264') ? 'video/webm;codecs=h264' : 'video/webm'
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType })
        mediaRecorderRef.current.start(1000)
        timerRef.current = setInterval(() => { setRecordingTime(t => { if (t >= 90) { stopRecording(); return t } return t + 1 }) }, 1000)
      })
      .catch(() => {
        timerRef.current = setInterval(() => { setRecordingTime(t => { if (t >= 3) { stopRecording(); return t } return t + 1 }) }, 1000)
      })
  }, [contract.id, kind, stopRecording])

  const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-600"><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
            <Separator orientation="vertical" className="h-6" />
            <div>
              <p className="font-semibold text-slate-900 text-sm">{contract.reservationNumber}</p>
              <p className="text-xs text-slate-500">{contract.customerName} — {contract.vehicleModel}</p>
            </div>
          </div>
          <Badge className={kind === 'pickup' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}>
            {kind === 'pickup' ? <><ArrowUpRight className="w-3 h-3 mr-1" /> Pick Up</> : <><ArrowDownLeft className="w-3 h-3 mr-1" /> Return</>}
          </Badge>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center gap-2 text-sm">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isProcessing ? 'bg-amber-500 text-white' : damages.length > 0 ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'}`}>
            {isProcessing ? '2' : damages.length > 0 ? '3' : '1'}
          </div>
          <span className="text-slate-600 font-medium">{isProcessing ? 'AI Processing' : damages.length > 0 ? 'Review Damages' : 'Record Vehicle Walk-Around'}</span>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="bg-black overflow-hidden border-slate-700">
            <div className="relative aspect-video bg-slate-900 flex items-center justify-center">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline style={{ display: isRecording ? 'block' : 'none' }} />
              {!isRecording && !isProcessing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60">
                  <Camera className="w-16 h-16 mb-4 opacity-30" />
                  <p className="text-sm">Camera preview will appear here</p>
                </div>
              )}
              {isRecording && (
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 px-3 py-1.5 rounded-full">
                  <motion.div className="w-3 h-3 bg-white rounded-full" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
                  <span className="text-white text-sm font-mono font-bold">REC</span>
                  <span className="text-white/80 text-sm font-mono">{formatTime(recordingTime)}</span>
                </div>
              )}
              <AnimatePresence>
                {isProcessing && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                      <Sparkles className="w-12 h-12 text-amber-400" />
                    </motion.div>
                    <p className="text-white font-semibold text-lg mt-6 mb-2">AI Processing</p>
                    <p className="text-white/60 text-sm mb-4">Analyzing video frames with car damage detection</p>
                    <div className="w-64 space-y-2">
                      <div className="flex justify-between text-xs text-white/50"><span>Uploading & Processing</span><span>{Math.min(uploadProgress, 100)}%</span></div>
                      <Progress value={Math.min(uploadProgress, 100)} className="h-2" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="p-4 bg-slate-900 flex items-center justify-center gap-4">
              {!isRecording && !isProcessing && damages.length === 0 && (
                <Button onClick={startRecording} className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8 h-12 text-base"><Video className="w-5 h-5 mr-2" />Start Recording</Button>
              )}
              {isRecording && (
                <Button onClick={stopRecording} variant="destructive" className="font-semibold px-8 h-12 text-base"><Square className="w-5 h-5 mr-2" />Stop & Analyze</Button>
              )}
            </div>
          </Card>
        </motion.div>
        <AnimatePresence>
          {damages.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="bg-white border-slate-200">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">Detected Damages ({damages.length})</CardTitle>
                      <CardDescription>AI analysis completed for {kind === 'pickup' ? 'pick-up' : 'return'} inspection</CardDescription>
                    </div>
                    <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" /> Complete</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {damages.map((damage, idx) => (
                      <motion.div key={damage.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                        <Card className={`border ${severityColor(damage.severity)} p-0 overflow-hidden`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <span className="text-2xl mt-0.5">{damageTypeIcon(damage.class)}</span>
                                <div>
                                  <p className="font-semibold text-slate-900 text-sm">{damage.class}</p>
                                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" />{damage.location}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge className={`${severityColor(damage.severity)} text-xs`}>{severityIcon(damage.severity)}<span className="ml-1 capitalize">{damage.severity}</span></Badge>
                                <p className="text-xs text-slate-500 mt-1">{damage.confidence}%</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <div className="mt-6 flex justify-center">
                <Button onClick={() => onComplete(videoIdRef.current, damages)} className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8 h-12 text-base">
                  {kind === 'pickup' ? <><PenLine className="w-4 h-4 mr-2" />Proceed to Sign Pick Up</> : <><PenLine className="w-4 h-4 mr-2" />Proceed to Sign Return</>}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PICKUP SIGN VIEW
// ═══════════════════════════════════════════════════════════════════════════

function PickupSignView({ contract, damages, userRole, onBack, onSigned }: {
  contract: Contract; damages: DamageItem[]; userRole: string; onBack: () => void; onSigned: () => void
}) {
  const [signerName, setSignerName] = useState(contract.customerName || '')
  const [hasStrokes, setHasStrokes] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const rect = canvas.getBoundingClientRect(); canvas.width = rect.width; canvas.height = rect.height
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  }, [])

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect()
    if ('touches' in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }, [])

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => { isDrawingRef.current = true; lastPosRef.current = getPos(e); setHasStrokes(true) }, [getPos])
  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawingRef.current) return; const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return; const pos = getPos(e)
    ctx.beginPath(); ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y); ctx.lineTo(pos.x, pos.y); ctx.stroke(); lastPosRef.current = pos
  }, [getPos])
  const endDraw = useCallback(() => { isDrawingRef.current = false }, [])
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height); setHasStrokes(false)
  }, [])

  const handleSubmit = async () => {
    setSubmitting(true)
    const canvas = canvasRef.current; const signaturePngBase64 = canvas ? canvas.toDataURL('image/png') : ''
    try {
      await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: contract.id, kind: 'pickup', signaturePngBase64, signerName, damages }),
      })
      // Update localStorage cache
      try {
        const cached = JSON.parse(localStorage.getItem(LS_CONTRACTS) || '[]')
        const idx = cached.findIndex((c: Contract) => c.id === contract.id)
        if (idx >= 0) {
          const updated = { ...cached[idx] }
          if (!updated.inspections) updated.inspections = []
          updated.inspections.push({
            id: crypto.randomUUID(),
            kind: 'pickup',
            status: 'completed',
            createdAt: new Date().toISOString(),
            damageReport: damages.length > 0 ? { id: crypto.randomUUID(), modelVersion: 'demo', damages: JSON.stringify(damages), frameCount: 45, processingMs: 3200 } : null,
          })
          cached[idx] = updated
          localStorage.setItem(LS_CONTRACTS, JSON.stringify(cached))
        }
      } catch { /* ignore */ }
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 1000)); setSubmitting(false); onSigned()
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-600"><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
            <Separator orientation="vertical" className="h-6" />
            <div><p className="font-semibold text-slate-900 text-sm">Pick Up — Sign & Save</p><p className="text-xs text-slate-500">{contract.reservationNumber} — {contract.customerName}</p></div>
          </div>
          <Badge className="bg-blue-100 text-blue-800"><ArrowUpRight className="w-3 h-3 mr-1" />Pick Up</Badge>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-blue-50 border-blue-200"><CardContent className="p-4 flex items-start gap-3">
            <ArrowUpRight className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div><p className="font-semibold text-blue-900 text-sm">Pick Up Inspection Complete</p><p className="text-xs text-blue-700 mt-1">Review the detected damages. The customer must sign to acknowledge the vehicle&apos;s initial condition at pick up.</p></div>
          </CardContent></Card>
        </motion.div>
        <Card className="bg-white border-slate-200"><CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[['Reservation', contract.reservationNumber], ['Customer', contract.customerName], ['Vehicle', contract.vehicleModel], ['Registration', contract.vehicleReg]].map(([label, val]) => (
              <div key={String(label)}><p className="text-xs text-slate-500">{String(label)}</p><p className="font-semibold text-slate-900">{String(val)}</p></div>
            ))}
          </div>
        </CardContent></Card>
        <Card className="bg-white border-slate-200">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" />Damages at Pick Up ({damages.length})</CardTitle><CardDescription>Pre-existing conditions recorded at the start of the rental</CardDescription></CardHeader>
          <CardContent>
            {damages.length === 0 ? (
              <div className="text-center py-6 text-slate-400"><CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" /><p className="text-sm">No damages detected</p></div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{damages.map((d, i) => (
                <motion.div key={d.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                  <div className={`p-4 rounded-lg border ${severityColor(d.severity)}`}><div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><span className="text-xl">{damageTypeIcon(d.class)}</span><div><p className="font-semibold text-sm">{d.class}</p><p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{d.location}</p></div></div>
                    <div className="text-right"><Badge className={`${severityColor(d.severity)} text-xs`}>{severityIcon(d.severity)}<span className="ml-1 capitalize">{d.severity}</span></Badge><p className="text-xs text-slate-500 mt-1">{d.confidence}%</p></div>
                  </div></div>
                </motion.div>
              ))}</div>
            )}
          </CardContent>
        </Card>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="bg-white border-slate-200">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><PenLine className="w-5 h-5" />Customer Signature — Pick Up</CardTitle><CardDescription>{new Date().toLocaleDateString('en-MT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Customer Full Name *</Label><Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Enter customer name" className="max-w-md" /></div>
              <div className="space-y-2">
                <Label>Signature *</Label>
                <div className="relative border-2 border-slate-300 rounded-lg overflow-hidden" style={{ height: 200 }}>
                  <canvas ref={canvasRef} className="w-full h-full cursor-crosshair touch-none" onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw} onTouchStart={(e) => { e.preventDefault(); startDraw(e) }} onTouchMove={(e) => { e.preventDefault(); draw(e) }} onTouchEnd={endDraw} />
                  {!hasStrokes && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300"><p className="text-sm">Sign here</p></div>}
                </div>
                <Button variant="outline" size="sm" onClick={clearCanvas} className="text-xs text-slate-500"><RotateCcw className="w-3 h-3 mr-1" />Clear Signature</Button>
              </div>
              <div className="pt-2">
                <Button onClick={handleSubmit} disabled={signerName.trim().length === 0 || !hasStrokes || submitting} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold h-12 px-8">
                  {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><CheckCircle2 className="w-4 h-4 mr-2" />Save Pick Up & Return to Dashboard</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// RETURN REPORT VIEW
// ═══════════════════════════════════════════════════════════════════════════

function ReturnReportView({ contract, damages, userRole, onBack, onSigned }: {
  contract: Contract; damages: DamageItem[]; userRole: string; onBack: () => void; onSigned: () => void
}) {
  const [signerName, setSignerName] = useState(contract.customerName || '')
  const [hasStrokes, setHasStrokes] = useState(false)
  const [overrideNotes, setOverrideNotes] = useState('')
  const [showOverride, setShowOverride] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [comparisonData, setComparisonData] = useState<{ newDamages: DamageItem[]; preExisting: DamageItem[] } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const preExistingLocations = ['Driver door', 'Hood']
    const preExisting = damages.filter(d => preExistingLocations.includes(d.location))
    const newDams = damages.filter(d => !preExistingLocations.includes(d.location))
    setComparisonData({
      newDamages: newDams.length > 0 ? newDams : [{ id: 'n1', class: 'Dent', severity: 'high', confidence: 92, location: 'Rear bumper', bbox: { x: 300, y: 150, width: 120, height: 100 }, frameIndex: 2 }],
      preExisting: preExisting.length > 0 ? preExisting : [{ id: 'p1', class: 'Scratch', severity: 'low', confidence: 87, location: 'Driver door', bbox: { x: 100, y: 200, width: 150, height: 80 }, frameIndex: 0 }],
    })
  }, [damages])

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const rect = canvas.getBoundingClientRect(); canvas.width = rect.width; canvas.height = rect.height
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  }, [])

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect()
    if ('touches' in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }, [])
  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => { isDrawingRef.current = true; lastPosRef.current = getPos(e); setHasStrokes(true) }, [getPos])
  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawingRef.current) return; const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return; const pos = getPos(e)
    ctx.beginPath(); ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y); ctx.lineTo(pos.x, pos.y); ctx.stroke(); lastPosRef.current = pos
  }, [getPos])
  const endDraw = useCallback(() => { isDrawingRef.current = false }, [])
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height); setHasStrokes(false)
  }, [])

  const handleSubmit = async () => {
    setSubmitting(true)
    const canvas = canvasRef.current; const signaturePngBase64 = canvas ? canvas.toDataURL('image/png') : ''
    try {
      await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: contract.id, kind: 'return', signaturePngBase64, signerName, damages }),
      })
      // Update localStorage cache — mark as completed
      try {
        const cached = JSON.parse(localStorage.getItem(LS_CONTRACTS) || '[]')
        const idx = cached.findIndex((c: Contract) => c.id === contract.id)
        if (idx >= 0) {
          const updated = { ...cached[idx], status: 'completed' }
          if (!updated.inspections) updated.inspections = []
          updated.inspections.push({
            id: crypto.randomUUID(),
            kind: 'return',
            status: 'completed',
            createdAt: new Date().toISOString(),
            damageReport: damages.length > 0 ? { id: crypto.randomUUID(), modelVersion: 'demo', damages: JSON.stringify(damages), frameCount: 45, processingMs: 3800 } : null,
          })
          cached[idx] = updated
          localStorage.setItem(LS_CONTRACTS, JSON.stringify(cached))
        }
      } catch { /* ignore */ }
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 1500)); setSubmitting(false); onSigned()
  }

  if (!comparisonData) return null

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-600"><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
            <Separator orientation="vertical" className="h-6" />
            <div><p className="font-semibold text-slate-900 text-sm">Return — Comparison & Signature</p><p className="text-xs text-slate-500">{contract.reservationNumber} — {contract.customerName}</p></div>
          </div>
          <Badge className="bg-purple-100 text-purple-800"><ArrowDownLeft className="w-3 h-3 mr-1" />Return</Badge>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-purple-50 border-purple-200"><CardContent className="p-4 flex items-start gap-3">
            <ArrowDownLeft className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
            <div><p className="font-semibold text-purple-900 text-sm">Return Inspection Complete</p><p className="text-xs text-purple-700 mt-1">Review the comparison. New damages are billable to the customer.</p></div>
          </CardContent></Card>
        </motion.div>
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-red-50 border-red-200"><CardContent className="p-4 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center"><AlertOctagon className="w-5 h-5 text-red-600" /></div><div><p className="text-2xl font-bold text-red-900">{comparisonData.newDamages.length}</p><p className="text-xs text-red-600">New Damages (Billable)</p></div></CardContent></Card>
          <Card className="bg-amber-50 border-amber-200"><CardContent className="p-4 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-amber-600" /></div><div><p className="text-2xl font-bold text-amber-900">{comparisonData.preExisting.length}</p><p className="text-xs text-amber-600">Pre-existing</p></div></CardContent></Card>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <Card className="border-red-200 bg-white">
              <CardHeader className="bg-red-50 rounded-t-lg"><CardTitle className="text-red-800 flex items-center gap-2"><AlertOctagon className="w-5 h-5" />New Damages</CardTitle><CardDescription className="text-red-600">Billable to customer</CardDescription></CardHeader>
              <CardContent className="p-4 space-y-3">
                {comparisonData.newDamages.length === 0 ? <div className="text-center py-4 text-slate-400"><CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-green-500" /><p className="text-sm">No new damages</p></div> : comparisonData.newDamages.map((d, i) => (
                  <motion.div key={d.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}>
                    <div className={`p-4 rounded-lg border ${severityColor(d.severity)}`}><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="text-xl">{damageTypeIcon(d.class)}</span><div><p className="font-semibold text-sm">{d.class}</p><p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{d.location}</p></div></div><div className="text-right"><Badge className={`${severityColor(d.severity)} text-xs`}>{severityIcon(d.severity)}<span className="ml-1 capitalize">{d.severity}</span></Badge><p className="text-xs text-slate-500 mt-1">{d.confidence}%</p></div></div></div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <Card className="border-amber-200 bg-white">
              <CardHeader className="bg-amber-50 rounded-t-lg"><CardTitle className="text-amber-800 flex items-center gap-2"><AlertTriangle className="w-5 h-5" />Pre-existing</CardTitle><CardDescription className="text-amber-600">Recorded at pick up</CardDescription></CardHeader>
              <CardContent className="p-4 space-y-3">
                {comparisonData.preExisting.map((d, i) => (
                  <motion.div key={d.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}>
                    <div className={`p-4 rounded-lg border ${severityColor(d.severity)}`}><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="text-xl">{damageTypeIcon(d.class)}</span><div><p className="font-semibold text-sm">{d.class}</p><p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{d.location}</p></div></div><div className="text-right"><Badge className={`${severityColor(d.severity)} text-xs`}>{severityIcon(d.severity)}<span className="ml-1 capitalize">{d.severity}</span></Badge><p className="text-xs text-slate-500 mt-1">{d.confidence}%</p></div></div></div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </div>
        {(userRole === 'manager' || userRole === 'admin') && (
          <Card className="bg-white border-slate-200"><CardContent className="p-0">
            <button onClick={() => setShowOverride(!showOverride)} className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2"><Wrench className="w-4 h-4 text-slate-500" /><span className="font-medium text-sm text-slate-700">Manager Override</span></div>
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">{userRole}</Badge>
            </button>
            <AnimatePresence>{showOverride && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                  <Label className="text-sm">Override Notes</Label>
                  <textarea value={overrideNotes} onChange={(e) => setOverrideNotes(e.target.value)} placeholder="Enter notes..." className="mt-1 w-full h-24 rounded-md border border-slate-200 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
                  <Button size="sm" className="mt-2 bg-amber-500 hover:bg-amber-600 text-white">Apply Override</Button>
                </div>
              </motion.div>
            )}</AnimatePresence>
          </CardContent></Card>
        )}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="bg-white border-slate-200">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><PenLine className="w-5 h-5" />Customer Signature — Return</CardTitle><CardDescription>{new Date().toLocaleDateString('en-MT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Customer Full Name *</Label><Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Enter customer name" className="max-w-md" /></div>
              <div className="space-y-2">
                <Label>Signature *</Label>
                <div className="relative border-2 border-slate-300 rounded-lg overflow-hidden" style={{ height: 200 }}>
                  <canvas ref={canvasRef} className="w-full h-full cursor-crosshair touch-none" onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw} onTouchStart={(e) => { e.preventDefault(); startDraw(e) }} onTouchMove={(e) => { e.preventDefault(); draw(e) }} onTouchEnd={endDraw} />
                  {!hasStrokes && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300"><p className="text-sm">Sign here</p></div>}
                </div>
                <Button variant="outline" size="sm" onClick={clearCanvas} className="text-xs text-slate-500"><RotateCcw className="w-3 h-3 mr-1" />Clear</Button>
              </div>
              <div className="pt-2">
                <Button onClick={handleSubmit} disabled={signerName.trim().length === 0 || !hasStrokes || submitting} className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white font-semibold h-12 px-8">
                  {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Completing...</> : <><CheckCircle2 className="w-4 h-4 mr-2" />Sign & Complete Return</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SUCCESS VIEW
// ═══════════════════════════════════════════════════════════════════════════

function SuccessView({ contract, onBack }: { contract: Contract; onBack: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', damping: 15 }} className="w-full max-w-md">
        <Card className="bg-white border-slate-200 shadow-xl">
          <CardContent className="p-8 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2, damping: 10 }} className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </motion.div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Return Completed</h2>
            <p className="text-slate-500 mb-1">{contract.reservationNumber} — {contract.customerName}</p>
            <p className="text-sm text-slate-400 mb-6">{contract.vehicleModel} ({contract.vehicleReg})</p>
            <Separator className="my-6" />
            <div className="bg-slate-50 rounded-lg p-4 mb-6 space-y-2">
              <div className="flex items-center justify-center gap-2 text-sm text-green-700"><CheckCircle2 className="w-4 h-4" /><span className="font-medium">Pick Up Inspection — Signed</span></div>
              <div className="flex items-center justify-center gap-2 text-sm text-green-700"><CheckCircle2 className="w-4 h-4" /><span className="font-medium">Return Inspection — Signed</span></div>
              <div className="flex items-center justify-center gap-2 text-sm text-slate-700"><FileText className="w-4 h-4" /><span className="font-medium">Damage Comparison Report — Finalized</span></div>
            </div>
            <Button onClick={onBack} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold h-11">Back to Dashboard</Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
