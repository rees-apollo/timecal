import type { WeeklyWorkingHoursOverrides, WorkingHoursSchedule } from './types'
import {
  calculateWorkingSecondsBetween,
  getWeekStartDate,
  getWeekStartKey,
  sanitizeWorkingHoursSchedule
} from './working-hours'

const getEffectiveWorkingHoursForDate = (
  date: Date,
  defaultWorkingHours: WorkingHoursSchedule,
  weeklyWorkingHoursOverrides: WeeklyWorkingHoursOverrides
): WorkingHoursSchedule => {
  const weekStartKey = getWeekStartKey(date)
  return sanitizeWorkingHoursSchedule(
    weeklyWorkingHoursOverrides[weekStartKey] ?? defaultWorkingHours
  )
}

export const calculateWorkingSecondsWithWeeklyOverrides = (input: {
  start: Date
  end: Date
  defaultWorkingHours: WorkingHoursSchedule
  weeklyWorkingHoursOverrides: WeeklyWorkingHoursOverrides
}): number => {
  const { start, end, defaultWorkingHours, weeklyWorkingHoursOverrides } = input
  if (end <= start) return 0

  let totalSeconds = 0
  let cursor = new Date(start)

  while (cursor < end) {
    const weekStart = getWeekStartDate(cursor)
    const nextWeekStart = new Date(weekStart)
    nextWeekStart.setDate(nextWeekStart.getDate() + 7)

    const intervalEnd = new Date(Math.min(end.getTime(), nextWeekStart.getTime()))
    if (intervalEnd <= cursor) break

    const schedule = getEffectiveWorkingHoursForDate(
      cursor,
      defaultWorkingHours,
      weeklyWorkingHoursOverrides
    )
    totalSeconds += calculateWorkingSecondsBetween(cursor, intervalEnd, schedule)
    cursor = intervalEnd
  }

  return totalSeconds
}
