import { getWeekStartKey } from '../../shared/working-hours'
import type { IpcMain } from 'electron'
import { jiraClient } from './api-clients/jira-client'
import { StateStore } from './state-manager'
import type { BuildWorklogDraftInput, WorklogDraft } from '../../shared/types'
import { inferTaskType } from '../../shared/task-type'
import type {
  AppSettings,
  AppSnapshot,
  CalendarEvent,
  CalendarEventLink,
  TaskSession,
  WorkingHoursSchedule
} from '../../shared/types'
import { calculateActiveTaskSecondsForRange } from '../../shared/task-time'

const sameRange = (
  entry: { rangeStartIso?: string; rangeEndIso?: string },
  rangeStartIso?: string,
  rangeEndIso?: string
): boolean =>
  (entry.rangeStartIso ?? '') === (rangeStartIso ?? '') &&
  (entry.rangeEndIso ?? '') === (rangeEndIso ?? '')

interface WorklogManagerOptions {
  stateStore: StateStore
  withStateUpdate: (updater: () => void) => AppSnapshot
  getRequiredJiraSettings: () => AppSettings
}

const buildWorklogDraftPayload = (input: {
  session: TaskSession
  nowIso: string
  calendarEvents: CalendarEvent[]
  calendarLinks: CalendarEventLink[]
  workingHours: WorkingHoursSchedule
  rangeStartIso?: string
  rangeEndIso?: string
  alreadyLoggedSeconds?: number
}): WorklogDraft => {
  const sessionStart = new Date(input.session.startIso)
  const sessionEnd = new Date(input.session.endIso ?? input.nowIso)

  const requestStartMs = input.rangeStartIso
    ? new Date(input.rangeStartIso).getTime()
    : sessionStart.getTime()
  const requestEndMs = input.rangeEndIso
    ? new Date(input.rangeEndIso).getTime()
    : sessionEnd.getTime()

  const clippedStartMs = Number.isFinite(requestStartMs)
    ? Math.max(sessionStart.getTime(), requestStartMs)
    : sessionStart.getTime()
  const clippedEndMs = Number.isFinite(requestEndMs)
    ? Math.min(sessionEnd.getTime(), requestEndMs)
    : sessionEnd.getTime()

  const draftStart = new Date(clippedStartMs)
  const draftEnd = new Date(clippedEndMs)

  const activeSeconds = calculateActiveTaskSecondsForRange({
    start: draftStart,
    end: draftEnd,
    calendarEvents: input.calendarEvents,
    calendarLinks: input.calendarLinks,
    workingHours: input.workingHours
  })
  const alreadyLoggedSeconds = Math.max(0, Math.floor(input.alreadyLoggedSeconds ?? 0))
  const remainingSeconds = Math.max(0, activeSeconds - alreadyLoggedSeconds)

  return {
    issueKey: input.session.jiraIssueKey,
    startedIso: draftStart.toISOString(),
    timeSpentSeconds: remainingSeconds,
    comment: '',
    sourceSessionId: input.session.id,
    rangeStartIso: input.rangeStartIso,
    rangeEndIso: input.rangeEndIso
  }
}

export class WorklogManager {
  private readonly stateStore: StateStore

  private readonly withStateUpdate: (updater: () => void) => AppSnapshot

  private readonly getRequiredJiraSettings: () => AppSettings

  constructor(options: WorklogManagerOptions) {
    this.stateStore = options.stateStore
    this.withStateUpdate = options.withStateUpdate
    this.getRequiredJiraSettings = options.getRequiredJiraSettings
  }

  registerIpcHandlers(ipcMain: IpcMain): void {
    ipcMain.handle(
      'worklog:buildDraft',
      async (_, input?: BuildWorklogDraftInput): Promise<WorklogDraft> => {
        return this.buildWorklogDraft(input)
      }
    )

    ipcMain.handle('worklog:push', async (_, draft: WorklogDraft) => {
      return this.pushWorklog(draft)
    })
  }

  buildWorklogDraft(input?: BuildWorklogDraftInput): WorklogDraft {
    const state = this.stateStore.get()
    const snapshot = {
      state,
      activeSession: state.sessions.find((item) => item.id === state.activeSessionId)
    }
    const request = input ?? {}
    const latestJiraSession = [...snapshot.state.sessions]
      .reverse()
      .find(
        (item) =>
          (item.taskType ?? inferTaskType(item.jiraIssueKey)) === 'jira' &&
          (Boolean(item.endIso) || item.id === snapshot.activeSession?.id)
      )
    const session = request.sessionId
      ? snapshot.state.sessions.find((item) => item.id === request.sessionId)
      : latestJiraSession

    if (!session) {
      throw new Error('No session found to build a worklog draft.')
    }

    if ((session.taskType ?? inferTaskType(session.jiraIssueKey)) !== 'jira') {
      throw new Error('Only Jira tasks can be drafted into a Jira worklog.')
    }

    const workingHours = request.weekStartKey
      ? (snapshot.state.weeklyWorkingHoursOverrides[request.weekStartKey] ??
        snapshot.state.settings.workingHours)
      : (snapshot.state.weeklyWorkingHoursOverrides[getWeekStartKey(new Date(session.startIso))] ??
        snapshot.state.settings.workingHours)

    const alreadyLoggedSeconds = snapshot.state.loggedWorklogs
      .filter(
        (entry) =>
          entry.sourceSessionId === session.id &&
          sameRange(entry, request.rangeStartIso, request.rangeEndIso)
      )
      .reduce((sum, entry) => sum + entry.timeSpentSeconds, 0)

    return buildWorklogDraftPayload({
      session,
      nowIso: new Date().toISOString(),
      calendarEvents: snapshot.state.calendarEvents,
      calendarLinks: snapshot.state.calendarLinks,
      workingHours,
      rangeStartIso: request.rangeStartIso,
      rangeEndIso: request.rangeEndIso,
      alreadyLoggedSeconds
    })
  }

  async pushWorklog(draft: WorklogDraft): Promise<boolean> {
    const settings = this.getRequiredJiraSettings()
    await jiraClient.pushWorklog({
      baseUrl: settings.jiraBaseUrl,
      email: settings.jiraEmail,
      apiToken: settings.jiraApiToken,
      worklog: {
        issueKey: draft.issueKey,
        startedIso: draft.startedIso,
        timeSpentSeconds: draft.timeSpentSeconds,
        comment: draft.comment
      }
    })

    this.withStateUpdate(() => {
      this.stateStore.get().loggedWorklogs.push({
        id: crypto.randomUUID(),
        issueKey: draft.issueKey,
        startedIso: draft.startedIso,
        timeSpentSeconds: Math.max(0, Math.floor(draft.timeSpentSeconds)),
        loggedAtIso: new Date().toISOString(),
        sourceSessionId: draft.sourceSessionId,
        rangeStartIso: draft.rangeStartIso,
        rangeEndIso: draft.rangeEndIso
      })
    })

    return true
  }
}
