import type { DailyWorkingHours, WeekdayKey, WorkingHoursSchedule } from './types'
import { DEFAULT_WORKING_HOURS } from './defaults'

const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

const DAY_INDEX_TO_KEY: WeekdayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
]

export const WEEKDAY_KEYS: WeekdayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
]

const parseTimeToMinutes = (value: string): number | null => {
  const match = value.trim().match(TIME_24H_REGEX)
  if (!match) return null
  const hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  return hours * 60 + minutes
}

const sanitizeDailyWorkingHours = (
  candidate: unknown,
  fallback: DailyWorkingHours
): DailyWorkingHours => {
  if (!candidate || typeof candidate !== 'object') return fallback

  const start =
    typeof (candidate as { start?: unknown }).start === 'string'
      ? ((candidate as { start: string }).start ?? '').trim()
      : ''
  const end =
    typeof (candidate as { end?: unknown }).end === 'string'
      ? ((candidate as { end: string }).end ?? '').trim()
      : ''

  const startValid = parseTimeToMinutes(start) !== null
  const endValid = parseTimeToMinutes(end) !== null

  return {
    start: startValid ? start : fallback.start,
    end: endValid ? end : fallback.end
  }
}

export const sanitizeWorkingHoursSchedule = (candidate: unknown): WorkingHoursSchedule => {
  const source = candidate && typeof candidate === 'object' ? candidate : {}
  const sourceRecord = source as Partial<Record<WeekdayKey, unknown>>

  return {
    monday: sanitizeDailyWorkingHours(sourceRecord.monday, DEFAULT_WORKING_HOURS.monday),
    tuesday: sanitizeDailyWorkingHours(sourceRecord.tuesday, DEFAULT_WORKING_HOURS.tuesday),
    wednesday: sanitizeDailyWorkingHours(sourceRecord.wednesday, DEFAULT_WORKING_HOURS.wednesday),
    thursday: sanitizeDailyWorkingHours(sourceRecord.thursday, DEFAULT_WORKING_HOURS.thursday),
    friday: sanitizeDailyWorkingHours(sourceRecord.friday, DEFAULT_WORKING_HOURS.friday),
    saturday: sanitizeDailyWorkingHours(sourceRecord.saturday, DEFAULT_WORKING_HOURS.saturday),
    sunday: sanitizeDailyWorkingHours(sourceRecord.sunday, DEFAULT_WORKING_HOURS.sunday)
  }
}

export const toLocalDateKey = (date: Date): string => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const getWeekStartDate = (date: Date): Date => {
  const weekStart = new Date(date)
  const day = weekStart.getDay()
  const diff = day === 0 ? -6 : 1 - day
  weekStart.setDate(weekStart.getDate() + diff)
  weekStart.setHours(0, 0, 0, 0)
  return weekStart
}

export const getWeekStartKey = (date: Date): string => toLocalDateKey(getWeekStartDate(date))

const getWeekdayKey = (date: Date): WeekdayKey => DAY_INDEX_TO_KEY[date.getDay()]

const getWindowForDate = (
  date: Date,
  schedule: WorkingHoursSchedule
): { start: Date; end: Date } | null => {
  const dayKey = getWeekdayKey(date)
  const hours = schedule[dayKey]
  if (!hours) return null

  const startMinutes = parseTimeToMinutes(hours.start)
  const endMinutes = parseTimeToMinutes(hours.end)
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null

  const start = new Date(date)
  start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)

  const end = new Date(date)
  end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0)

  return { start, end }
}

export interface WorkingTimeSegment {
  dayKey: string
  start: Date
  end: Date
  seconds: number
}

export const getWorkingTimeSegments = (
  start: Date,
  end: Date,
  schedule: WorkingHoursSchedule
): WorkingTimeSegment[] => {
  if (end.getTime() <= start.getTime()) return []

  const segments: WorkingTimeSegment[] = []
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)

  const lastDay = new Date(end)
  lastDay.setHours(0, 0, 0, 0)

  while (cursor.getTime() <= lastDay.getTime()) {
    const window = getWindowForDate(cursor, schedule)
    if (window) {
      const segmentStartMs = Math.max(start.getTime(), window.start.getTime())
      const segmentEndMs = Math.min(end.getTime(), window.end.getTime())

      if (segmentEndMs > segmentStartMs) {
        segments.push({
          dayKey: toLocalDateKey(cursor),
          start: new Date(segmentStartMs),
          end: new Date(segmentEndMs),
          seconds: Math.floor((segmentEndMs - segmentStartMs) / 1000)
        })
      }
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  return segments
}

export const calculateWorkingSecondsBetween = (
  start: Date,
  end: Date,
  schedule: WorkingHoursSchedule
): number => {
  return getWorkingTimeSegments(start, end, schedule).reduce(
    (acc, segment) => acc + segment.seconds,
    0
  )
}

export const getCalendarDayBoundaries = (
  schedule: WorkingHoursSchedule
): { start: string; end: string } => {
  let start = '06:00'
  let end = '20:00'
  let found = false

  for (const day of WEEKDAY_KEYS) {
    const hours = schedule[day]
    const startMinutes = parseTimeToMinutes(hours.start)
    const endMinutes = parseTimeToMinutes(hours.end)
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) continue

    if (!found) {
      start = hours.start
      end = hours.end
      found = true
      continue
    }

    if (hours.start < start) start = hours.start
    if (hours.end > end) end = hours.end
  }

  return { start, end }
}
