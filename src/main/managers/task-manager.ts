import type { IpcMain } from 'electron'
import { StateStore } from './state-manager'
import { inferTaskType } from '../../shared/task-type'
import type {
  AppSnapshot,
  StartTaskInput,
  TaskSession,
  UpdateTaskTransitionsInput
} from '../../shared/types'

interface TaskManagerOptions {
  stateStore: StateStore
  withStateUpdate: (updater: () => void) => AppSnapshot
}

export class TaskManager {
  private readonly stateStore: StateStore

  private readonly withStateUpdate: (updater: () => void) => AppSnapshot

  constructor(options: TaskManagerOptions) {
    this.stateStore = options.stateStore
    this.withStateUpdate = options.withStateUpdate
  }

  registerIpcHandlers(ipcMain: IpcMain): void {
    ipcMain.handle('task:start', async (_, input: StartTaskInput) => this.startSession(input))

    ipcMain.handle('task:switch', async (_, input: StartTaskInput) => this.startSession(input))

    ipcMain.handle('task:updateTransitions', async (_, input: UpdateTaskTransitionsInput) =>
      this.updateTaskTransitions(input)
    )

    ipcMain.handle('task:stopActive', async () => this.stopActiveSession())
  }

  getActiveSession(): TaskSession | undefined {
    const state = this.stateStore.get()
    return state.sessions.find((item) => item.id === state.activeSessionId)
  }

  getRecentIssueDetails(issueKey: string): {
    summary: string
    bookingCode?: string
    taskType?: 'jira' | 'custom'
  } {
    const state = this.stateStore.get()
    const latestSession = [...state.sessions]
      .reverse()
      .find((session) => session.jiraIssueKey === issueKey)
    if (!latestSession) {
      return { summary: issueKey }
    }

    return {
      summary: latestSession.jiraIssueSummary,
      bookingCode: latestSession.bookingCode,
      taskType: latestSession.taskType
    }
  }

  startSession(input: StartTaskInput): AppSnapshot {
    return this.withStateUpdate(() => {
      const state = this.stateStore.get()
      const now = new Date().toISOString()

      if (state.activeSessionId) {
        const active = state.sessions.find((item) => item.id === state.activeSessionId)
        if (active && !active.endIso) {
          active.endIso = now
        }
      }

      const taskType = input.taskType ?? inferTaskType(input.issueKey)
      const nextSession: TaskSession = {
        id: crypto.randomUUID(),
        jiraIssueKey: input.issueKey,
        jiraIssueSummary: input.summary,
        bookingCode: input.bookingCode,
        taskType,
        startIso: now
      }
      state.sessions.push(nextSession)
      state.activeSessionId = nextSession.id

      if (taskType === 'jira') {
        state.recentIssueKeys = [
          input.issueKey,
          ...state.recentIssueKeys.filter((item) => item !== input.issueKey)
        ].slice(0, 8)
      }
    })
  }

  stopActiveSession(): AppSnapshot {
    return this.withStateUpdate(() => {
      const state = this.stateStore.get()
      if (!state.activeSessionId) return

      const active = state.sessions.find((item) => item.id === state.activeSessionId)
      if (active && !active.endIso) {
        active.endIso = new Date().toISOString()
      }
      state.activeSessionId = undefined
    })
  }

  updateTaskTransitions(input: UpdateTaskTransitionsInput): AppSnapshot {
    return this.withStateUpdate(() => {
      const state = this.stateStore.get()
      const existingById = new Map(state.sessions.map((session) => [session.id, session]))

      const normalized = [...input.transitions]
        .map((transition) => ({
          id: transition.id?.trim() || crypto.randomUUID(),
          issueKey: transition.issueKey.trim(),
          summary: transition.summary.trim(),
          bookingCode: transition.bookingCode?.trim() || undefined,
          taskType: transition.taskType,
          startIso: transition.startIso
        }))
        .filter((transition) => transition.issueKey.length > 0)

      normalized.sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime())

      const rebuilt: TaskSession[] = []
      for (let index = 0; index < normalized.length; index += 1) {
        const row = normalized[index]
        const startMs = new Date(row.startIso).getTime()
        if (Number.isNaN(startMs)) {
          throw new Error(`Invalid transition start time for ${row.issueKey}.`)
        }

        const next = normalized[index + 1]
        const nextStartMs = next ? new Date(next.startIso).getTime() : null
        if (nextStartMs !== null && Number.isNaN(nextStartMs)) {
          throw new Error(`Invalid transition start time for ${next.issueKey}.`)
        }
        if (nextStartMs !== null && nextStartMs <= startMs) {
          throw new Error('Each transition must have a unique start time in chronological order.')
        }

        const existing = existingById.get(row.id)
        const session: TaskSession = {
          id: row.id,
          jiraIssueKey: row.issueKey,
          jiraIssueSummary: row.summary || row.issueKey,
          bookingCode: row.bookingCode,
          taskType: row.taskType ?? inferTaskType(row.issueKey),
          startIso: row.startIso
        }

        if (next) {
          session.endIso = next.startIso
        } else if (existing?.endIso && new Date(existing.endIso).getTime() > startMs) {
          session.endIso = existing.endIso
        }

        rebuilt.push(session)
      }

      state.sessions = rebuilt
      const last = rebuilt[rebuilt.length - 1]
      state.activeSessionId = last && !last.endIso ? last.id : undefined

      const jiraKeys = rebuilt
        .filter((session) => (session.taskType ?? inferTaskType(session.jiraIssueKey)) === 'jira')
        .map((session) => session.jiraIssueKey)
        .reverse()
      state.recentIssueKeys = [...new Set([...jiraKeys, ...state.recentIssueKeys])].slice(0, 8)
    })
  }
}
