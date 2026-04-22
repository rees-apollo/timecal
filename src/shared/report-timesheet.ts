import type {
  CalendarEvent,
  CalendarEventLink,
  CustomTaskCategory,
  ManualCustomTaskEntry,
  TaskSession,
  WorkingHoursSchedule
} from './types'
import { getWorkingTimeSegments, toLocalDateKey } from './working-hours'
import { getWeekDays } from './report-week'

export type BookingBreakdown = {
  code: string
  minutes: number
}

export type TimesheetRow = {
  dayKey: string
  day: string
  bookings: BookingBreakdown[]
  bookedMinutes: number
  overheadMinutes: number
  totalMinutes: number
  isEmpty: boolean
}

type SessionBookingSegment = {
  startMs: number
  endMs: number
  bookingCode: string
  remainingMinutes: number
}

const UNASSIGNED_BOOKING_CODE = 'UNASSIGNED'

const normalizeBookingCode = (value: string | null | undefined): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.toUpperCase() : undefined
}

export const buildTimesheetRows = (input: {
  selectedWeekStart: Date
  selectedWeekEnd: Date
  sessions: TaskSession[]
  calendarEvents: CalendarEvent[]
  calendarLinks: CalendarEventLink[]
  manualCustomTaskEntries: ManualCustomTaskEntry[]
  customTaskCategories: CustomTaskCategory[]
  workingHours: WorkingHoursSchedule
}): TimesheetRow[] => {
  const bookingMinutesByDay = new Map<string, Map<string, number>>()
  const overheadMinutesByDay = new Map<string, number>()
  const sessionSegmentsByDay = new Map<string, SessionBookingSegment[]>()

  const addBookingMinutes = (dayKey: string, bookingCode: string, minutes: number): void => {
    if (minutes <= 0) return
    const dayBookings = bookingMinutesByDay.get(dayKey) ?? new Map<string, number>()
    dayBookings.set(bookingCode, (dayBookings.get(bookingCode) ?? 0) + minutes)
    bookingMinutesByDay.set(dayKey, dayBookings)
  }

  const subtractBookingMinutes = (dayKey: string, bookingCode: string, minutes: number): number => {
    if (minutes <= 0) return 0
    const dayBookings = bookingMinutesByDay.get(dayKey)
    if (!dayBookings) return 0
    const current = dayBookings.get(bookingCode) ?? 0
    if (current <= 0) return 0
    const deducted = Math.min(current, minutes)
    const next = current - deducted
    if (next > 0) dayBookings.set(bookingCode, next)
    else dayBookings.delete(bookingCode)
    return deducted
  }

  const addOverheadMinutes = (dayKey: string, minutes: number): void => {
    if (minutes <= 0) return
    overheadMinutesByDay.set(dayKey, (overheadMinutesByDay.get(dayKey) ?? 0) + minutes)
  }

  const registerSessionSegment = (
    dayKey: string,
    startMs: number,
    endMs: number,
    bookingCode: string,
    minutes: number
  ): void => {
    if (minutes <= 0) return
    const daySegments = sessionSegmentsByDay.get(dayKey) ?? []
    daySegments.push({ startMs, endMs, bookingCode, remainingMinutes: minutes })
    sessionSegmentsByDay.set(dayKey, daySegments)
  }

  const reclassifyIntervalMinutes = (
    intervalStart: Date,
    intervalEnd: Date,
    minutesToReclassify: number,
    targetBookingCode?: string
  ): void => {
    if (minutesToReclassify <= 0 || intervalEnd <= intervalStart) return

    const segments = getWorkingTimeSegments(intervalStart, intervalEnd, input.workingHours)
    let minutesLeft = minutesToReclassify

    for (const segment of segments) {
      if (minutesLeft <= 0) break

      const daySegments = sessionSegmentsByDay
        .get(segment.dayKey)
        ?.filter(
          (item) =>
            item.remainingMinutes > 0 &&
            item.endMs > segment.start.getTime() &&
            item.startMs < segment.end.getTime()
        )
        .sort((a, b) => a.startMs - b.startMs)

      if (!daySegments || daySegments.length === 0) continue

      for (const daySegment of daySegments) {
        if (minutesLeft <= 0) break
        const consumed = Math.min(minutesLeft, daySegment.remainingMinutes)
        if (consumed <= 0) continue

        daySegment.remainingMinutes -= consumed
        minutesLeft -= consumed

        if (targetBookingCode && daySegment.bookingCode === targetBookingCode) continue

        const deducted = subtractBookingMinutes(segment.dayKey, daySegment.bookingCode, consumed)
        if (deducted <= 0) continue
        if (targetBookingCode) addBookingMinutes(segment.dayKey, targetBookingCode, deducted)
        else addOverheadMinutes(segment.dayKey, deducted)
      }
    }

    if (minutesLeft > 0) {
      const dayKey = toLocalDateKey(intervalStart)
      if (targetBookingCode) addBookingMinutes(dayKey, targetBookingCode, minutesLeft)
      else addOverheadMinutes(dayKey, minutesLeft)
    }
  }

  const categoryBookingCodeByName = new Map(
    input.customTaskCategories.map(
      (category) => [category.name, normalizeBookingCode(category.bookingCode)] as const
    )
  )
  const eventLinkById = new Map(input.calendarLinks.map((link) => [link.eventId, link] as const))

  for (const session of input.sessions) {
    const start = new Date(session.startIso)
    const end = session.endIso ? new Date(session.endIso) : new Date()
    const clippedStart = new Date(Math.max(start.getTime(), input.selectedWeekStart.getTime()))
    const clippedEnd = new Date(Math.min(end.getTime(), input.selectedWeekEnd.getTime()))
    if (clippedEnd <= clippedStart) continue

    const bookingCode = normalizeBookingCode(session.bookingCode) ?? UNASSIGNED_BOOKING_CODE
    const segments = getWorkingTimeSegments(clippedStart, clippedEnd, input.workingHours)
    for (const segment of segments) {
      const minutes = Math.max(0, Math.floor(segment.seconds / 60))
      if (minutes <= 0) continue
      addBookingMinutes(segment.dayKey, bookingCode, minutes)
      registerSessionSegment(
        segment.dayKey,
        segment.start.getTime(),
        segment.end.getTime(),
        bookingCode,
        minutes
      )
    }
  }

  for (const event of input.calendarEvents) {
    const link = eventLinkById.get(event.id)
    const classification = String(link?.classification ?? '')
    if (classification !== 'custom-task' && classification !== 'off-task') continue

    const start = new Date(event.startIso)
    const end = new Date(event.endIso)
    const clippedStart = new Date(Math.max(start.getTime(), input.selectedWeekStart.getTime()))
    const clippedEnd = new Date(Math.min(end.getTime(), input.selectedWeekEnd.getTime()))
    if (clippedEnd <= clippedStart) continue

    const minutes =
      (event.source === 'off-task' || event.source === 'planning') &&
      typeof event.plannedMinutes === 'number' &&
      Number.isFinite(event.plannedMinutes)
        ? Math.max(0, Math.floor(event.plannedMinutes))
        : Math.max(0, Math.floor((clippedEnd.getTime() - clippedStart.getTime()) / 60000))

    const bookingCode = link?.customTaskCategory
      ? categoryBookingCodeByName.get(link.customTaskCategory)
      : undefined
    reclassifyIntervalMinutes(clippedStart, clippedEnd, minutes, bookingCode)
  }

  for (const entry of input.manualCustomTaskEntries) {
    const entryDate = new Date(`${entry.date}T00:00:00`)
    if (entryDate < input.selectedWeekStart || entryDate >= input.selectedWeekEnd) continue

    const dayStart = new Date(`${entry.date}T00:00:00`)
    const dayEnd = new Date(`${entry.date}T23:59:59`)
    const clippedStart = new Date(Math.max(dayStart.getTime(), input.selectedWeekStart.getTime()))
    const clippedEnd = new Date(Math.min(dayEnd.getTime(), input.selectedWeekEnd.getTime()))
    if (clippedEnd <= clippedStart) continue

    const minutes = Math.max(0, Math.floor(entry.minutes))
    const bookingCode = categoryBookingCodeByName.get(entry.category)
    reclassifyIntervalMinutes(clippedStart, clippedEnd, minutes, bookingCode)
  }

  return getWeekDays(input.selectedWeekStart).map((day) => {
    const dayKey = toLocalDateKey(day)
    const bookings = [...(bookingMinutesByDay.get(dayKey)?.entries() ?? [])]
      .map(([code, minutes]) => ({ code, minutes }))
      .sort((a, b) => b.minutes - a.minutes)

    const bookedMinutes = bookings.reduce((sum, item) => sum + item.minutes, 0)
    const overheadMinutes = overheadMinutesByDay.get(dayKey) ?? 0
    const totalMinutes = bookedMinutes + overheadMinutes

    return {
      dayKey,
      day: day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      bookings,
      bookedMinutes,
      overheadMinutes,
      totalMinutes,
      isEmpty: totalMinutes === 0
    }
  })
}
