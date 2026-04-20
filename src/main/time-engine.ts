import type {
  CalendarEvent,
  CalendarEventLink,
  TaskSession,
  WorkingHoursSchedule,
  WorklogDraft
} from '../shared/types'
import { calculateWorkingSecondsBetween } from '../shared/working-hours'

const formatDuration = (seconds: number): string => {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes}m`
}

export const buildWorklogDraft = (input: {
  session: TaskSession
  nowIso: string
  calendarEvents: CalendarEvent[]
  calendarLinks: CalendarEventLink[]
  workingHours: WorkingHoursSchedule
  rangeStartIso?: string
  rangeEndIso?: string
}): WorklogDraft => {
  const sessionStart = new Date(input.session.startIso)
  const sessionEnd = new Date(input.session.endIso ?? input.nowIso)

  const requestStartMs = input.rangeStartIso ? new Date(input.rangeStartIso).getTime() : sessionStart.getTime()
  const requestEndMs = input.rangeEndIso ? new Date(input.rangeEndIso).getTime() : sessionEnd.getTime()

  const clippedStartMs = Number.isFinite(requestStartMs)
    ? Math.max(sessionStart.getTime(), requestStartMs)
    : sessionStart.getTime()
  const clippedEndMs = Number.isFinite(requestEndMs)
    ? Math.min(sessionEnd.getTime(), requestEndMs)
    : sessionEnd.getTime()

  const draftStart = new Date(clippedStartMs)
  const draftEnd = new Date(clippedEndMs)

  const linksByEventId = new Map(input.calendarLinks.map((link) => [link.eventId, link]))

  const totalWorkingSeconds =
    draftEnd > draftStart
      ? calculateWorkingSecondsBetween(draftStart, draftEnd, input.workingHours)
      : 0

  const blockedIntervals: Array<{ startMs: number; endMs: number }> = []
  for (const event of input.calendarEvents) {
    const link = linksByEventId.get(event.id)
    const classification = link?.classification ?? 'unclassified'

    if (classification === 'primary-task' || classification === 'ignored') continue

    const eventStart = new Date(event.startIso).getTime()
    const eventEnd = new Date(event.endIso).getTime()
    const startMs = Math.max(draftStart.getTime(), eventStart)
    const endMs = Math.min(draftEnd.getTime(), eventEnd)
    if (endMs <= startMs) continue

    blockedIntervals.push({ startMs, endMs })
  }

  blockedIntervals.sort((a, b) => a.startMs - b.startMs)
  const merged: Array<{ startMs: number; endMs: number }> = []
  for (const interval of blockedIntervals) {
    const last = merged[merged.length - 1]
    if (!last || interval.startMs > last.endMs) {
      merged.push({ ...interval })
    } else if (interval.endMs > last.endMs) {
      last.endMs = interval.endMs
    }
  }

  let blockedWorkingSeconds = 0
  for (const interval of merged) {
    blockedWorkingSeconds += calculateWorkingSecondsBetween(
      new Date(interval.startMs),
      new Date(interval.endMs),
      input.workingHours
    )
  }

  const activeSeconds = Math.max(0, totalWorkingSeconds - blockedWorkingSeconds)

  const bookingCodeText = input.session.bookingCode ? ` [${input.session.bookingCode}]` : ''
  const comment = `${input.session.jiraIssueKey}${bookingCodeText} - focused work. ${formatDuration(activeSeconds)}.`

  return {
    issueKey: input.session.jiraIssueKey,
    startedIso: draftStart.toISOString(),
    timeSpentSeconds: activeSeconds,
    comment
  }
}
