import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createDefaultState } from './defaults'
import { autoCustomTaskCategoryColor } from '../shared/off-task-colors'
import { sanitizeWorkingHoursSchedule } from '../shared/working-hours'
import type { CalendarEvent, CalendarEventLink, PersistedState, TaskSession } from '../shared/types'

const STATE_FILE_NAME = 'timecal-state.json'

type LegacySettings = Partial<PersistedState['settings']> & {
  offTaskCategories?: unknown[]
}

type LegacyState = Partial<PersistedState> & {
  settings?: LegacySettings
  calendarEvents?: unknown[]
  calendarLinks?: unknown[]
  manualOffTaskEntries?: PersistedState['manualCustomTaskEntries']
}

const getStorePath = (): string => join(app.getPath('userData'), STATE_FILE_NAME)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const JIRA_ISSUE_KEY_REGEX = /^[A-Z][A-Z0-9]+-\d+$/

const inferTaskType = (issueKey: string): 'jira' | 'custom' =>
  JIRA_ISSUE_KEY_REGEX.test(issueKey.trim().toUpperCase()) ? 'jira' : 'custom'

const sanitizeState = (raw: unknown): PersistedState => {
  const fallback = createDefaultState()
  if (typeof raw !== 'object' || raw === null) return fallback

  const candidate = raw as LegacyState
  return {
    ...fallback,
    ...candidate,
    settings: {
      ...fallback.settings,
      ...(candidate.settings ?? {}),
      workingHours: sanitizeWorkingHoursSchedule(candidate.settings?.workingHours),
      customTaskCategories: Array.isArray(
        candidate.settings?.customTaskCategories ?? candidate.settings?.offTaskCategories
      )
        ? (
            candidate.settings?.customTaskCategories ??
            candidate.settings?.offTaskCategories ??
            []
          ).map((cat, index) => {
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
    recentIssueKeys: Array.isArray(candidate.recentIssueKeys) ? candidate.recentIssueKeys : [],
    calendarEvents: Array.isArray(candidate.calendarEvents)
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
              sourceRaw === 'planning'
                ? 'off-task'
                : sourceRaw === 'off-task' || sourceRaw === 'imported'
                  ? sourceRaw
                  : undefined

            return {
              id: event.id,
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
      : [],
    calendarLinks: Array.isArray(candidate.calendarLinks)
      ? candidate.calendarLinks
          .map((link): CalendarEventLink | null => {
            if (!isRecord(link) || typeof link.eventId !== 'string') return null

            const classificationRaw = (link.classification as string | undefined) ?? undefined
            const classification =
              classificationRaw === 'off-task'
                ? 'custom-task'
                : classificationRaw === 'primary-task' ||
                    classificationRaw === 'other-ticket' ||
                    classificationRaw === 'custom-task' ||
                    classificationRaw === 'unclassified'
                  ? classificationRaw
                  : 'unclassified'

            return {
              eventId: link.eventId,
              classification,
              otherTicketKey:
                typeof link.otherTicketKey === 'string' ? link.otherTicketKey : undefined,
              customTaskCategory:
                typeof (link.customTaskCategory ?? link.offTaskCategory) === 'string'
                  ? String(link.customTaskCategory ?? link.offTaskCategory)
                  : undefined
            }
          })
          .filter((link): link is CalendarEventLink => link !== null)
      : [],
    manualCustomTaskEntries: Array.isArray(
      candidate.manualCustomTaskEntries ?? candidate.manualOffTaskEntries
    )
      ? (candidate.manualCustomTaskEntries ?? candidate.manualOffTaskEntries ?? [])
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
