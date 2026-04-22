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

  const timeSuffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
  return new Date(`${value.toString()}${timeSuffix}`).toISOString()
}

export const planningWindowFromDateTime = (
  dateTime: Temporal.ZonedDateTime
): { startIso: string; endIso: string } => {
  const day = dateTime.toPlainDate().toString()
  const start = new Date(`${day}T00:00:00.000Z`)
  const end = new Date(`${day}T23:59:59.999Z`)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export const planningWindowFromDate = (
  date: Temporal.PlainDate
): { startIso: string; endIso: string } => {
  const start = new Date(`${date.toString()}T00:00:00.000Z`)
  const end = new Date(`${date.toString()}T23:59:59.999Z`)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export const toTemporalDateForPlanning = (
  startIso: string,
  endIso: string
): { start: Temporal.PlainDate; end: Temporal.PlainDate } => {
  const startDate = Temporal.PlainDate.from(new Date(startIso).toISOString().slice(0, 10))
  const endDate = Temporal.PlainDate.from(new Date(endIso).toISOString().slice(0, 10))
  return { start: startDate, end: endDate }
}

export const isDayScopedOffTaskSource = (source: ScheduleXEventSource): boolean =>
  source === 'off-task' || source === 'planning'

export const isDayScopedOffTaskEvent = (event: CalendarEvent): boolean =>
  event.source === 'off-task' || event.source === 'planning'
