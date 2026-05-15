import type { CalendarEvent } from '../../../../../shared/types'
import { Temporal } from 'temporal-polyfill'
import type { ScheduleXEventSource } from './types'

const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/
const SCHEDULE_X_DAY_BOUNDARY_REGEX = /^(?:[01]\d|2[0-4]):00$/
const SAFE_DAY_BOUNDARIES = { start: '06:00', end: '20:00' } as const

const toBoundaryMinutes = (value: string): number | null => {
  if (!SCHEDULE_X_DAY_BOUNDARY_REGEX.test(value)) return null
  const [hour, minute] = value.split(':').map((part) => Number.parseInt(part, 10))
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (hour < 0 || hour > 24 || minute !== 0) return null
  return hour * 60
}

const toScheduleXBoundary = (value: unknown, role: 'start' | 'end'): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const match = trimmed.match(HHMM_REGEX)
  if (!match) return null

  const hour = Number.parseInt(match[1], 10)
  const minute = Number.parseInt(match[2], 10)

  if (role === 'start') {
    return `${String(hour).padStart(2, '0')}:00`
  }

  if (minute === 0) return `${String(hour).padStart(2, '0')}:00`
  if (hour === 23) return '24:00'
  return `${String(hour + 1).padStart(2, '0')}:00`
}

export const normalizeDayBoundaries = (candidate: {
  start: string
  end: string
}): { start: string; end: string } => {
  const start = toScheduleXBoundary(candidate.start, 'start')
  const end = toScheduleXBoundary(candidate.end, 'end')
  if (!start || !end) {
    return { ...SAFE_DAY_BOUNDARIES }
  }

  const startMinutes = toBoundaryMinutes(start)
  const endMinutes = toBoundaryMinutes(end)
  if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
    return { ...SAFE_DAY_BOUNDARIES }
  }

  return { start, end }
}

export const temporalToIso = (
  value: Temporal.ZonedDateTime | Temporal.PlainDate,
  endOfDay = false
): string => {
  if (value instanceof Temporal.ZonedDateTime) {
    return new Date(value.epochMilliseconds).toISOString()
  }

  // Convert plain date to local-timezone midnight / end-of-day, not UTC, so
  // that the stored ISO instant matches the user's local calendar day.
  const localTz = Temporal.Now.timeZoneId()
  const plainTime = endOfDay
    ? { hour: 23, minute: 59, second: 59, millisecond: 999 }
    : { hour: 0, minute: 0, second: 0, millisecond: 0 }
  return value.toZonedDateTime({ timeZone: localTz, plainTime }).toInstant().toString()
}

export const planningWindowFromDateTime = (
  dateTime: Temporal.ZonedDateTime
): { startIso: string; endIso: string } => {
  const day = dateTime.toPlainDate()
  const tz = dateTime.timeZoneId
  const start = day.toZonedDateTime(tz).toInstant().toString()
  const end = day
    .toZonedDateTime({ timeZone: tz, plainTime: { hour: 23, minute: 59, second: 59, millisecond: 999 } })
    .toInstant()
    .toString()
  return { startIso: start, endIso: end }
}

export const planningWindowFromDate = (
  date: Temporal.PlainDate
): { startIso: string; endIso: string } => {
  const tz = Temporal.Now.timeZoneId()
  const start = date.toZonedDateTime(tz).toInstant().toString()
  const end = date
    .toZonedDateTime({ timeZone: tz, plainTime: { hour: 23, minute: 59, second: 59, millisecond: 999 } })
    .toInstant()
    .toString()
  return { startIso: start, endIso: end }
}

export const toTemporalDateForPlanning = (
  startIso: string,
  endIso: string
): { start: Temporal.PlainDate; end: Temporal.PlainDate } => {
  // Use local timezone to convert ISO instant → PlainDate so that an event
  // starting at local midnight is attributed to the correct local calendar day.
  const tz = Temporal.Now.timeZoneId()
  const startDate = Temporal.Instant.from(startIso).toZonedDateTimeISO(tz).toPlainDate()
  const endDate = Temporal.Instant.from(endIso).toZonedDateTimeISO(tz).toPlainDate()
  return { start: startDate, end: endDate }
}

export const isDayScopedOffTaskSource = (source: ScheduleXEventSource): boolean =>
  source === 'off-task' || source === 'planning'

export const isDayScopedOffTaskEvent = (event: CalendarEvent): boolean =>
  event.source === 'off-task' || event.source === 'planning'
