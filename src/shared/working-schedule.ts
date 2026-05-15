import type {
  DailyWorkingHours,
  WeekdayKey,
  WeeklyWorkingHoursOverrides,
  WorkingHoursSchedule,
  WorkingTimeSegment
} from './types'
import { DEFAULT_WORKING_HOURS } from './defaults'
import { WEEKDAY_KEYS } from './types'

// ─── Private helpers ──────────────────────────────────────────────────────────

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

const parseTimeToMinutes = (value: string): number | null => {
  const match = value.trim().match(TIME_24H_REGEX)
  if (!match) return null
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10)
}

const sanitizeDailyHours = (candidate: unknown, fallback: DailyWorkingHours): DailyWorkingHours => {
  if (!candidate || typeof candidate !== 'object') return fallback
  const c = candidate as Record<string, unknown>
  const start = typeof c.start === 'string' ? c.start.trim() : ''
  const end = typeof c.end === 'string' ? c.end.trim() : ''
  const result: DailyWorkingHours = {
    start: parseTimeToMinutes(start) !== null ? start : fallback.start,
    end: parseTimeToMinutes(end) !== null ? end : fallback.end
  }
  if (typeof c.lunchDurationMins === 'number' && c.lunchDurationMins >= 0) {
    result.lunchDurationMins = Math.round(c.lunchDurationMins)
  } else if (typeof c.lunchDurationMins === 'string') {
    const parsed = Number.parseInt(c.lunchDurationMins, 10)
    if (!Number.isNaN(parsed) && parsed >= 0) result.lunchDurationMins = parsed
  }
  return result
}

const getWorkingWindowsForDate = (
  date: Date,
  schedule: WorkingHoursSchedule
): Array<{ start: Date; end: Date }> => {
  const hours = schedule[DAY_INDEX_TO_KEY[date.getDay()]]
  if (!hours) return []

  const startMinutes = parseTimeToMinutes(hours.start)
  const endMinutes = parseTimeToMinutes(hours.end)
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return []

  const workStart = new Date(date)
  workStart.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)
  const workEnd = new Date(date)
  workEnd.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0)

  if (hours.lunchDurationMins && hours.lunchDurationMins > 0) {
    const lunchStartMins = 12 * 60
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

// ─── WorkingSchedule class ────────────────────────────────────────────────────

export class WorkingSchedule {
  private readonly defaultSchedule: WorkingHoursSchedule
  private readonly weeklyOverrides: WeeklyWorkingHoursOverrides

  constructor(
    defaultWorkingHours: WorkingHoursSchedule,
    weeklyOverrides: WeeklyWorkingHoursOverrides = {}
  ) {
    this.defaultSchedule = WorkingSchedule.sanitize(defaultWorkingHours)
    this.weeklyOverrides = weeklyOverrides
  }

  // ── Instance API ────────────────────────────────────────────────────────────

  /** Returns the effective sanitized schedule for the week containing `date`. */
  getScheduleForDate(date: Date): WorkingHoursSchedule {
    const weekStartKey = WorkingSchedule.getWeekStartKey(date)
    return WorkingSchedule.sanitize(this.weeklyOverrides[weekStartKey] ?? this.defaultSchedule)
  }

  /** Working time segments within [start, end), respecting per-week overrides. */
  getWorkingTimeSegments(start: Date, end: Date): WorkingTimeSegment[] {
    if (end.getTime() <= start.getTime()) return []

    const segments: WorkingTimeSegment[] = []
    const cursor = new Date(start)
    cursor.setHours(0, 0, 0, 0)
    const lastDay = new Date(end)
    lastDay.setHours(0, 0, 0, 0)

    while (cursor.getTime() <= lastDay.getTime()) {
      const schedule = this.getScheduleForDate(cursor)
      for (const window of getWorkingWindowsForDate(cursor, schedule)) {
        const segStartMs = Math.max(start.getTime(), window.start.getTime())
        const segEndMs = Math.min(end.getTime(), window.end.getTime())
        if (segEndMs > segStartMs) {
          segments.push({
            dayKey: WorkingSchedule.toLocalDateKey(cursor),
            start: new Date(segStartMs),
            end: new Date(segEndMs),
            seconds: Math.floor((segEndMs - segStartMs) / 1000)
          })
        }
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    return segments
  }

  /** Total working seconds within [start, end), respecting per-week overrides. */
  calculateWorkingSeconds(start: Date, end: Date): number {
    return this.getWorkingTimeSegments(start, end).reduce((sum, s) => sum + s.seconds, 0)
  }

  /**
   * Earliest and latest working-hour boundaries across all weekdays,
   * buffered by ±3 hours. Used to set the visible range in the calendar.
   */
  getCalendarDayBoundaries(): { start: string; end: string } {
    let start = '06:00'
    let end = '20:00'
    let found = false

    for (const day of WEEKDAY_KEYS) {
      const hours = this.defaultSchedule[day]
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

    const pad = (n: number): string =>
      String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0')
    const buffer = 180
    const startMins = parseTimeToMinutes(start)
    const endMins = parseTimeToMinutes(end)
    return {
      start: startMins !== null ? pad(Math.max(0, startMins - buffer)) : start,
      end: endMins !== null ? pad(Math.min(1439, endMins + buffer)) : end
    }
  }

  // ── Static utilities ────────────────────────────────────────────────────────

  /** Sanitizes and normalises a `WorkingHoursSchedule`, filling missing values from defaults. */
  static sanitize(candidate: unknown): WorkingHoursSchedule {
    const source = candidate && typeof candidate === 'object' ? candidate : {}
    const s = source as Partial<Record<WeekdayKey, unknown>>
    return {
      monday: sanitizeDailyHours(s.monday, DEFAULT_WORKING_HOURS.monday),
      tuesday: sanitizeDailyHours(s.tuesday, DEFAULT_WORKING_HOURS.tuesday),
      wednesday: sanitizeDailyHours(s.wednesday, DEFAULT_WORKING_HOURS.wednesday),
      thursday: sanitizeDailyHours(s.thursday, DEFAULT_WORKING_HOURS.thursday),
      friday: sanitizeDailyHours(s.friday, DEFAULT_WORKING_HOURS.friday),
      saturday: sanitizeDailyHours(s.saturday, DEFAULT_WORKING_HOURS.saturday),
      sunday: sanitizeDailyHours(s.sunday, DEFAULT_WORKING_HOURS.sunday)
    }
  }

  /** Formats a `Date` as a local `YYYY-MM-DD` key. */
  static toLocalDateKey(date: Date): string {
    const y = date.getFullYear()
    const m = `${date.getMonth() + 1}`.padStart(2, '0')
    const d = `${date.getDate()}`.padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  /** Returns the Monday of the week containing `date` (midnight local). */
  static getWeekStartDate(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay()
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
    d.setHours(0, 0, 0, 0)
    return d
  }

  /** `YYYY-MM-DD` key for the Monday of the week containing `date`. */
  static getWeekStartKey(date: Date): string {
    return WorkingSchedule.toLocalDateKey(WorkingSchedule.getWeekStartDate(date))
  }
}
