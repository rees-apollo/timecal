import type {
  CalendarEvent,
  CalendarEventClassification,
  CalendarEventLink,
  CustomTaskCategory,
  ManualCustomTaskEntry,
  LoggedWorklogEntry,
  TaskSession,
  WeekdayKey,
  WorkingHoursSchedule,
  SegmentKind,
  TimelineSegment,
  DayTimelineInput,
  DayTimelineSummary,
  TimesheetDayResult,
  DayOverviewRow,
  DayOverviewResult,
  BookingBreakdown,
  TimesheetRow,
  SessionWorklogMinutes
} from './types'
import { formatDurationMs } from './duration-format'
import { WorkingSchedule } from './working-schedule'
import { getWeekDays } from './report-week'

// ─── Module-level private helpers ────────────────────────────────────────────

const WEEKDAY_BY_INDEX: WeekdayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
]

const parseLocalTime = (baseDate: Date, hhmm: string): Date | null => {
  const match = hhmm.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null
  const d = new Date(baseDate)
  d.setHours(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10), 0, 0)
  return d
}

const formatTime = (date: Date): string =>
  date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

const getImportedSeriesKey = (eventId: string): string | undefined => {
  const match = eventId.match(/^(imp_[^_]+)_/)
  return match ? match[1] : undefined
}

const normalizeBookingCode = (value: string | null | undefined): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.toUpperCase() : undefined
}

/**
 * Iterates over each calendar day in [start, end), calling `fn` with the day key,
 * the portion of [start, end) that falls within that day, and the full day boundaries.
 */
const forEachDayInRange = (
  start: Date,
  end: Date,
  fn: (dayKey: string, windowStart: Date, windowEnd: Date, dayStart: Date, dayEnd: Date) => void
): void => {
  const endDayKey = WorkingSchedule.toLocalDateKey(end)
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)

  while (WorkingSchedule.toLocalDateKey(cursor) <= endDayKey) {
    const dayKey = WorkingSchedule.toLocalDateKey(cursor)
    const dayStart = new Date(`${dayKey}T00:00:00`)
    const dayEnd = new Date(`${dayKey}T23:59:59.999`)
    const windowStart = new Date(Math.max(start.getTime(), dayStart.getTime()))
    const windowEnd = new Date(Math.min(end.getTime(), dayEnd.getTime()))
    if (windowEnd > windowStart) fn(dayKey, windowStart, windowEnd, dayStart, dayEnd)
    cursor.setDate(cursor.getDate() + 1)
  }
}

const filterEventsForDay = (
  events: CalendarEvent[],
  dayStart: Date,
  dayEnd: Date
): CalendarEvent[] =>
  events.filter((event) => {
    const s = new Date(event.startIso)
    const e = new Date(event.endIso)
    return e > dayStart && s < dayEnd
  })

const filterSessionsForDay = (
  sessions: TaskSession[],
  dayStart: Date,
  dayEnd: Date
): TaskSession[] =>
  sessions.filter((session) => {
    const start = new Date(session.startIso)
    const end = new Date(session.endIso ?? new Date().toISOString())
    return end > dayStart && start < dayEnd
  })

/**
 * Sums active-task seconds across a date range by building one `DayTimeline`
 * per day with the provided session template (timestamps are overridden per day).
 */
const sumActiveSecondsForRange = (
  sessionTemplate: Omit<TaskSession, 'startIso' | 'endIso'>,
  start: Date,
  end: Date,
  calendarEvents: CalendarEvent[],
  calendarLinks: CalendarEventLink[],
  workingHours: WorkingHoursSchedule
): number => {
  let activeSeconds = 0
  forEachDayInRange(start, end, (dayKey, windowStart, windowEnd, dayStart, dayEnd) => {
    const timeline = new DayTimeline({
      dayKey,
      sessions: [
        { ...sessionTemplate, startIso: windowStart.toISOString(), endIso: windowEnd.toISOString() }
      ],
      calendarEvents: filterEventsForDay(calendarEvents, dayStart, dayEnd),
      calendarLinks,
      workingHours
    })
    activeSeconds += timeline.getActiveTaskSeconds()
  })
  return activeSeconds
}

// ─── DayTimeline class ────────────────────────────────────────────────────────

export class DayTimeline {
  private readonly segments: TimelineSegment[]
  private readonly workStart: Date | null
  private readonly workEnd: Date | null

  constructor(input: DayTimelineInput) {
    const built = DayTimeline.build(input)
    this.workStart = built.workStart
    this.workEnd = built.workEnd
    this.segments = built.segments
  }

  // ── Public query API ────────────────────────────────────────────────────────

  /** All timeline segments covering the working window (contiguous, no gaps). */
  getSegments(): readonly TimelineSegment[] {
    return this.segments
  }

  /** Aggregate summary for the day. */
  getSummary(): DayTimelineSummary {
    let activeMinutes = 0
    let meetingMinutes = 0
    let lunchMinutes = 0
    let noWorkMinutes = 0
    let overlapConflicts = 0

    for (const seg of this.segments) {
      if (seg.kind === 'active-task') activeMinutes += seg.minutes
      else if (seg.kind === 'meeting') meetingMinutes += seg.minutes
      else if (seg.kind === 'lunch') lunchMinutes += seg.minutes
      else noWorkMinutes += seg.minutes
      if (seg.isOverlapConflict) overlapConflicts += 1
    }

    const totalMinutes =
      this.workStart && this.workEnd
        ? Math.max(0, Math.round((this.workEnd.getTime() - this.workStart.getTime()) / 60_000))
        : 0

    const workdayLabel =
      this.workStart && this.workEnd
        ? `${formatTime(this.workStart)} - ${formatTime(this.workEnd)}`
        : this.segments.length === 0
          ? 'No working hours configured for this day.'
          : ''

    return {
      workdayLabel,
      totalMinutes,
      activeMinutes,
      meetingMinutes,
      lunchMinutes,
      noWorkMinutes,
      overlapConflicts
    }
  }

  /** Total active-task seconds for the day. Used by worklog drafting. */
  getActiveTaskSeconds(): number {
    return this.segments
      .filter((s) => s.kind === 'active-task')
      .reduce((sum, s) => sum + (s.endMs - s.startMs) / 1000, 0)
  }

  /** Total working seconds within the working window. */
  getWorkingSeconds(): number {
    return this.segments.reduce((sum, s) => sum + (s.endMs - s.startMs) / 1000, 0)
  }

  /**
   * Per-booking-code minute breakdown for the timesheet, including reclassification
   * of custom-task events and manual entries against session time.
   */
  getTimesheetBookings(options?: {
    manualEntries?: Array<{ minutes: number; bookingCode?: string }>
  }): TimesheetDayResult {
    const bookings = new Map<string, number>()
    let overheadMinutes = 0

    const sessionSegments: Array<{
      startMs: number
      endMs: number
      bookingCode: string
      remainingMinutes: number
    }> = []

    // Step 1: seed from active-task segments
    for (const seg of this.segments) {
      if (seg.kind !== 'active-task') continue
      const code = seg.sessionBookingCode ?? 'UNASSIGNED'
      DayTimeline.addBookingMinutes(bookings, code, seg.minutes)
      sessionSegments.push({
        startMs: seg.startMs,
        endMs: seg.endMs,
        bookingCode: code,
        remainingMinutes: seg.minutes
      })
    }

    // Step 2: reclassify meeting segments with a custom-task/other-ticket classification
    for (const seg of this.segments) {
      if (seg.kind !== 'meeting') continue
      if (!seg.classification || seg.classification === 'ignored') continue
      if (seg.classification !== 'custom-task' && seg.classification !== 'other-ticket') continue
      const targetCode =
        seg.assignedTaskLabel !== '—' && seg.assignedTaskLabel !== 'Unassigned'
          ? normalizeBookingCode(seg.assignedTaskLabel)
          : undefined
      overheadMinutes += DayTimeline.reclassifyMinutes(
        bookings,
        sessionSegments,
        seg.startMs,
        seg.endMs,
        seg.plannedMinutes ?? seg.minutes,
        targetCode
      )
    }

    // Step 3: reclassify manual entries
    for (const entry of options?.manualEntries ?? []) {
      const code = entry.bookingCode ? normalizeBookingCode(entry.bookingCode) : undefined
      overheadMinutes += DayTimeline.reclassifyMinutes(
        bookings,
        sessionSegments,
        this.workStart?.getTime() ?? 0,
        this.workEnd?.getTime() ?? 0,
        entry.minutes,
        code
      )
    }

    return { bookings, overheadMinutes }
  }

  // ── Private static: booking accumulation ──────────────────────────────────

  private static addBookingMinutes(
    bookings: Map<string, number>,
    code: string,
    minutes: number
  ): void {
    if (minutes <= 0) return
    bookings.set(code, (bookings.get(code) ?? 0) + minutes)
  }

  private static subtractBookingMinutes(
    bookings: Map<string, number>,
    code: string,
    minutes: number
  ): number {
    const current = bookings.get(code) ?? 0
    const deducted = Math.min(current, minutes)
    const remaining = current - deducted
    if (remaining > 0) bookings.set(code, remaining)
    else bookings.delete(code)
    return deducted
  }

  /**
   * Reclassifies `minutesToReclassify` from session segments overlapping
   * [startMs, endMs) into `targetCode`. Returns overhead minutes added
   * (i.e. minutes with no target code, or minutes not covered by any session).
   */
  private static reclassifyMinutes(
    bookings: Map<string, number>,
    sessionSegments: Array<{
      startMs: number
      endMs: number
      bookingCode: string
      remainingMinutes: number
    }>,
    startMs: number,
    endMs: number,
    minutesToReclassify: number,
    targetCode: string | undefined
  ): number {
    if (minutesToReclassify <= 0 || endMs <= startMs) return 0

    const overlapping = sessionSegments
      .filter((s) => s.remainingMinutes > 0 && s.endMs > startMs && s.startMs < endMs)
      .sort((a, b) => a.startMs - b.startMs)

    let left = minutesToReclassify
    let overheadAdded = 0

    for (const s of overlapping) {
      if (left <= 0) break
      const consumed = Math.min(left, s.remainingMinutes)
      if (consumed <= 0) continue
      s.remainingMinutes -= consumed
      left -= consumed
      if (targetCode && s.bookingCode === targetCode) continue
      const deducted = DayTimeline.subtractBookingMinutes(bookings, s.bookingCode, consumed)
      if (deducted <= 0) continue
      if (targetCode) DayTimeline.addBookingMinutes(bookings, targetCode, deducted)
      else overheadAdded += deducted
    }

    if (left > 0) {
      if (targetCode) DayTimeline.addBookingMinutes(bookings, targetCode, left)
      else overheadAdded += left
    }

    return overheadAdded
  }

  // ── Internal builder ────────────────────────────────────────────────────────

  private static build(input: DayTimelineInput): {
    segments: TimelineSegment[]
    workStart: Date | null
    workEnd: Date | null
  } {
    const {
      dayKey,
      sessions,
      calendarEvents,
      calendarLinks,
      customTaskCategories,
      activeSessionId,
      workingHours
    } = input

    const dayStart = new Date(`${dayKey}T00:00:00`)
    if (Number.isNaN(dayStart.getTime())) return { segments: [], workStart: null, workEnd: null }

    const dayHours = workingHours[WEEKDAY_BY_INDEX[dayStart.getDay()]]
    const workStart = dayHours ? parseLocalTime(dayStart, dayHours.start) : null
    const workEnd = dayHours ? parseLocalTime(dayStart, dayHours.end) : null
    if (!workStart || !workEnd || workEnd.getTime() <= workStart.getTime()) {
      return { segments: [], workStart, workEnd }
    }

    const windowStartMs = workStart.getTime()
    const windowEndMs = workEnd.getTime()

    const linksByEventId = new Map(calendarLinks.map((link) => [link.eventId, link]))
    const bookingCodeByTaskKey = new Map<string, string>()

    for (const session of sessions) {
      const key = session.jiraIssueKey.trim()
      const code = session.bookingCode?.trim()
      if (key && code) bookingCodeByTaskKey.set(key, code)
    }
    for (const category of customTaskCategories ?? []) {
      const key = category.name.trim()
      const code = category.bookingCode.trim()
      if (key && code) bookingCodeByTaskKey.set(key, code)
    }

    type Span = {
      startMs: number
      endMs: number
      title: string
      subtitle?: string
      assignedTaskLabel: string
      sessionId?: string
      sessionBookingCode?: string
      eventId?: string
      classification?: CalendarEventClassification
      plannedMinutes?: number
    }

    const taskSpans: Span[] = []
    const meetingSpans: Span[] = []
    const boundaries = new Set<number>([windowStartMs, windowEndMs])
    const now = Date.now()

    for (const session of sessions) {
      const startMs = Math.max(windowStartMs, new Date(session.startIso).getTime())
      const rawEnd = session.endIso ? new Date(session.endIso).getTime() : now
      const endMs = Math.min(windowEndMs, rawEnd)
      if (endMs <= startMs) continue
      boundaries.add(startMs)
      boundaries.add(endMs)
      const isActive = !session.endIso || session.id === activeSessionId
      const code =
        normalizeBookingCode(session.bookingCode) ??
        normalizeBookingCode(bookingCodeByTaskKey.get(session.jiraIssueKey.trim()))
      taskSpans.push({
        startMs,
        endMs,
        title: isActive ? `${session.jiraIssueKey} (active)` : session.jiraIssueKey,
        subtitle: session.jiraIssueSummary,
        assignedTaskLabel: code ?? session.jiraIssueKey,
        sessionId: session.id,
        sessionBookingCode: code ?? 'UNASSIGNED'
      })
    }

    for (const event of calendarEvents) {
      const startMs = Math.max(windowStartMs, new Date(event.startIso).getTime())
      const endMs = Math.min(windowEndMs, new Date(event.endIso).getTime())
      if (endMs <= startMs) continue

      const seriesKey = getImportedSeriesKey(event.id)
      const link =
        linksByEventId.get(event.id) ?? (seriesKey ? linksByEventId.get(seriesKey) : undefined)
      const classification = link?.classification ?? 'unclassified'
      if (classification === 'ignored') continue

      const assignedTaskLabel =
        classification === 'primary-task'
          ? 'Primary task'
          : classification === 'other-ticket'
            ? (() => {
                const issueKey = link?.otherTicketKey?.trim()
                if (!issueKey) return 'Other ticket'
                return bookingCodeByTaskKey.get(issueKey) ?? issueKey
              })()
            : classification === 'custom-task'
              ? (() => {
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
        assignedTaskLabel,
        eventId: event.id,
        classification,
        plannedMinutes:
          (event.source === 'off-task' || event.source === 'planning') &&
          typeof event.plannedMinutes === 'number' &&
          Number.isFinite(event.plannedMinutes)
            ? Math.max(0, Math.floor(event.plannedMinutes))
            : undefined
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
    const segments: TimelineSegment[] = []

    for (let i = 0; i < sortedBoundaries.length - 1; i++) {
      const startMs = sortedBoundaries[i]
      const endMs = sortedBoundaries[i + 1]
      if (endMs <= startMs) continue

      const activeTasks = taskSpans.filter((s) => s.startMs < endMs && s.endMs > startMs)
      const activeMeetings = meetingSpans.filter((s) => s.startMs < endMs && s.endMs > startMs)
      const inLunch =
        lunchStartMs !== null && lunchEndMs !== null && lunchStartMs < endMs && lunchEndMs > startMs

      let kind: SegmentKind = 'no-work'
      let title = 'No work'
      let subtitle: string | undefined
      let assignedTaskLabel = '—'
      let sessionId: string | undefined
      let sessionBookingCode: string | undefined
      let eventId: string | undefined
      let classification: CalendarEventClassification | undefined
      let plannedMinutes: number | undefined

      if (inLunch) {
        kind = 'lunch'
        title = 'Lunch'
        subtitle = 'Configured break'
      } else if (activeMeetings.length > 0) {
        kind = 'meeting'
        title = activeMeetings[0].title
        subtitle = activeMeetings[0].subtitle
        assignedTaskLabel =
          activeMeetings[0].assignedTaskLabel !== 'Unassigned'
            ? activeMeetings[0].assignedTaskLabel
            : activeTasks[0]?.assignedTaskLabel || activeTasks[0]?.title || 'Unassigned'
        eventId = activeMeetings[0].eventId
        classification = activeMeetings[0].classification
        plannedMinutes = activeMeetings[0].plannedMinutes
      } else if (activeTasks.length > 0) {
        kind = 'active-task'
        title = activeTasks[0].title
        subtitle = activeTasks[0].subtitle
        assignedTaskLabel = activeTasks[0].assignedTaskLabel
        sessionId = activeTasks[0].sessionId
        sessionBookingCode = activeTasks[0].sessionBookingCode
      }

      segments.push({
        startMs,
        endMs,
        minutes: Math.max(0, Math.floor((endMs - startMs) / 60_000)),
        kind,
        title,
        subtitle,
        assignedTaskLabel,
        sessionId,
        sessionBookingCode,
        eventId,
        classification,
        plannedMinutes,
        isOverlapConflict: activeTasks.length > 1 || activeMeetings.length > 1
      })
    }

    return { segments, workStart, workEnd }
  }
}

// ─── buildDayTimeline ─────────────────────────────────────────────────────────

export const buildDayTimeline = (input: DayTimelineInput): DayOverviewResult => {
  const timeline = new DayTimeline(input)
  const summary = timeline.getSummary()
  const rows: DayOverviewRow[] = timeline.getSegments().map((seg) => ({
    startIso: new Date(seg.startMs).toISOString(),
    endIso: new Date(seg.endMs).toISOString(),
    startLabel: formatTime(new Date(seg.startMs)),
    endLabel: formatTime(new Date(seg.endMs)),
    durationLabel: formatDurationMs(seg.startMs, seg.endMs),
    kind: seg.kind,
    title: seg.title,
    subtitle: seg.subtitle,
    assignedTaskLabel: seg.assignedTaskLabel,
    isOverlapConflict: seg.isOverlapConflict
  }))

  return { rows, ...summary }
}

// ─── buildTimesheetRows ───────────────────────────────────────────────────────

export const buildTimesheetRows = (input: {
  selectedWeekStart: Date
  selectedWeekEnd: Date
  sessions: TaskSession[]
  calendarEvents: CalendarEvent[]
  calendarLinks: CalendarEventLink[]
  manualCustomTaskEntries: ManualCustomTaskEntry[]
  customTaskCategories: CustomTaskCategory[]
  workingHours: WorkingHoursSchedule
}): TimesheetRow[] => {
  const categoryBookingCodeByName = new Map(
    input.customTaskCategories.map(
      (category) => [category.name, normalizeBookingCode(category.bookingCode)] as const
    )
  )

  return getWeekDays(input.selectedWeekStart).map((day) => {
    const dayKey = WorkingSchedule.toLocalDateKey(day)
    const dayStart = new Date(`${dayKey}T00:00:00`)
    const dayEnd = new Date(`${dayKey}T23:59:59.999`)

    const timeline = new DayTimeline({
      dayKey,
      sessions: filterSessionsForDay(input.sessions, dayStart, dayEnd),
      calendarEvents: filterEventsForDay(input.calendarEvents, dayStart, dayEnd),
      calendarLinks: input.calendarLinks,
      customTaskCategories: input.customTaskCategories,
      workingHours: input.workingHours
    })

    const dayManualEntries = input.manualCustomTaskEntries
      .filter((entry) => entry.date === dayKey)
      .map((entry) => ({
        minutes: Math.max(0, Math.floor(entry.minutes)),
        bookingCode: categoryBookingCodeByName.get(entry.category)
      }))

    const { bookings: bookingsMap, overheadMinutes } = timeline.getTimesheetBookings({
      manualEntries: dayManualEntries
    })

    const bookings: BookingBreakdown[] = [...bookingsMap.entries()]
      .map(([code, minutes]) => ({ code, minutes }))
      .sort((a, b) => b.minutes - a.minutes)

    const bookedMinutes = bookings.reduce((sum, item) => sum + item.minutes, 0)
    const totalMinutes = bookedMinutes + overheadMinutes

    return {
      dayKey,
      day: day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      bookings,
      bookedMinutes,
      overheadMinutes,
      totalMinutes,
      isEmpty: totalMinutes === 0
    }
  })
}

// ─── calculateSessionWorklogMinutesForRange ───────────────────────────────────

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

  const activeSeconds = sumActiveSecondsForRange(
    {
      id: session.id,
      jiraIssueKey: session.jiraIssueKey,
      jiraIssueSummary: session.jiraIssueSummary,
      bookingCode: session.bookingCode,
      taskType: session.taskType
    },
    clippedStart,
    clippedEnd,
    calendarEvents,
    calendarLinks,
    workingHours
  )

  const requestRangeStartIso = rangeStart.toISOString()
  const requestRangeEndIso = rangeEnd.toISOString()
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

// ─── calculateActiveTaskSecondsForRange ──────────────────────────────────────

export const calculateActiveTaskSecondsForRange = (input: {
  start: Date
  end: Date
  calendarEvents: CalendarEvent[]
  calendarLinks: CalendarEventLink[]
  workingHours: WorkingHoursSchedule
}): number => {
  const { start, end, calendarEvents, calendarLinks, workingHours } = input
  if (end <= start) return 0

  return sumActiveSecondsForRange(
    { id: '__synthetic__', jiraIssueKey: 'TASK', jiraIssueSummary: '' },
    start,
    end,
    calendarEvents,
    calendarLinks,
    workingHours
  )
}
