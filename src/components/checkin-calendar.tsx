'use client'

import { useState, useMemo } from 'react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, addMonths, subMonths, isSameMonth,
  startOfWeek, endOfWeek, isToday, getDay,
} from 'date-fns'
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon,
  Car, ArrowUpRight, ArrowDownLeft, Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Types ─────────────────────────────────────────────────────────────────

interface Contract {
  id: string
  reservationNumber: string
  customerName: string
  vehicleModel: string
  vehicleReg: string
  pickupDate: string
  returnDate: string | null
  status: string
  inspections: { id: string; kind: string; status: string; createdAt: string }[]
  comparisons: { id: string; newDamages: string; preExistingDamages: string; status: string; signedByName: string | null; signedAt: string | null }[]
}

type CheckinType = 'all' | 'pickup' | 'return'

interface CheckinCalendarProps {
  contracts: Contract[]
  onSelectContract: (c: Contract, kind: 'pickup' | 'return') => void
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getContractsForDate(
  contracts: Contract[],
  date: Date,
  type: CheckinType
): { contract: Contract; kind: 'pickup' | 'return' }[] {
  const dateStr = format(date, 'yyyy-MM-dd')
  const results: { contract: Contract; kind: 'pickup' | 'return' }[] = []

  for (const c of contracts) {
    if ((type === 'all' || type === 'pickup') && c.pickupDate?.startsWith(dateStr)) {
      results.push({ contract: c, kind: 'pickup' })
    }
    if ((type === 'all' || type === 'return') && c.returnDate?.startsWith(dateStr)) {
      results.push({ contract: c, kind: 'return' })
    }
  }

  return results
}

function countCheckinsForDate(contracts: Contract[], date: Date, type: CheckinType): number {
  const dateStr = format(date, 'yyyy-MM-dd')
  let count = 0
  for (const c of contracts) {
    if ((type === 'all' || type === 'pickup') && c.pickupDate?.startsWith(dateStr)) count++
    if ((type === 'all' || type === 'return') && c.returnDate?.startsWith(dateStr)) count++
  }
  return count
}

// ─── Component ─────────────────────────────────────────────────────────────

export function CheckinCalendar({ contracts, onSelectContract }: CheckinCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [filterType, setFilterType] = useState<CheckinType>('all')

  // Compute the 42-cell grid (6 weeks) starting from Monday
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    // Start from Monday of the week containing monthStart
    let calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    // End at Sunday of the week containing monthEnd
    let calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentMonth])

  // Pre-compute counts for the month
  const dayCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const day of calendarDays) {
      map.set(format(day, 'yyyy-MM-dd'), countCheckinsForDate(contracts, day, filterType))
    }
    return map
  }, [calendarDays, contracts, filterType])

  // Selected day contracts
  const selectedDayContracts = useMemo(() => {
    if (!selectedDate) return []
    return getContractsForDate(contracts, selectedDate, filterType)
  }, [selectedDate, contracts, filterType])

  const goToToday = () => {
    const today = new Date()
    setCurrentMonth(today)
    setSelectedDate(today)
  }

  const goPrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1))
  const goNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1))

  const todayDate = new Date()
  const monthLabel = format(currentMonth, 'MMMM yyyy')

  return (
    <Card className="bg-white border-slate-200">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-amber-600" />
            <CardTitle className="text-lg">Check-in Calendar</CardTitle>
          </div>

          {/* Filter toggle */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {([
              { value: 'all' as const, label: 'All', icon: CalendarIcon },
              { value: 'pickup' as const, label: 'Pickup', icon: ArrowUpRight },
              { value: 'return' as const, label: 'Return', icon: ArrowDownLeft },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilterType(opt.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  filterType === opt.value
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <opt.icon className="w-3.5 h-3.5" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goPrevMonth} className="h-8 w-8 p-0">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold text-slate-900 min-w-[160px] text-center capitalize">
              {monthLabel}
            </span>
            <Button variant="outline" size="sm" onClick={goNextMonth} className="h-8 w-8 p-0">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={goToToday} className="text-xs h-8">
            Today
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_LABELS.map(day => (
            <div key={day} className="text-center text-xs font-medium text-slate-400 py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const count = dayCounts.get(dateStr) || 0
            const inMonth = isSameMonth(day, currentMonth)
            const isTodayDay = isToday(day)
            const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
            const hasCheckins = count > 0

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(day)}
                className={`
                  relative flex flex-col items-center justify-center p-1.5 rounded-lg text-sm transition-colors min-h-[44px]
                  ${!inMonth ? 'text-slate-300' : 'text-slate-700 hover:bg-slate-100'}
                  ${isSelected ? 'bg-amber-100 ring-2 ring-amber-500 text-amber-900 font-semibold' : ''}
                  ${isTodayDay ? 'border-2 border-amber-500' : ''}
                `}
              >
                <span className="text-xs leading-none">{format(day, 'd')}</span>
                {hasCheckins && (
                  <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isSelected
                      ? 'bg-amber-500 text-white'
                      : 'bg-blue-500 text-white'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Selected day contracts list */}
        <AnimatePresence>
          {selectedDate && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-4 overflow-hidden"
            >
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-semibold text-slate-900">
                      Check-ins for {format(selectedDate, 'dd MMM yyyy')}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {selectedDayContracts.length} found
                  </Badge>
                </div>

                {selectedDayContracts.length === 0 ? (
                  <div className="text-center py-6 text-slate-400">
                    <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No check-ins scheduled for this date</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedDayContracts.map(({ contract, kind }) => (
                      <motion.div
                        key={`${contract.id}-${kind}`}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-amber-300 transition-colors bg-slate-50"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            kind === 'pickup' ? 'bg-blue-100' : 'bg-purple-100'
                          }`}>
                            {kind === 'pickup'
                              ? <ArrowUpRight className="w-4 h-4 text-blue-600" />
                              : <ArrowDownLeft className="w-4 h-4 text-purple-600" />
                            }
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-slate-900 truncate">
                                {contract.reservationNumber}
                              </span>
                              <Badge className={`text-[10px] px-1.5 py-0 ${
                                kind === 'pickup' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                              }`}>
                                {kind === 'pickup' ? 'Pickup' : 'Return'}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500 truncate">
                              {contract.customerName} &middot; {contract.vehicleModel}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className={`text-xs font-semibold px-4 shrink-0 ${
                            kind === 'pickup'
                              ? 'bg-blue-600 hover:bg-blue-700 text-white'
                              : 'bg-purple-600 hover:bg-purple-700 text-white'
                          }`}
                          onClick={() => onSelectContract(contract, kind)}
                        >
                          {kind === 'pickup' ? 'Start Pick Up' : 'Start Return'}
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hint when no date selected */}
        {!selectedDate && (
          <div className="text-center py-4 text-slate-400 text-xs">
            Click on a day to see scheduled check-ins
          </div>
        )}
      </CardContent>
    </Card>
  )
}
