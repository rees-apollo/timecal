import { app } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { autoCustomTaskCategoryColor } from '../../shared/off-task-colors'
import { sanitizeWorkingHoursSchedule } from '../../shared/working-hours'
import { inferTaskType } from '../../shared/task-type'
import { DEFAULT_SETTINGS } from '../../shared/defaults'
import type {
  CalendarEvent,
  CalendarEventLink,
  LoggedWorklogEntry,
  PersistedState,
  TaskSession
} from '../../shared/types'

const STATE_FILE_NAME = 'timecal-state.json'
const createDefaultState = (): PersistedState => ({
  settings: { ...DEFAULT_SETTINGS },
  weeklyWorkingHoursOverrides: {},
  sessions: [],
  loggedWorklogs: [],
  recentIssueKeys: [],
  calendarEvents: [],
  calendarLinks: [],
  manualCustomTaskEntries: []
})

const getStorePath = (): string => join(app.getPath('userData'), STATE_FILE_NAME)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizeImportedEventId = (legacyId: string, startIso: string): string => {
  if (legacyId.startsWith('imp_')) return legacyId

  const baseId = legacyId.includes(':') ? legacyId.slice(0, legacyId.indexOf(':')) : legacyId
  const hash = createHash('sha1').update(baseId).digest('hex').slice(0, 16)
  const startMs = Date.parse(startIso)
  const suffix = Number.isFinite(startMs) ? String(startMs) : startIso.replace(/[^0-9]/g, '') || '0'

  return `imp_${hash}_${suffix}`
}

const sanitizeState = (raw: unknown): PersistedState => {
  const fallback = createDefaultState()
  if (typeof raw !== 'object' || raw === null) return fallback

  const candidate = raw as Partial<PersistedState>
  const normalizedCalendarIdMap = new Map<string, string>()

  const sanitizedCalendarEvents: CalendarEvent[] = Array.isArray(candidate.calendarEvents)
    ? candidate.calendarEvents
        .map((event): CalendarEvent | null => {
          if (!isRecord(event)) return null
          if (
            typeof event.id !== 'string' ||
            typeof event.subject !== 'string' ||
            typeof event.startIso !== 'string' ||
            typeof event.endIso !== 'string'
          ) {
            return null
          }

          const sourceRaw = (event.source as string | undefined) ?? undefined
          const source =
            sourceRaw === 'off-task' || sourceRaw === 'imported' || sourceRaw === 'planning'
              ? sourceRaw
              : undefined

          const normalizedId =
            source === 'imported' ? normalizeImportedEventId(event.id, event.startIso) : event.id
          normalizedCalendarIdMap.set(event.id, normalizedId)

          return {
            id: normalizedId,
            subject: event.subject,
            startIso: event.startIso,
            endIso: event.endIso,
            source,
            plannedMinutes:
              typeof event.plannedMinutes === 'number' && Number.isFinite(event.plannedMinutes)
                ? Math.max(1, Math.floor(event.plannedMinutes))
                : undefined
          }
        })
        .filter((event): event is CalendarEvent => event !== null)
    : []

  const sanitizedCalendarLinks: CalendarEventLink[] = Array.isArray(candidate.calendarLinks)
    ? candidate.calendarLinks
        .map((link): CalendarEventLink | null => {
          if (!isRecord(link) || typeof link.eventId !== 'string') return null

          const classificationRaw = (link.classification as string | undefined) ?? undefined
          const classification =
            classificationRaw === 'primary-task' ||
            classificationRaw === 'other-ticket' ||
            classificationRaw === 'custom-task' ||
            classificationRaw === 'ignored' ||
            classificationRaw === 'unclassified'
              ? classificationRaw
              : 'unclassified'

          return {
            eventId: normalizedCalendarIdMap.get(link.eventId) ?? link.eventId,
            classification,
            otherTicketKey:
              typeof link.otherTicketKey === 'string' ? link.otherTicketKey : undefined,
            customTaskCategory:
              typeof link.customTaskCategory === 'string' ? link.customTaskCategory : undefined
          }
        })
        .filter((link): link is CalendarEventLink => link !== null)
    : []

  return {
    ...fallback,
    ...candidate,
    settings: {
      ...fallback.settings,
      ...(candidate.settings ?? {}),
      workingHours: sanitizeWorkingHoursSchedule(candidate.settings?.workingHours),
      customTaskCategories: Array.isArray(candidate.settings?.customTaskCategories)
        ? candidate.settings.customTaskCategories.map((cat, index) => {
            if (typeof cat === 'string') {
              return {
                name: cat,
                bookingCode: '',
                color: autoCustomTaskCategoryColor(cat, index)
              }
            }

            if (!isRecord(cat)) {
              return {
                name: '',
                bookingCode: '',
                color: autoCustomTaskCategoryColor('', index)
              }
            }

            const safeName = typeof cat.name === 'string' ? cat.name : ''
            const safeBookingCode = typeof cat.bookingCode === 'string' ? cat.bookingCode : ''
            const safeColor =
              typeof cat.color === 'string' && cat.color
                ? cat.color
                : autoCustomTaskCategoryColor(safeName, index)

            return {
              name: safeName,
              bookingCode: safeBookingCode,
              color: safeColor
            }
          })
        : fallback.settings.customTaskCategories
    },
    weeklyWorkingHoursOverrides: isRecord(candidate.weeklyWorkingHoursOverrides)
      ? Object.fromEntries(
          Object.entries(candidate.weeklyWorkingHoursOverrides).map(([weekStartKey, schedule]) => [
            weekStartKey,
            sanitizeWorkingHoursSchedule(schedule)
          ])
        )
      : {},
    sessions: Array.isArray(candidate.sessions)
      ? candidate.sessions.reduce<TaskSession[]>((acc, session) => {
          if (!isRecord(session) || typeof session.jiraIssueKey !== 'string') return acc

          const taskType =
            session.taskType === 'jira' || session.taskType === 'custom'
              ? session.taskType
              : inferTaskType(session.jiraIssueKey)

          acc.push({
            id: typeof session.id === 'string' ? session.id : crypto.randomUUID(),
            jiraIssueKey: session.jiraIssueKey,
            jiraIssueSummary:
              typeof session.jiraIssueSummary === 'string'
                ? session.jiraIssueSummary
                : session.jiraIssueKey,
            bookingCode: typeof session.bookingCode === 'string' ? session.bookingCode : undefined,
            taskType,
            startIso:
              typeof session.startIso === 'string' ? session.startIso : new Date().toISOString(),
            endIso: typeof session.endIso === 'string' ? session.endIso : undefined
          })
          return acc
        }, [])
      : [],
    loggedWorklogs: Array.isArray(candidate.loggedWorklogs)
      ? candidate.loggedWorklogs
          .map<LoggedWorklogEntry | null>((entry) => {
            if (!isRecord(entry)) return null
            if (
              typeof entry.id !== 'string' ||
              typeof entry.issueKey !== 'string' ||
              typeof entry.startedIso !== 'string' ||
              typeof entry.timeSpentSeconds !== 'number' ||
              !Number.isFinite(entry.timeSpentSeconds) ||
              typeof entry.loggedAtIso !== 'string'
            ) {
              return null
            }

            return {
              id: entry.id,
              issueKey: entry.issueKey,
              startedIso: entry.startedIso,
              timeSpentSeconds: Math.max(0, Math.floor(entry.timeSpentSeconds)),
              loggedAtIso: entry.loggedAtIso,
              sourceSessionId:
                typeof entry.sourceSessionId === 'string' ? entry.sourceSessionId : undefined,
              rangeStartIso:
                typeof entry.rangeStartIso === 'string' ? entry.rangeStartIso : undefined,
              rangeEndIso: typeof entry.rangeEndIso === 'string' ? entry.rangeEndIso : undefined
            }
          })
          .filter((entry): entry is LoggedWorklogEntry => entry !== null)
      : [],
    recentIssueKeys: Array.isArray(candidate.recentIssueKeys) ? candidate.recentIssueKeys : [],
    calendarEvents: sanitizedCalendarEvents,
    calendarLinks: sanitizedCalendarLinks,
    manualCustomTaskEntries: Array.isArray(candidate.manualCustomTaskEntries)
      ? candidate.manualCustomTaskEntries
      : []
  }
}

export class StateStore {
  private state: PersistedState = createDefaultState()

  load(): PersistedState {
    const storePath = getStorePath()
    if (!existsSync(storePath)) {
      this.state = createDefaultState()
      return this.state
    }

    try {
      const rawJson = readFileSync(storePath, 'utf-8')
      const parsed = JSON.parse(rawJson) as unknown
      this.state = sanitizeState(parsed)
    } catch {
      this.state = createDefaultState()
    }

    return this.state
  }

  save(next: PersistedState): PersistedState {
    this.state = next
    const storePath = getStorePath()
    writeFileSync(storePath, JSON.stringify(this.state, null, 2), 'utf-8')
    return this.state
  }

  get(): PersistedState {
    return this.state
  }
}
