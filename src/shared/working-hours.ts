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

  const c = candidate as Record<string, unknown>
  const start = typeof c.start === 'string' ? c.start.trim() : ''
  const end = typeof c.end === 'string' ? c.end.trim() : ''

  const startValid = parseTimeToMinutes(start) !== null
  const endValid = parseTimeToMinutes(end) !== null

  const result: DailyWorkingHours = {
    start: startValid ? start : fallback.start,
    end: endValid ? end : fallback.end
  }

  // Current format: lunchDurationMins
  if (typeof c.lunchDurationMins === 'number' && c.lunchDurationMins >= 0) {
    result.lunchDurationMins = Math.round(c.lunchDurationMins)
  } else if (typeof c.lunchDurationMins === 'string') {
    const parsed = Number.parseInt(c.lunchDurationMins, 10)
    if (!Number.isNaN(parsed) && parsed >= 0) result.lunchDurationMins = parsed
  }

  return result
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

const getWindowsForDate = (
  date: Date,
  schedule: WorkingHoursSchedule
): Array<{ start: Date; end: Date }> => {
  const dayKey = getWeekdayKey(date)
  const hours = schedule[dayKey]
  if (!hours) return []

  const startMinutes = parseTimeToMinutes(hours.start)
  const endMinutes = parseTimeToMinutes(hours.end)
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return []

  const workStart = new Date(date)
  workStart.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)
  const workEnd = new Date(date)
  workEnd.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0)

  if (hours.lunchDurationMins && hours.lunchDurationMins > 0) {
    const lunchStartMins = 12 * 60 // fixed at 12:00
    const lunchEndMins = lunchStartMins + hours.lunchDurationMins
    if (lunchStartMins > startMinutes && lunchEndMins < endMinutes) {
      const lunchStart = new Date(date)
      lunchStart.setHours(Math.floor(lunchStartMins / 60), lunchStartMins % 60, 0, 0)
      const lunchEnd = new Date(date)
      lunchEnd.setHours(Math.floor(lunchEndMins / 60), lunchEndMins % 60, 0, 0)
      return [
        { start: workStart, end: lunchStart },
        { start: lunchEnd, end: workEnd }
      ]
    }
  }

  return [{ start: workStart, end: workEnd }]
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
    const windows = getWindowsForDate(cursor, schedule)
    for (const window of windows) {
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
    let startMinutes = parseTimeToMinutes(hours.start)
    let endMinutes = parseTimeToMinutes(hours.end)

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

  const startMins = parseTimeToMinutes(start)
  const endMins = parseTimeToMinutes(end)
  const bufferAmount = 180 // minutes
  const bufferedStart =
    startMins !== null
      ? `${String(Math.floor(Math.max(0, startMins - bufferAmount) / 60)).padStart(2, '0')}:${String(Math.max(0, startMins - bufferAmount) % 60).padStart(2, '0')}`
      : start
  const bufferedEnd =
    endMins !== null
      ? `${String(Math.floor(Math.min(1439, endMins + bufferAmount) / 60)).padStart(2, '0')}:${String(Math.min(1439, endMins + bufferAmount) % 60).padStart(2, '0')}`
      : end

  return { start: bufferedStart, end: bufferedEnd }
}
