import { Temporal } from 'temporal-polyfill'
import type { CalendarEvent, TaskSession, WorkingHoursSchedule } from '../../../../../shared/types'
import {
  getWorkingTimeSegments,
  sanitizeWorkingHoursSchedule
} from '../../../../../shared/working-hours'
import { autoCustomTaskCategoryColor } from '../../../../../shared/off-task-colors'
import {
  isDayScopedOffTaskEvent,
  normalizeHex,
  resolveCustomTaskCalendarVisual,
  toTemporalDateForPlanning
} from './index'

type CalendarLinkLike = {
  eventId: string
  classification?:
    | 'primary-task'
    | 'other-ticket'
    | 'off-task'
    | 'custom-task'
    | 'ignored'
    | 'unclassified'
  customTaskCategory?: string
}

type CustomTaskCategory = {
  name: string
  color: string
}

export const buildScheduleXEvents = (input: {
  calendarEvents: CalendarEvent[]
  linkByEventId: Map<string, CalendarLinkLike>
  customTaskCategories: CustomTaskCategory[]
  getClassification: (
    eventId: string
  ) => 'primary-task' | 'other-ticket' | 'off-task' | 'custom-task' | 'ignored' | 'unclassified'
  getCustomTaskCategory: (eventId: string) => string | undefined
  getEventColor: (eventId: string) => string
  toTemporalZonedDateTime: (iso: string) => Temporal.ZonedDateTime
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
}) => {
  const {
    calendarEvents,
    linkByEventId,
    customTaskCategories,
    getClassification,
    getCustomTaskCategory,
    getEventColor,
    toTemporalZonedDateTime
  } = input

  return calendarEvents.map((event) => {
    const eventId = String(event.id)
    const link = linkByEventId.get(eventId)
    const classification = link?.classification ?? getClassification(eventId)
    const customTaskCategory = link?.customTaskCategory ?? getCustomTaskCategory(eventId)
    const eventType =
      classification === 'primary-task'
        ? 'primary'
        : classification === 'other-ticket'
          ? 'other-ticket'
          : classification === 'off-task' || classification === 'custom-task'
            ? 'custom-task'
            : classification === 'ignored'
              ? 'ignored'
              : isDayScopedOffTaskEvent(event)
                ? 'off-task'
                : 'unclassified'
    const colorHex = normalizeHex(getEventColor(eventId))
    const customTaskVisual = resolveCustomTaskCalendarVisual(
      customTaskCategories,
      customTaskCategory
    )
    const calendarId =
      eventType === 'custom-task'
        ? customTaskVisual.calendarId
        : eventType === 'off-task'
          ? 'off-task'
          : eventType === 'primary'
            ? 'primary'
            : eventType === 'other-ticket'
              ? 'other-ticket'
              : eventType === 'ignored'
                ? 'ignored'
                : 'imported'
    const visualMeta = {
      eventId,
      calendarId,
      colorHex: eventType === 'custom-task' ? customTaskVisual.colorHex : colorHex
    }

    const isIgnored = eventType === 'ignored'

    if (isDayScopedOffTaskEvent(event)) {
      const planningWindow = toTemporalDateForPlanning(event.startIso, event.endIso)
      return {
        id: event.id,
        title: event.subject,
        start: planningWindow.start,
        end: planningWindow.end,
        calendarId: visualMeta.calendarId,
        source: 'off-task' as const,
        _options: {
          disableDND: true,
          disableResize: true,
          additionalClasses: isIgnored
            ? ['tc-event', 'tc-off-task-event', 'tc-ignored-event']
            : ['tc-event', 'tc-off-task-event']
        }
      }
    }

    const zonedStart = toTemporalZonedDateTime(event.startIso)
    const zonedEnd = toTemporalZonedDateTime(event.endIso)

    const startIsMidnight =
      zonedStart.hour === 0 &&
      zonedStart.minute === 0 &&
      zonedStart.second === 0 &&
      zonedStart.millisecond === 0

    if (startIsMidnight) {
      const startDate = zonedStart.toPlainDate()
      const endIsMidnight =
        zonedEnd.hour === 0 &&
        zonedEnd.minute === 0 &&
        zonedEnd.second === 0 &&
        zonedEnd.millisecond === 0
      const endDate = endIsMidnight
        ? zonedEnd.toPlainDate().subtract({ days: 1 })
        : zonedEnd.toPlainDate()

      return {
        id: event.id,
        title: event.subject,
        start: startDate,
        end: endDate,
        calendarId: visualMeta.calendarId,
        source: event.source ?? 'imported',
        _options: {
          disableDND: true,
          disableResize: true,
          additionalClasses: isIgnored ? ['tc-event', 'tc-ignored-event'] : ['tc-event']
        }
      }
    }

    return {
      id: event.id,
      title: event.subject,
      start: zonedStart,
      end: zonedEnd,
      calendarId: visualMeta.calendarId,
      source: event.source ?? 'imported',
      _options: {
        disableDND: true,
        disableResize: true,
        additionalClasses: isIgnored ? ['tc-event', 'tc-ignored-event'] : ['tc-event']
      }
    }
  })
}

export const buildScheduleXBackgroundEvents = (input: {
  sessions: TaskSession[]
  workingHours: WorkingHoursSchedule
  toTemporalZonedDateTime: (iso: string) => Temporal.ZonedDateTime
}): Array<{
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
  title: string
  style: Record<string, string>
}> => {
  const { sessions, workingHours, toTemporalZonedDateTime } = input
  const backgroundEvents: Array<{
    start: Temporal.ZonedDateTime
    end: Temporal.ZonedDateTime
    title: string
    style: Record<string, string>
  }> = []

  const safeSchedule = sanitizeWorkingHoursSchedule(workingHours)
  const now = new Date()

  for (const session of sessions) {
    const start = new Date(session.startIso)
    const end = new Date(session.endIso ?? now.toISOString())
    const segments = getWorkingTimeSegments(start, end, safeSchedule)
    const ticketKey = session.jiraIssueKey.trim()
    const taskName = session.jiraIssueSummary.trim()
    const shadedLabel =
      taskName && taskName.toLowerCase() !== ticketKey.toLowerCase()
        ? `${ticketKey} - ${taskName}`
        : ticketKey
    const ticketColorSeed = `${session.taskType ?? 'jira'}:${ticketKey}`
    const ticketColor = autoCustomTaskCategoryColor(ticketColorSeed)
    const borderColor = `color-mix(in oklab, ${ticketColor} 78%, #0f172a)`
    const fillColor = `color-mix(in oklab, ${ticketColor} 32%, transparent)`
    const stripeStrong = `color-mix(in oklab, ${ticketColor} 28%, transparent)`
    const stripeSoft = `color-mix(in oklab, ${ticketColor} 12%, transparent)`

    for (const segment of segments) {
      backgroundEvents.push({
        start: toTemporalZonedDateTime(segment.start.toISOString()),
        end: toTemporalZonedDateTime(segment.end.toISOString()),
        title: shadedLabel,
        style: {
          backgroundColor: fillColor,
          backgroundImage: `repeating-linear-gradient(135deg, ${stripeStrong} 0 10px, ${stripeSoft} 10px 20px)`,
          border: `1px solid ${borderColor}`,
          borderLeft: `3px solid ${ticketColor}`,
          boxShadow: 'inset 0 0 0 1px color-mix(in oklab, #f8fafc 16%, transparent)'
        }
      })
    }
  }

  return backgroundEvents
}
