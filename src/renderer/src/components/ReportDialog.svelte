<script lang="ts">
  import type {
    AppSnapshot,
    BuildWorklogDraftInput,
    TaskSession,
    WorkingHoursSchedule
  } from '../../../shared/types'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Tabs from '$lib/components/ui/tabs'
  import * as Table from '$lib/components/ui/table'
  import * as ScrollArea from '$lib/components/ui/scroll-area'
  import * as Tooltip from '$lib/components/ui/tooltip'
  import * as Accordion from '$lib/components/ui/accordion'
  import * as Popover from '$lib/components/ui/popover'
  import * as Calendar from '$lib/components/ui/calendar'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { Input } from '$lib/components/ui/input'
  import CalendarIcon from '@lucide/svelte/icons/calendar'
  import { getLocalTimeZone, parseDate, today, type DateValue } from '@internationalized/date'
  import {
    calculateWorkingSecondsBetween,
    getWeekStartKey,
    getWorkingTimeSegments,
    sanitizeWorkingHoursSchedule,
    toLocalDateKey
  } from '../../../shared/working-hours'

  let {
    open = $bindable(false),
    snapshot = null,
    isBusy = false,
    openDraftDialog,
    saveWeeklyWorkingHours
  }: {
    open?: boolean
    snapshot?: AppSnapshot | null
    isBusy?: boolean
    openDraftDialog: (input?: string | BuildWorklogDraftInput) => Promise<void>
    saveWeeklyWorkingHours: (weekStartKey: string, schedule?: WorkingHoursSchedule) => Promise<void>
  } = $props()

  const sessions = $derived(snapshot?.state.sessions ?? [])
  const jiraSessions = $derived(
    sessions.filter((session) => (session.taskType ?? 'jira') === 'jira')
  )
  const defaultWorkingHours = $derived(
    sanitizeWorkingHoursSchedule(snapshot?.state.settings.workingHours)
  )
  const weeklyWorkingHoursOverrides = $derived(snapshot?.state.weeklyWorkingHoursOverrides ?? {})
  const calendarEvents = $derived(snapshot?.state.calendarEvents ?? [])
  const calendarLinks = $derived(snapshot?.state.calendarLinks ?? [])
  const manualCustomTaskEntries = $derived(snapshot?.state.manualCustomTaskEntries ?? [])
  const customTaskCategories = $derived(snapshot?.state.settings.customTaskCategories ?? [])
  const activeSessionId = $derived(
    snapshot?.activeSession?.id ?? snapshot?.state.activeSessionId ?? ''
  )
  const loggedWorklogs = $derived(snapshot?.state.loggedWorklogs ?? [])

  // ── All Tasks timeline ──────────────────────────────────────────────────────

  type IntervalKind = 'active-task' | 'meeting' | 'lunch' | 'no-work'

  type DayTimelineRow = {
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

  const WEEKDAY_BY_INDEX: Array<keyof WorkingHoursSchedule> = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday'
  ]

  let dayKey = $state(toLocalDateKey(new Date()))
  let dayPickerOpen = $state(false)

  const formatDayKeyFromDateValue = (value: DateValue): string =>
    `${value.year.toString().padStart(4, '0')}-${value.month.toString().padStart(2, '0')}-${value.day.toString().padStart(2, '0')}`

  const parseDayKeyOrToday = (value: string): DateValue => {
    try {
      return parseDate(value)
    } catch {
      return today(getLocalTimeZone())
    }
  }

  const formatDayLabel = (value: string): string => {
    const parsed = new Date(`${value}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  let dayPickerValue = $state<DateValue>(parseDayKeyOrToday(dayKey))

  $effect(() => {
    const normalizedPickerValue = formatDayKeyFromDateValue(dayPickerValue)
    if (normalizedPickerValue !== dayKey) {
      dayKey = normalizedPickerValue
    }
  })

  $effect(() => {
    const normalizedPickerValue = formatDayKeyFromDateValue(dayPickerValue)
    if (dayKey === normalizedPickerValue) return
    dayPickerValue = parseDayKeyOrToday(dayKey)
  })

  const classificationByEventId = $derived(
    new Map(calendarLinks.map((link) => [link.eventId, link]))
  )

  const effectiveScheduleForDay = $derived.by(() => {
    const dayStart = new Date(`${dayKey}T00:00:00`)
    if (Number.isNaN(dayStart.getTime())) return defaultWorkingHours
    const weekStartKey = getWeekStartKey(dayStart)
    return sanitizeWorkingHoursSchedule(
      weeklyWorkingHoursOverrides[weekStartKey] ?? defaultWorkingHours
    )
  })

  const parseLocalDateTime = (date: Date, hhmm: string): Date | null => {
    const match = hhmm.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/)
    if (!match) return null
    const hours = Number.parseInt(match[1], 10)
    const minutes = Number.parseInt(match[2], 10)
    const value = new Date(date)
    value.setHours(hours, minutes, 0, 0)
    return value
  }

  const formatRangeTime = (date: Date): string =>
    date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  const formatDurationBetween = (startMs: number, endMs: number): string => {
    const totalMinutes = Math.max(0, Math.round((endMs - startMs) / 60_000))
    if (totalMinutes < 60) return `${totalMinutes}m`
    const hours = Math.floor(totalMinutes / 60)
    const mins = totalMinutes % 60
    return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`
  }

  const dayTimeline = $derived.by(() => {
    const dayStart = new Date(`${dayKey}T00:00:00`)
    if (Number.isNaN(dayStart.getTime())) {
      return {
        rows: [] as DayTimelineRow[],
        workdayLabel: '',
        totalMinutes: 0,
        activeMinutes: 0,
        meetingMinutes: 0,
        lunchMinutes: 0,
        noWorkMinutes: 0,
        overlapConflicts: 0
      }
    }

    const dayName = WEEKDAY_BY_INDEX[dayStart.getDay()]
    const dayHours = effectiveScheduleForDay[dayName]
    const workStart = dayHours ? parseLocalDateTime(dayStart, dayHours.start) : null
    const workEnd = dayHours ? parseLocalDateTime(dayStart, dayHours.end) : null

    if (!workStart || !workEnd || workEnd.getTime() <= workStart.getTime()) {
      return {
        rows: [] as DayTimelineRow[],
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
    for (const session of sessions) {
      const sessionStart = new Date(session.startIso).getTime()
      const rawEnd = session.endIso ? new Date(session.endIso).getTime() : now
      const startMs = Math.max(windowStartMs, sessionStart)
      const endMs = Math.min(windowEndMs, rawEnd)
      if (endMs <= startMs) continue
      boundaries.add(startMs)
      boundaries.add(endMs)
      const isActive = !session.endIso || session.id === activeSessionId
      taskSpans.push({
        startMs,
        endMs,
        title: isActive ? `${session.jiraIssueKey} (active)` : session.jiraIssueKey,
        subtitle: session.jiraIssueSummary
      })
    }

    for (const event of calendarEvents) {
      const eventStartMs = new Date(event.startIso).getTime()
      const eventEndMs = new Date(event.endIso).getTime()
      const startMs = Math.max(windowStartMs, eventStartMs)
      const endMs = Math.min(windowEndMs, eventEndMs)
      if (endMs <= startMs) continue
      const link = classificationByEventId.get(event.id)
      const classification = link?.classification ?? 'unclassified'
      if (classification === 'ignored') continue
      boundaries.add(startMs)
      boundaries.add(endMs)
      const assignedTaskLabel =
        classification === 'primary-task'
          ? 'Primary task'
          : classification === 'other-ticket'
            ? link?.otherTicketKey?.trim() || 'Other ticket'
            : classification === 'custom-task'
              ? link?.customTaskCategory?.trim() || 'Custom task'
              : classification === 'ignored'
                ? 'Ignored'
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
                : classification === 'ignored'
                  ? 'Ignored calendar event'
                  : 'Calendar event'
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
    const lunchDuration = dayHours?.lunchDurationMins ?? 0
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
    const resultRows: DayTimelineRow[] = []
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
      let isOverlapConflict = false

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
          (activeTasks.length > 0 ? activeTasks[0].title : 'Unassigned')
      } else if (activeTasks.length > 0) {
        kind = 'active-task'
        title = activeTasks[0].title
        subtitle = activeTasks[0].subtitle
        assignedTaskLabel = activeTasks[0].title
      }

      if (activeTasks.length > 1 || activeMeetings.length > 1) {
        isOverlapConflict = true
        overlapConflicts += 1
      }

      const segmentMinutes = Math.max(0, Math.round((endMs - startMs) / 60_000))
      if (kind === 'active-task') activeMinutes += segmentMinutes
      if (kind === 'meeting') meetingMinutes += segmentMinutes
      if (kind === 'lunch') lunchMinutes += segmentMinutes
      if (kind === 'no-work') noWorkMinutes += segmentMinutes

      resultRows.push({
        startIso: new Date(startMs).toISOString(),
        endIso: new Date(endMs).toISOString(),
        startLabel: formatRangeTime(new Date(startMs)),
        endLabel: formatRangeTime(new Date(endMs)),
        durationLabel: formatDurationBetween(startMs, endMs),
        kind,
        title,
        subtitle,
        assignedTaskLabel,
        isOverlapConflict
      })
    }

    return {
      rows: resultRows,
      workdayLabel: `${formatRangeTime(workStart)} - ${formatRangeTime(workEnd)}`,
      totalMinutes: Math.max(0, Math.round((windowEndMs - windowStartMs) / 60_000)),
      activeMinutes,
      meetingMinutes,
      lunchMinutes,
      noWorkMinutes,
      overlapConflicts
    }
  })

  const kindBadgeClass = (kind: IntervalKind): string => {
    if (kind === 'active-task') return 'bg-emerald-100 text-emerald-800'
    if (kind === 'meeting') return 'bg-blue-100 text-blue-800'
    if (kind === 'lunch') return 'bg-amber-100 text-amber-800'
    return 'bg-muted text-muted-foreground'
  }

  interface BookingBreakdown {
    code: string
    minutes: number
  }

  interface TimesheetRow {
    dayKey: string
    day: string
    bookings: BookingBreakdown[]
    bookedMinutes: number
    overheadMinutes: number
    totalMinutes: number
    isEmpty: boolean
  }

  interface SessionBookingSegment {
    startMs: number
    endMs: number
    bookingCode: string
    remainingMinutes: number
  }

  const UNASSIGNED_BOOKING_CODE = 'UNASSIGNED'

  const normalizeBookingCode = (value: string | null | undefined): string | undefined => {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    if (!trimmed) return undefined
    return trimmed.toUpperCase()
  }

  function getWeekStart(): Date {
    const now = new Date()
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const d = new Date(now)
    d.setDate(d.getDate() + diff)
    d.setHours(0, 0, 0, 0)
    return d
  }

  function getWeekDays(start: Date): Date[] {
    const days: Date[] = []
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      d.setHours(0, 0, 0, 0)
      days.push(d)
    }
    return days
  }

  let weekOffset = $state(0)
  let selectedTab = $state('worklogs')

  const selectedWeekStart = $derived(
    (() => {
      const d = getWeekStart()
      d.setDate(d.getDate() + weekOffset * 7)
      return d
    })()
  )

  const selectedWeekEnd = $derived(
    (() => {
      const d = new Date(selectedWeekStart)
      d.setDate(d.getDate() + 7)
      return d
    })()
  )

  const selectedWeekKey = $derived(toLocalDateKey(selectedWeekStart))
  const effectiveWorkingHours = $derived(
    sanitizeWorkingHoursSchedule(
      weeklyWorkingHoursOverrides[selectedWeekKey] ?? defaultWorkingHours
    )
  )
  let weekOverrideDraft: WorkingHoursSchedule = $state(
    sanitizeWorkingHoursSchedule(defaultWorkingHours)
  )

  $effect(() => {
    weekOverrideDraft = sanitizeWorkingHoursSchedule(
      weeklyWorkingHoursOverrides[selectedWeekKey] ?? defaultWorkingHours
    )
  })

  const weekdays: Array<{ key: keyof WorkingHoursSchedule; label: string }> = [
    { key: 'monday', label: 'Mon' },
    { key: 'tuesday', label: 'Tue' },
    { key: 'wednesday', label: 'Wed' },
    { key: 'thursday', label: 'Thu' },
    { key: 'friday', label: 'Fri' },
    { key: 'saturday', label: 'Sat' },
    { key: 'sunday', label: 'Sun' }
  ]

  const saveWeekSchedule = async (): Promise<void> => {
    await saveWeeklyWorkingHours(selectedWeekKey, sanitizeWorkingHoursSchedule(weekOverrideDraft))
  }

  const resetWeekToDefault = async (): Promise<void> => {
    await saveWeeklyWorkingHours(selectedWeekKey)
  }

  const calculateActiveTaskSecondsForRange = (start: Date, end: Date): number => {
    if (end <= start) return 0

    const totalWorkingSeconds = calculateWorkingSecondsBetween(start, end, effectiveWorkingHours)
    if (totalWorkingSeconds <= 0) return 0

    const blockedIntervals: Array<{ startMs: number; endMs: number }> = []

    for (const event of calendarEvents) {
      const link = classificationByEventId.get(event.id)
      const classification = link?.classification ?? 'unclassified'

      // primary-task blocks are active time; ignored blocks should not affect totals.
      if (classification === 'primary-task' || classification === 'ignored') continue

      const eventStart = new Date(event.startIso).getTime()
      const eventEnd = new Date(event.endIso).getTime()
      const startMs = Math.max(start.getTime(), eventStart)
      const endMs = Math.min(end.getTime(), eventEnd)
      if (endMs <= startMs) continue

      blockedIntervals.push({ startMs, endMs })
    }

    if (blockedIntervals.length === 0) return totalWorkingSeconds

    blockedIntervals.sort((a, b) => a.startMs - b.startMs)
    const merged: Array<{ startMs: number; endMs: number }> = []
    for (const interval of blockedIntervals) {
      const last = merged[merged.length - 1]
      if (!last || interval.startMs > last.endMs) {
        merged.push({ ...interval })
        continue
      }
      if (interval.endMs > last.endMs) last.endMs = interval.endMs
    }

    let blockedWorkingSeconds = 0
    for (const interval of merged) {
      blockedWorkingSeconds += calculateWorkingSecondsBetween(
        new Date(interval.startMs),
        new Date(interval.endMs),
        effectiveWorkingHours
      )
    }

    return Math.max(0, totalWorkingSeconds - blockedWorkingSeconds)
  }

  type SessionWorklogMinutes = {
    remaining: number
    logged: number
  }

  const getSessionWorklogMinutes = (session: TaskSession): SessionWorklogMinutes => {
    const start = new Date(session.startIso)
    const end = new Date(session.endIso ?? new Date().toISOString())
    const clippedStart = new Date(Math.max(start.getTime(), selectedWeekStart.getTime()))
    const clippedEnd = new Date(Math.min(end.getTime(), selectedWeekEnd.getTime()))
    if (clippedEnd <= clippedStart) return { remaining: 0, logged: 0 }

    const requestRangeStartIso = selectedWeekStart.toISOString()
    const requestRangeEndIso = selectedWeekEnd.toISOString()

    const activeSeconds = calculateActiveTaskSecondsForRange(clippedStart, clippedEnd)
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

  const formatSessionDurationForReports = (session: TaskSession): string => {
    const minutes = getSessionWorklogMinutes(session)
    return `${minutes.remaining}m [logged ${minutes.logged}m]`
  }

  const selectedWeekLabel = $derived(
    (() => {
      const endInclusive = new Date(selectedWeekEnd)
      endInclusive.setDate(endInclusive.getDate() - 1)
      const startLabel = selectedWeekStart.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      })
      const endLabel = endInclusive.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      })
      return `${startLabel} - ${endLabel}`
    })()
  )

  const jiraSessionsForSelectedWeek = $derived(
    [...jiraSessions]
      .filter((session) => {
        const start = new Date(session.startIso)
        const end = new Date(session.endIso ?? new Date().toISOString())
        return end > selectedWeekStart && start < selectedWeekEnd
      })
      .sort((a, b) => new Date(b.startIso).getTime() - new Date(a.startIso).getTime())
  )

  const timesheetRows = $derived(
    (() => {
      const weekDays = getWeekDays(selectedWeekStart)
      const bookingMinutesByDay = new Map<string, Map<string, number>>()
      const overheadMinutesByDay = new Map<string, number>()
      const sessionSegmentsByDay = new Map<string, SessionBookingSegment[]>()

      const addBookingMinutes = (dayKey: string, bookingCode: string, minutes: number): void => {
        if (minutes <= 0) return
        const dayBookings = bookingMinutesByDay.get(dayKey) ?? new Map<string, number>()
        dayBookings.set(bookingCode, (dayBookings.get(bookingCode) ?? 0) + minutes)
        bookingMinutesByDay.set(dayKey, dayBookings)
      }

      const subtractBookingMinutes = (
        dayKey: string,
        bookingCode: string,
        minutes: number
      ): number => {
        if (minutes <= 0) return 0
        const dayBookings = bookingMinutesByDay.get(dayKey)
        if (!dayBookings) return 0
        const current = dayBookings.get(bookingCode) ?? 0
        if (current <= 0) return 0
        const deducted = Math.min(current, minutes)
        const next = current - deducted
        if (next > 0) {
          dayBookings.set(bookingCode, next)
        } else {
          dayBookings.delete(bookingCode)
        }
        return deducted
      }

      const addOverheadMinutes = (dayKey: string, minutes: number): void => {
        if (minutes <= 0) return
        overheadMinutesByDay.set(dayKey, (overheadMinutesByDay.get(dayKey) ?? 0) + minutes)
      }

      const registerSessionSegment = (
        dayKey: string,
        startMs: number,
        endMs: number,
        bookingCode: string,
        minutes: number
      ): void => {
        if (minutes <= 0) return
        const daySegments = sessionSegmentsByDay.get(dayKey) ?? []
        daySegments.push({
          startMs,
          endMs,
          bookingCode,
          remainingMinutes: minutes
        })
        sessionSegmentsByDay.set(dayKey, daySegments)
      }

      const reclassifyIntervalMinutes = (
        intervalStart: Date,
        intervalEnd: Date,
        minutesToReclassify: number,
        targetBookingCode?: string
      ): void => {
        if (minutesToReclassify <= 0 || intervalEnd <= intervalStart) return

        const segments = getWorkingTimeSegments(intervalStart, intervalEnd, effectiveWorkingHours)
        let minutesLeft = minutesToReclassify

        for (const segment of segments) {
          if (minutesLeft <= 0) break

          const daySegments = sessionSegmentsByDay
            .get(segment.dayKey)
            ?.filter(
              (item) =>
                item.remainingMinutes > 0 &&
                item.endMs > segment.start.getTime() &&
                item.startMs < segment.end.getTime()
            )
            .sort((a, b) => a.startMs - b.startMs)

          if (!daySegments || daySegments.length === 0) continue

          for (const daySegment of daySegments) {
            if (minutesLeft <= 0) break

            const consumedMinutes = Math.min(minutesLeft, daySegment.remainingMinutes)
            if (consumedMinutes <= 0) continue

            daySegment.remainingMinutes -= consumedMinutes
            minutesLeft -= consumedMinutes

            if (targetBookingCode && daySegment.bookingCode === targetBookingCode) {
              continue
            }

            const deducted = subtractBookingMinutes(
              segment.dayKey,
              daySegment.bookingCode,
              consumedMinutes
            )
            if (deducted <= 0) continue

            if (targetBookingCode) {
              addBookingMinutes(segment.dayKey, targetBookingCode, deducted)
            } else {
              addOverheadMinutes(segment.dayKey, deducted)
            }
          }
        }

        if (minutesLeft > 0) {
          if (targetBookingCode) {
            const dayKey = toLocalDateKey(intervalStart)
            addBookingMinutes(dayKey, targetBookingCode, minutesLeft)
          } else {
            const dayKey = toLocalDateKey(intervalStart)
            addOverheadMinutes(dayKey, minutesLeft)
          }
        }
      }

      const categoryBookingCodeByName = new Map(
        customTaskCategories.map(
          (category) => [category.name, normalizeBookingCode(category.bookingCode)] as const
        )
      )

      const eventLinkById = new Map(calendarLinks.map((link) => [link.eventId, link] as const))

      for (const session of sessions) {
        const start = new Date(session.startIso)
        const end = session.endIso ? new Date(session.endIso) : new Date()
        const clippedStart = new Date(Math.max(start.getTime(), selectedWeekStart.getTime()))
        const clippedEnd = new Date(Math.min(end.getTime(), selectedWeekEnd.getTime()))
        if (clippedEnd <= clippedStart) continue

        const bookingCode = normalizeBookingCode(session.bookingCode) ?? UNASSIGNED_BOOKING_CODE
        const segments = getWorkingTimeSegments(clippedStart, clippedEnd, effectiveWorkingHours)
        for (const segment of segments) {
          const mins = Math.max(0, Math.floor(segment.seconds / 60))
          if (mins <= 0) continue
          addBookingMinutes(segment.dayKey, bookingCode, mins)
          registerSessionSegment(
            segment.dayKey,
            segment.start.getTime(),
            segment.end.getTime(),
            bookingCode,
            mins
          )
        }
      }

      for (const event of calendarEvents) {
        const link = eventLinkById.get(event.id)
        const classification = String(link?.classification ?? '')
        const isCustomTask = classification === 'custom-task' || classification === 'off-task'
        if (!isCustomTask) continue

        const start = new Date(event.startIso)
        const end = new Date(event.endIso)
        const clippedStart = new Date(Math.max(start.getTime(), selectedWeekStart.getTime()))
        const clippedEnd = new Date(Math.min(end.getTime(), selectedWeekEnd.getTime()))
        if (clippedEnd <= clippedStart) continue

        const mins =
          (event.source === 'off-task' || event.source === 'planning') &&
          typeof event.plannedMinutes === 'number' &&
          Number.isFinite(event.plannedMinutes)
            ? Math.max(0, Math.floor(event.plannedMinutes))
            : Math.max(0, Math.floor((clippedEnd.getTime() - clippedStart.getTime()) / 60000))

        const category = link?.customTaskCategory
        const bookingCode = category ? categoryBookingCodeByName.get(category) : undefined
        reclassifyIntervalMinutes(clippedStart, clippedEnd, mins, bookingCode)
      }

      for (const entry of manualCustomTaskEntries) {
        const entryDate = new Date(`${entry.date}T00:00:00`)
        if (entryDate < selectedWeekStart || entryDate >= selectedWeekEnd) continue

        const dayStart = new Date(`${entry.date}T00:00:00`)
        const dayEnd = new Date(`${entry.date}T23:59:59`)
        const clippedStart = new Date(Math.max(dayStart.getTime(), selectedWeekStart.getTime()))
        const clippedEnd = new Date(Math.min(dayEnd.getTime(), selectedWeekEnd.getTime()))
        if (clippedEnd <= clippedStart) continue

        const mins = Math.max(0, Math.floor(entry.minutes))
        const bookingCode = categoryBookingCodeByName.get(entry.category)
        reclassifyIntervalMinutes(clippedStart, clippedEnd, mins, bookingCode)
      }

      const rows: TimesheetRow[] = []
      for (const day of weekDays) {
        const dayKey = toLocalDateKey(day)
        const dayBookings = [...(bookingMinutesByDay.get(dayKey)?.entries() ?? [])]
          .map(([code, minutes]) => ({ code, minutes }))
          .sort((a, b) => b.minutes - a.minutes)
        const bookedMinutes = dayBookings.reduce((acc, entry) => acc + entry.minutes, 0)
        const overheadMinutes = overheadMinutesByDay.get(dayKey) ?? 0
        const totalMinutes = bookedMinutes + overheadMinutes

        rows.push({
          dayKey,
          day: day.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
          }),
          bookings: dayBookings,
          bookedMinutes,
          overheadMinutes,
          totalMinutes,
          isEmpty: totalMinutes === 0
        })
      }

      return rows
    })()
  )

  const totalMinutes = $derived(timesheetRows.reduce((acc, r) => acc + r.totalMinutes, 0))
  const totalOverheadMinutes = $derived(
    timesheetRows.reduce((acc, r) => acc + r.overheadMinutes, 0)
  )
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="flex max-h-[90vh] w-[min(96vw,56rem)] flex-col overflow-hidden sm:max-w-4xl"
  >
    <Dialog.Header>
      <Dialog.Title>Reports</Dialog.Title>
    </Dialog.Header>

    <div class="flex flex-col gap-2 py-2">
      {#if selectedTab !== 'daily-overview'}
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-muted-foreground text-xs">Selected week: {selectedWeekLabel}</div>
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onclick={() => (weekOffset -= 1)}>Previous</Button>
            <Button
              variant="outline"
              size="sm"
              disabled={weekOffset === 0}
              onclick={() => (weekOffset += 1)}
            >
              Next
            </Button>
          </div>
        </div>

        <Accordion.Root type="single" collapsible class="rounded-md border" value="">
          <Accordion.Item value="week-hours">
            <Accordion.Trigger class="px-3 py-2 no-underline hover:no-underline">
              Week Timing Override ({selectedWeekLabel})
            </Accordion.Trigger>
            <Accordion.Content>
              <div class="border-t p-3 pt-2">
                <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <p class="text-muted-foreground text-xs">
                    Edits here update both Work Logs and Timesheet for the selected week.
                  </p>
                  <div class="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBusy}
                      onclick={resetWeekToDefault}>Use Default</Button
                    >
                    <Button size="sm" disabled={isBusy} onclick={saveWeekSchedule}
                      >Save Week Hours</Button
                    >
                  </div>
                </div>
                <div class="w-full overflow-x-auto">
                  <div class="min-w-[360px] grid gap-2">
                    <div
                      class="grid grid-cols-[50px_1fr_1fr] gap-2 text-xs font-medium text-muted-foreground"
                    >
                      <span>Day</span>
                      <span>Start</span>
                      <span>End</span>
                    </div>
                    {#each weekdays as day (day.key)}
                      <div class="grid grid-cols-[50px_1fr_1fr] items-center gap-2">
                        <span class="text-xs font-medium">{day.label}</span>
                        <Input type="time" bind:value={weekOverrideDraft[day.key].start} />
                        <Input type="time" bind:value={weekOverrideDraft[day.key].end} />
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      {/if}
    </div>

    <Tabs.Root bind:value={selectedTab} class="flex min-h-0 flex-1 flex-col">
      <Tabs.List>
        <Tabs.Trigger value="worklogs">Work Logs</Tabs.Trigger>
        <Tabs.Trigger value="timesheet">Timesheet</Tabs.Trigger>
        <Tabs.Trigger value="daily-overview">Daily Overview</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="worklogs" class="flex min-h-0 flex-1 flex-col gap-2 pt-2">
        <ScrollArea.Root class="min-h-0 flex-1 rounded-md border">
          <div class="w-full overflow-x-auto">
            <Table.Root class="min-w-[640px]">
              <Table.Header>
                <Table.Row>
                  <Table.Head>Ticket</Table.Head>
                  <Table.Head>Summary</Table.Head>
                  <Table.Head>Duration</Table.Head>
                  <Table.Head>Worklog</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each jiraSessionsForSelectedWeek as session (session.id)}
                  <Table.Row>
                    <Table.Cell>
                      <Badge variant="outline">{session.jiraIssueKey}</Badge>
                    </Table.Cell>
                    <Table.Cell>{session.jiraIssueSummary}</Table.Cell>
                    <Table.Cell>{formatSessionDurationForReports(session)}</Table.Cell>
                    <Table.Cell>
                      <Tooltip.Provider>
                        <Tooltip.Root>
                          <Tooltip.Trigger>
                            <Button
                              size="sm"
                              variant="outline"
                              onclick={() =>
                                openDraftDialog({
                                  sessionId: session.id,
                                  rangeStartIso: selectedWeekStart.toISOString(),
                                  rangeEndIso: selectedWeekEnd.toISOString(),
                                  weekStartKey: selectedWeekKey
                                })}
                            >
                              Push to Jira
                            </Button>
                          </Tooltip.Trigger>
                          <Tooltip.Content>
                            <p>Draft worklog for this session</p>
                          </Tooltip.Content>
                        </Tooltip.Root>
                      </Tooltip.Provider>
                    </Table.Cell>
                  </Table.Row>
                {/each}
                {#if jiraSessionsForSelectedWeek.length === 0}
                  <Table.Row>
                    <Table.Cell colspan={4} class="text-muted-foreground py-8 text-center text-sm">
                      No Jira sessions in the selected week.
                    </Table.Cell>
                  </Table.Row>
                {/if}
              </Table.Body>
            </Table.Root>
          </div>
        </ScrollArea.Root>
        <Button
          variant="outline"
          class="w-full"
          disabled={isBusy || jiraSessionsForSelectedWeek.length === 0}
          onclick={() => openDraftDialog()}
        >
          Draft All Sessions
        </Button>
      </Tabs.Content>

      <Tabs.Content
        value="timesheet"
        class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden pt-2"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <p class="text-muted-foreground text-xs">
            Total this week: {(totalMinutes / 60).toFixed(2)}h
            <span class="text-muted-foreground font-normal"> | </span>
            <span class="text-red-600">Overhead: {(totalOverheadMinutes / 60).toFixed(2)}h</span>
          </p>
          <div class="text-muted-foreground text-xs">Hours based on selected week timing.</div>
        </div>

        <div class="min-h-0 flex-1 overflow-auto rounded-md border">
          <div class="w-full overflow-x-auto">
            <Table.Root class="min-w-[720px]">
              <Table.Header>
                <Table.Row>
                  <Table.Head>Day</Table.Head>
                  <Table.Head>Booking Codes</Table.Head>
                  <Table.Head class="text-right">Total</Table.Head>
                  <Table.Head class="text-right">Overhead</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each timesheetRows as row (row.dayKey)}
                  <Table.Row>
                    <Table.Cell class={row.isEmpty ? 'text-muted-foreground' : ''}>
                      {row.day}
                    </Table.Cell>
                    <Table.Cell>
                      {#if row.bookings.length === 0}
                        <span class="text-muted-foreground">—</span>
                      {:else}
                        <div class="space-y-1.5">
                          {#each row.bookings as booking (`${row.dayKey}-${booking.code}`)}
                            <div
                              class="bg-muted/40 border-border/70 flex items-center justify-between rounded-md border px-2 py-1"
                            >
                              <Badge variant="outline" class="font-mono text-[11px] leading-none"
                                >{booking.code}</Badge
                              >
                              <span class="font-mono text-xs tabular-nums"
                                >{(booking.minutes / 60).toFixed(2)}h</span
                              >
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </Table.Cell>
                    <Table.Cell class="text-right font-mono">
                      {row.isEmpty ? '—' : `${(row.totalMinutes / 60).toFixed(2)}h`}
                    </Table.Cell>
                    <Table.Cell
                      class={`text-right font-mono ${row.overheadMinutes > 0 ? 'text-red-600' : 'text-muted-foreground'}`}
                    >
                      {row.overheadMinutes > 0 ? `${(row.overheadMinutes / 60).toFixed(2)}h` : '—'}
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        </div>
      </Tabs.Content>

      <Tabs.Content value="daily-overview" class="flex min-h-0 flex-1 flex-col gap-3 pt-2">
        <div class="flex items-end justify-between gap-3 rounded-xl border p-3">
          <div class="space-y-1">
            <label class="text-sm font-medium">Day</label>
            <Popover.Root bind:open={dayPickerOpen}>
              <Popover.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    id="report-timeline-day"
                    variant="outline"
                    class="w-52 justify-start text-left font-normal"
                  >
                    <CalendarIcon class="mr-2 size-4" />
                    <span>{formatDayLabel(dayKey)}</span>
                  </Button>
                {/snippet}
              </Popover.Trigger>
              <Popover.Content class="w-auto p-0" align="start">
                <Calendar.Calendar
                  bind:value={dayPickerValue}
                  onValueChange={() => {
                    dayPickerOpen = false
                  }}
                />
              </Popover.Content>
            </Popover.Root>
          </div>
          <div class="text-right text-xs text-muted-foreground">
            <div>Workday: {dayTimeline.workdayLabel}</div>
            <div>Total: {formatDurationBetween(0, dayTimeline.totalMinutes * 60_000)}</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
          <div class="rounded-lg border p-2">Active task: {dayTimeline.activeMinutes}m</div>
          <div class="rounded-lg border p-2">Meetings: {dayTimeline.meetingMinutes}m</div>
          <div class="rounded-lg border p-2">Lunch: {dayTimeline.lunchMinutes}m</div>
          <div class="rounded-lg border p-2">No work: {dayTimeline.noWorkMinutes}m</div>
          <div class="rounded-lg border p-2">Overlap flags: {dayTimeline.overlapConflicts}</div>
        </div>

        {#if dayTimeline.rows.length === 0}
          <p class="rounded-lg border px-3 py-4 text-sm text-muted-foreground">
            {dayTimeline.workdayLabel || 'No timeline entries for this day.'}
          </p>
        {:else}
          <div class="min-h-0 flex-1 overflow-auto rounded-xl border">
            <div
              class="grid grid-cols-[10rem_8rem_8rem_minmax(12rem,1fr)_10rem] gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <div>Time</div>
              <div>Duration</div>
              <div>Type</div>
              <div>Detail</div>
              <div>Assigned To</div>
            </div>
            <div class="w-full overflow-x-auto">
              <div class="min-w-[640px] space-y-1 p-2">
                {#each dayTimeline.rows as row (`${row.startIso}-${row.endIso}-${row.kind}`)}
                  <div
                    class="grid grid-cols-[10rem_8rem_8rem_minmax(12rem,1fr)_10rem] items-center gap-2 rounded-md px-2 py-2 text-sm"
                  >
                    <div>{row.startLabel} - {row.endLabel}</div>
                    <div class="text-muted-foreground">{row.durationLabel}</div>
                    <div>
                      <span
                        class={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${kindBadgeClass(row.kind)}`}
                      >
                        {row.kind}
                      </span>
                    </div>
                    <div>
                      <div class="font-medium">{row.title}</div>
                      {#if row.subtitle}
                        <div class="text-xs text-muted-foreground">{row.subtitle}</div>
                      {/if}
                    </div>
                    <div class="text-xs">
                      <div>{row.assignedTaskLabel}</div>
                      {#if row.isOverlapConflict}
                        <div class="font-semibold text-destructive">overlap</div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </Tabs.Content>
    </Tabs.Root>
  </Dialog.Content>
</Dialog.Root>
