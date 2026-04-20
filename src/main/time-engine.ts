import type {
  CalendarEvent,
  CalendarEventLink,
  CustomTaskBucket,
  CustomTaskCategory,
  ManualCustomTaskEntry,
  TaskSession,
  WorkingHoursSchedule,
  WorklogDraft
} from '../shared/types'
import { calculateWorkingSecondsBetween } from '../shared/working-hours'

const eventDurationSeconds = (event: CalendarEvent): number => {
  const start = new Date(event.startIso).getTime()
  const end = new Date(event.endIso).getTime()
  return Math.max(0, Math.floor((end - start) / 1000))
}

const offTaskEventSecondsForOverlap = (event: CalendarEvent, overlap: number): number => {
  if (event.source !== 'off-task' && event.source !== 'planning') return overlap
  if (typeof event.plannedMinutes !== 'number' || !Number.isFinite(event.plannedMinutes)) {
    return overlap
  }

  const plannedSeconds = Math.max(0, Math.floor(event.plannedMinutes * 60))
  const durationSeconds = eventDurationSeconds(event)
  if (plannedSeconds <= 0) return 0
  if (durationSeconds <= 0) return Math.min(overlap, plannedSeconds)

  const proportional = Math.round((overlap / durationSeconds) * plannedSeconds)
  return Math.max(0, Math.min(plannedSeconds, proportional))
}

const formatDuration = (seconds: number): string => {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes}m`
}

export const buildWorklogDraft = (input: {
  session: TaskSession
  nowIso: string
  calendarEvents: CalendarEvent[]
  calendarLinks: CalendarEventLink[]
  manualEntries: ManualCustomTaskEntry[]
  customTaskCategories: CustomTaskCategory[]
  workingHours: WorkingHoursSchedule
}): WorklogDraft => {
  const sessionStart = new Date(input.session.startIso)
  const sessionEnd = new Date(input.session.endIso ?? input.nowIso)
  const grossSeconds = calculateWorkingSecondsBetween(sessionStart, sessionEnd, input.workingHours)

  const linksByEventId = new Map(input.calendarLinks.map((link) => [link.eventId, link]))
  const buckets = new Map<string, number>()

  let eventCustomTaskSeconds = 0
  for (const event of input.calendarEvents) {
    const link = linksByEventId.get(event.id)
    if (!link || link.classification === 'primary-task' || link.classification === 'unclassified')
      continue

    const eventStart = new Date(event.startIso)
    const eventEnd = new Date(event.endIso)
    const overlapStart = new Date(Math.max(sessionStart.getTime(), eventStart.getTime()))
    const overlapEnd = new Date(Math.min(sessionEnd.getTime(), eventEnd.getTime()))
    const overlap = calculateWorkingSecondsBetween(overlapStart, overlapEnd, input.workingHours)
    if (overlap <= 0) continue

    const effectiveSeconds = offTaskEventSecondsForOverlap(event, overlap)
    if (effectiveSeconds <= 0) continue

    eventCustomTaskSeconds += effectiveSeconds
    const bucketKey =
      link.classification === 'other-ticket'
        ? 'other-ticket'
        : (link.customTaskCategory ?? 'calendar-custom-task')
    buckets.set(bucketKey, (buckets.get(bucketKey) ?? 0) + effectiveSeconds)
  }

  let manualCustomTaskSeconds = 0
  for (const entry of input.manualEntries) {
    const dayStart = new Date(`${entry.date}T00:00:00`)
    const dayEnd = new Date(`${entry.date}T23:59:59`)
    const overlapStart = new Date(Math.max(sessionStart.getTime(), dayStart.getTime()))
    const overlapEnd = new Date(Math.min(sessionEnd.getTime(), dayEnd.getTime()))
    const dayOverlap = calculateWorkingSecondsBetween(overlapStart, overlapEnd, input.workingHours)
    if (dayOverlap <= 0) continue

    const seconds = Math.min(Math.max(0, Math.floor(entry.minutes * 60)), dayOverlap)
    manualCustomTaskSeconds += seconds
    buckets.set(entry.category, (buckets.get(entry.category) ?? 0) + seconds)
  }

  const totalCustomTaskSeconds = Math.min(
    grossSeconds,
    eventCustomTaskSeconds + manualCustomTaskSeconds
  )
  const onTaskSeconds = Math.max(0, grossSeconds - totalCustomTaskSeconds)

  const categoryBookingCodes = new Map(
    input.customTaskCategories.map((c) => [c.name, c.bookingCode])
  )

  const detailBreakdown: CustomTaskBucket[] = [...buckets.entries()].map(([category, seconds]) => ({
    category,
    minutes: Math.round(seconds / 60),
    bookingCode: categoryBookingCodes.get(category) || undefined
  }))

  const bookingCodeText = input.session.bookingCode ? ` [${input.session.bookingCode}]` : ''
  const comment = `${input.session.jiraIssueKey}${bookingCodeText} - focused work. Gross ${formatDuration(
    grossSeconds
  )}, custom-task ${formatDuration(totalCustomTaskSeconds)}, net ${formatDuration(onTaskSeconds)}.`

  return {
    issueKey: input.session.jiraIssueKey,
    startedIso: input.session.startIso,
    timeSpentSeconds: onTaskSeconds,
    secondsOnTask: onTaskSeconds,
    secondsCustomTask: totalCustomTaskSeconds,
    detailBreakdown,
    comment
  }
}
