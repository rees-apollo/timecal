import { autoCustomTaskCategoryColor } from '../../shared/off-task-colors'
import { sanitizeWorkingHoursSchedule } from '../../shared/working-hours'
import type { IpcMain } from 'electron'
import { jiraClient } from './api-clients/jira-client'
import { StateStore } from './state-manager'
import type {
  AppSettings,
  AppSnapshot,
  JiraIssue,
  SearchIssuesInput,
  SetWeeklyWorkingHoursInput
} from '../../shared/types'

interface SettingsManagerOptions {
  stateStore: StateStore
  withStateUpdate: (updater: () => void) => AppSnapshot
}

export class SettingsManager {
  private readonly stateStore: StateStore

  private readonly withStateUpdate: (updater: () => void) => AppSnapshot

  constructor(options: SettingsManagerOptions) {
    this.stateStore = options.stateStore
    this.withStateUpdate = options.withStateUpdate
  }

  registerIpcHandlers(ipcMain: IpcMain): void {
    ipcMain.handle('app:saveSettings', async (_, settings: AppSettings) => {
      return this.saveSettings(settings)
    })

    ipcMain.handle(
      'reports:setWeeklyWorkingHours',
      async (_, input: SetWeeklyWorkingHoursInput) => {
        return this.setWeeklyWorkingHours(input)
      }
    )

    ipcMain.handle('jira:searchIssues', async (_, input: SearchIssuesInput) => {
      return this.searchIssues(input)
    })
  }

  getRequiredJiraSettings(): AppSettings {
    const settings = this.stateStore.get().settings
    if (!settings.jiraBaseUrl || !settings.jiraEmail || !settings.jiraApiToken) {
      throw new Error('Please configure Jira base URL, email, and API token first.')
    }
    return settings
  }

  saveSettings(settings: AppSettings): AppSnapshot {
    return this.withStateUpdate(() => {
      this.stateStore.get().settings = {
        ...settings,
        workingHours: sanitizeWorkingHoursSchedule(settings.workingHours),
        customTaskCategories: settings.customTaskCategories.map((category, index) => ({
          ...category,
          color: category.color || autoCustomTaskCategoryColor(category.name, index)
        }))
      }
    })
  }

  setWeeklyWorkingHours(input: SetWeeklyWorkingHoursInput): AppSnapshot {
    return this.withStateUpdate(() => {
      const state = this.stateStore.get()
      if (!input.schedule) {
        delete state.weeklyWorkingHoursOverrides[input.weekStartKey]
        return
      }

      state.weeklyWorkingHoursOverrides[input.weekStartKey] = sanitizeWorkingHoursSchedule(
        input.schedule
      )
    })
  }

  async searchIssues(input: SearchIssuesInput): Promise<JiraIssue[]> {
    const settings = this.getRequiredJiraSettings()
    try {
      return await jiraClient.searchIssues({
        baseUrl: settings.jiraBaseUrl,
        email: settings.jiraEmail,
        apiToken: settings.jiraApiToken,
        bookingCodeField: settings.jiraBookingCodeField,
        query: input.query,
        maxResults: input.maxResults ?? 20
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Jira issue search failed: ${message}`)
    }
  }
}
