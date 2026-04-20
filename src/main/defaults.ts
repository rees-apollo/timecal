import type { PersistedState } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/defaults'

export { DEFAULT_CUSTOM_TASK_CATEGORIES } from '../shared/defaults'

export const createDefaultState = (): PersistedState => ({
  settings: { ...DEFAULT_SETTINGS },
  weeklyWorkingHoursOverrides: {},
  sessions: [],
  loggedWorklogs: [],
  recentIssueKeys: [],
  calendarEvents: [],
  calendarLinks: [],
  manualCustomTaskEntries: []
})
