import type {
  CalendarEvent,
  CalendarEventLink,
  LoggedWorklogEntry,
  TaskSession,
  WorkingHoursSchedule
} from './types'
import { calculateActiveTaskSecondsForRange } from './task-time'

export type SessionWorklogMinutes = {
  remaining: number
  logged: number
}

export const calculateSessionWorklogMinutesForRange = (input: {
  session: TaskSession
  rangeStart: Date
  rangeEnd: Date
  calendarEvents: CalendarEvent[]
  calendarLinks: CalendarEventLink[]
  workingHours: WorkingHoursSchedule
  loggedWorklogs: LoggedWorklogEntry[]
}): SessionWorklogMinutes => {
  const {
    session,
    rangeStart,
    rangeEnd,
    calendarEvents,
    calendarLinks,
    workingHours,
    loggedWorklogs
  } = input

  const sessionStart = new Date(session.startIso)
  const sessionEnd = new Date(session.endIso ?? new Date().toISOString())
  const clippedStart = new Date(Math.max(sessionStart.getTime(), rangeStart.getTime()))
  const clippedEnd = new Date(Math.min(sessionEnd.getTime(), rangeEnd.getTime()))
  if (clippedEnd <= clippedStart) return { remaining: 0, logged: 0 }

  const requestRangeStartIso = rangeStart.toISOString()
  const requestRangeEndIso = rangeEnd.toISOString()

  const activeSeconds = calculateActiveTaskSecondsForRange({
    start: clippedStart,
    end: clippedEnd,
    calendarEvents,
    calendarLinks,
    workingHours
  })

  const loggedSeconds = loggedWorklogs
    .filter(
      (entry) =>
        entry.sourceSessionId === session.id &&
        (entry.rangeStartIso ?? '') === requestRangeStartIso &&
        (entry.rangeEndIso ?? '') === requestRangeEndIso
    )
    .reduce((sum, entry) => sum + entry.timeSpentSeconds, 0)

  return {
    remaining: Math.max(0, Math.floor((activeSeconds - loggedSeconds) / 60)),
    logged: Math.max(0, Math.floor(loggedSeconds / 60))
  }
}
