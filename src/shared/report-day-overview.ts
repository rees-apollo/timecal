import type {
  CalendarEvent,
  CalendarEventLink,
  CustomTaskCategory,
  TaskSession,
  WeekdayKey,
  WorkingHoursSchedule
} from './types'
import { formatDurationMs } from './duration-format'

export type IntervalKind = 'active-task' | 'meeting' | 'lunch' | 'no-work'

export type DayTimelineRow = {
  startIso: string
  endIso: string
  startLabel: string
  endLabel: string
  durationLabel: string
  kind: IntervalKind
  title: string
  subtitle?: string
  assignedTaskLabel: string
  isOverlapConflict: boolean
}

export type DayTimeline = {
  rows: DayTimelineRow[]
  workdayLabel: string
  totalMinutes: number
  activeMinutes: number
  meetingMinutes: number
  lunchMinutes: number
  noWorkMinutes: number
  overlapConflicts: number
}

const WEEKDAY_BY_INDEX: WeekdayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
]

const parseLocalDateTime = (date: Date, hhmm: string): Date | null => {
  const match = hhmm.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null

  const value = new Date(date)
  value.setHours(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10), 0, 0)
  return value
}

const formatRangeTime = (date: Date): string =>
  date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

const getImportedSeriesKey = (eventId: string): string | undefined => {
  const match = eventId.match(/^(imp_[^_]+)_/)
  return match ? match[1] : undefined
}

export const buildDayTimeline = (input: {
  dayKey: string
  sessions: TaskSession[]
  calendarEvents: CalendarEvent[]
  calendarLinks: CalendarEventLink[]
  customTaskCategories?: CustomTaskCategory[]
  activeSessionId?: string
  workingHours: WorkingHoursSchedule
}): DayTimeline => {
  const dayStart = new Date(`${input.dayKey}T00:00:00`)
  if (Number.isNaN(dayStart.getTime())) {
    return {
      rows: [],
      workdayLabel: '',
      totalMinutes: 0,
      activeMinutes: 0,
      meetingMinutes: 0,
      lunchMinutes: 0,
      noWorkMinutes: 0,
      overlapConflicts: 0
    }
  }

  const dayHours = input.workingHours[WEEKDAY_BY_INDEX[dayStart.getDay()]]
  const workStart = dayHours ? parseLocalDateTime(dayStart, dayHours.start) : null
  const workEnd = dayHours ? parseLocalDateTime(dayStart, dayHours.end) : null

  if (!workStart || !workEnd || workEnd.getTime() <= workStart.getTime()) {
    return {
      rows: [],
      workdayLabel: 'No working hours configured for this day.',
      totalMinutes: 0,
      activeMinutes: 0,
      meetingMinutes: 0,
      lunchMinutes: 0,
      noWorkMinutes: 0,
      overlapConflicts: 0
    }
  }

  const windowStartMs = workStart.getTime()
  const windowEndMs = workEnd.getTime()
  const linksByEventId = new Map(input.calendarLinks.map((link) => [link.eventId, link]))
  const bookingCodeByTaskKey = new Map<string, string>()

  for (const session of input.sessions) {
    const key = session.jiraIssueKey.trim()
    const bookingCode = session.bookingCode?.trim()
    if (!key || !bookingCode) continue
    bookingCodeByTaskKey.set(key, bookingCode)
  }

  for (const category of input.customTaskCategories ?? []) {
    const key = category.name.trim()
    const bookingCode = category.bookingCode.trim()
    if (!key || !bookingCode) continue
    bookingCodeByTaskKey.set(key, bookingCode)
  }

  type Span = {
    startMs: number
    endMs: number
    title: string
    subtitle?: string
    assignedTaskLabel?: string
  }
  const taskSpans: Span[] = []
  const meetingSpans: Span[] = []
  const boundaries = new Set<number>([windowStartMs, windowEndMs])

  const now = Date.now()
  for (const session of input.sessions) {
    const sessionStart = new Date(session.startIso).getTime()
    const rawEnd = session.endIso ? new Date(session.endIso).getTime() : now
    const startMs = Math.max(windowStartMs, sessionStart)
    const endMs = Math.min(windowEndMs, rawEnd)
    if (endMs <= startMs) continue
    boundaries.add(startMs)
    boundaries.add(endMs)
    const isActive = !session.endIso || session.id === input.activeSessionId
    taskSpans.push({
      startMs,
      endMs,
      title: isActive ? `${session.jiraIssueKey} (active)` : session.jiraIssueKey,
      subtitle: session.jiraIssueSummary,
      assignedTaskLabel:
        session.bookingCode?.trim() || bookingCodeByTaskKey.get(session.jiraIssueKey.trim())
    })
  }

  for (const event of input.calendarEvents) {
    const startMs = Math.max(windowStartMs, new Date(event.startIso).getTime())
    const endMs = Math.min(windowEndMs, new Date(event.endIso).getTime())
    if (endMs <= startMs) continue

    const seriesKey = getImportedSeriesKey(event.id)
    const link = linksByEventId.get(event.id) ?? (seriesKey ? linksByEventId.get(seriesKey) : undefined)
    const classification = link?.classification ?? 'unclassified'
    if (classification === 'ignored') continue

    const assignedTaskLabel =
      classification === 'primary-task'
        ? 'Primary task'
        : classification === 'other-ticket'
          ? ((): string => {
              const issueKey = link?.otherTicketKey?.trim()
              if (!issueKey) return 'Other ticket'
              return bookingCodeByTaskKey.get(issueKey) ?? issueKey
            })()
          : classification === 'custom-task'
            ? ((): string => {
                const categoryName = link?.customTaskCategory?.trim()
                if (!categoryName) return 'Custom task'
                return bookingCodeByTaskKey.get(categoryName) ?? categoryName
              })()
            : 'Unassigned'

    const subtitle =
      classification === 'primary-task'
        ? 'Calendar event (primary-task linked)'
        : classification === 'other-ticket'
          ? `Calendar event (linked to ${assignedTaskLabel})`
          : classification === 'custom-task'
            ? `Calendar event (custom task: ${assignedTaskLabel})`
            : event.source === 'off-task' || event.source === 'planning'
              ? 'Off-task block'
              : 'Calendar event'

    boundaries.add(startMs)
    boundaries.add(endMs)
    meetingSpans.push({
      startMs,
      endMs,
      title: event.subject || 'Meeting',
      subtitle,
      assignedTaskLabel
    })
  }

  let lunchStartMs: number | null = null
  let lunchEndMs: number | null = null
  const lunchDuration = dayHours.lunchDurationMins ?? 0
  if (lunchDuration > 0) {
    const lunchStart = new Date(dayStart)
    lunchStart.setHours(12, 0, 0, 0)
    const lunchEnd = new Date(lunchStart)
    lunchEnd.setMinutes(lunchEnd.getMinutes() + lunchDuration)
    if (lunchEnd.getTime() > windowStartMs && lunchStart.getTime() < windowEndMs) {
      lunchStartMs = Math.max(windowStartMs, lunchStart.getTime())
      lunchEndMs = Math.min(windowEndMs, lunchEnd.getTime())
      boundaries.add(lunchStartMs)
      boundaries.add(lunchEndMs)
    }
  }

  const sortedBoundaries = [...boundaries].sort((a, b) => a - b)
  const rows: DayTimelineRow[] = []
  let activeMinutes = 0
  let meetingMinutes = 0
  let lunchMinutes = 0
  let noWorkMinutes = 0
  let overlapConflicts = 0

  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const startMs = sortedBoundaries[index]
    const endMs = sortedBoundaries[index + 1]
    if (endMs <= startMs) continue

    const activeTasks = taskSpans.filter((span) => span.startMs < endMs && span.endMs > startMs)
    const activeMeetings = meetingSpans.filter(
      (span) => span.startMs < endMs && span.endMs > startMs
    )
    const inLunch =
      lunchStartMs !== null && lunchEndMs !== null && lunchStartMs < endMs && lunchEndMs > startMs

    let kind: IntervalKind = 'no-work'
    let title = 'No work'
    let subtitle: string | undefined
    let assignedTaskLabel = '—'

    if (inLunch) {
      kind = 'lunch'
      title = 'Lunch'
      subtitle = 'Configured break'
    } else if (activeMeetings.length > 0) {
      kind = 'meeting'
      title = activeMeetings[0].title
      subtitle = activeMeetings[0].subtitle
      assignedTaskLabel =
        activeMeetings[0].assignedTaskLabel ??
        (activeTasks[0]?.assignedTaskLabel || activeTasks[0]?.title || 'Unassigned')
    } else if (activeTasks.length > 0) {
      kind = 'active-task'
      title = activeTasks[0].title
      subtitle = activeTasks[0].subtitle
      assignedTaskLabel = activeTasks[0].assignedTaskLabel ?? 'Unassigned'
    }

    const hasOverlap = activeTasks.length > 1 || activeMeetings.length > 1
    if (hasOverlap) overlapConflicts += 1

    const segmentMinutes = Math.max(0, Math.round((endMs - startMs) / 60_000))
    if (kind === 'active-task') activeMinutes += segmentMinutes
    if (kind === 'meeting') meetingMinutes += segmentMinutes
    if (kind === 'lunch') lunchMinutes += segmentMinutes
    if (kind === 'no-work') noWorkMinutes += segmentMinutes

    rows.push({
      startIso: new Date(startMs).toISOString(),
      endIso: new Date(endMs).toISOString(),
      startLabel: formatRangeTime(new Date(startMs)),
      endLabel: formatRangeTime(new Date(endMs)),
      durationLabel: formatDurationMs(startMs, endMs),
      kind,
      title,
      subtitle,
      assignedTaskLabel,
      isOverlapConflict: hasOverlap
    })
  }

  return {
    rows,
    workdayLabel: `${formatRangeTime(workStart)} - ${formatRangeTime(workEnd)}`,
    totalMinutes: Math.max(0, Math.round((windowEndMs - windowStartMs) / 60_000)),
    activeMinutes,
    meetingMinutes,
    lunchMinutes,
    noWorkMinutes,
    overlapConflicts
  }
}
