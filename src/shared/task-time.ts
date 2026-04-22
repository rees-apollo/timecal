import type { CalendarEvent, CalendarEventLink, WorkingHoursSchedule } from './types'
import { calculateWorkingSecondsBetween } from './working-hours'

type TimeInterval = { startMs: number; endMs: number }

const mergeIntervals = (intervals: TimeInterval[]): TimeInterval[] => {
  if (intervals.length === 0) return []

  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs)
  const merged: TimeInterval[] = []

  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (!last || interval.startMs > last.endMs) {
      merged.push({ ...interval })
      continue
    }

    if (interval.endMs > last.endMs) {
      last.endMs = interval.endMs
    }
  }

  return merged
}

const getBlockedIntervals = (
  start: Date,
  end: Date,
  calendarEvents: CalendarEvent[],
  linksByEventId: Map<string, CalendarEventLink>
): TimeInterval[] => {
  const intervals: TimeInterval[] = []
  const rangeStartMs = start.getTime()
  const rangeEndMs = end.getTime()

  for (const event of calendarEvents) {
    const classification = linksByEventId.get(event.id)?.classification ?? 'unclassified'
    if (classification === 'primary-task' || classification === 'ignored') continue

    const startMs = Math.max(rangeStartMs, new Date(event.startIso).getTime())
    const endMs = Math.min(rangeEndMs, new Date(event.endIso).getTime())
    if (endMs <= startMs) continue

    intervals.push({ startMs, endMs })
  }

  return mergeIntervals(intervals)
}

export const calculateActiveTaskSecondsForRange = (input: {
  start: Date
  end: Date
  calendarEvents: CalendarEvent[]
  calendarLinks: CalendarEventLink[]
  workingHours: WorkingHoursSchedule
}): number => {
  const { start, end, calendarEvents, calendarLinks, workingHours } = input
  if (end <= start) return 0

  const totalWorkingSeconds = calculateWorkingSecondsBetween(start, end, workingHours)
  if (totalWorkingSeconds <= 0) return 0

  const linksByEventId = new Map(calendarLinks.map((link) => [link.eventId, link]))
  const blockedIntervals = getBlockedIntervals(start, end, calendarEvents, linksByEventId)

  const blockedWorkingSeconds = blockedIntervals.reduce((sum, interval) => {
    return (
      sum +
      calculateWorkingSecondsBetween(
        new Date(interval.startMs),
        new Date(interval.endMs),
        workingHours
      )
    )
  }, 0)

  return Math.max(0, totalWorkingSeconds - blockedWorkingSeconds)
}
