export type CalendarEventClassification =
  | 'primary-task'
  | 'other-ticket'
  | 'custom-task'
  | 'ignored'
  | 'unclassified'

export interface CustomTaskCategory {
  name: string
  bookingCode: string
  color: string
}

export type WeekdayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface DailyWorkingHours {
  start: string
  end: string
  lunchDurationMins?: number
}

export type WorkingHoursSchedule = Record<WeekdayKey, DailyWorkingHours>
export type WeeklyWorkingHoursOverrides = Record<string, WorkingHoursSchedule>

export type TaskType = 'jira' | 'custom'

export interface AppSettings {
  jiraBaseUrl: string
  jiraEmail: string
  jiraApiToken: string
  jiraBookingCodeField: string
  customTaskCategories: CustomTaskCategory[]
  workingHours: WorkingHoursSchedule
}

export interface JiraIssue {
  id: string
  key: string
  summary: string
  bookingCode?: string
}

export interface TaskSession {
  id: string
  jiraIssueKey: string
  jiraIssueSummary: string
  bookingCode?: string
  taskType?: TaskType
  startIso: string
  endIso?: string
}

export interface CalendarEvent {
  id: string
  subject: string
  startIso: string
  endIso: string
  source?: 'imported' | 'planning' | 'off-task'
  plannedMinutes?: number
}

export interface CreatePlanningEventInput {
  startIso: string
  endIso: string
  subject?: string
  plannedMinutes?: number
}

export interface UpdatePlanningEventInput {
  id: string
  startIso: string
  endIso: string
  subject?: string
  plannedMinutes?: number | null
}

export interface DeletePlanningEventInput {
  id: string
}

export interface CalendarEventLink {
  eventId: string
  classification: CalendarEventClassification
  otherTicketKey?: string
  customTaskCategory?: string
}

export interface ManualCustomTaskEntry {
  id: string
  date: string
  minutes: number
  category: string
  notes?: string
}

export interface WorklogDraft {
  issueKey: string
  startedIso: string
  timeSpentSeconds: number
  comment: string
  sourceSessionId?: string
  rangeStartIso?: string
  rangeEndIso?: string
}

export interface LoggedWorklogEntry {
  id: string
  issueKey: string
  startedIso: string
  timeSpentSeconds: number
  loggedAtIso: string
  sourceSessionId?: string
  rangeStartIso?: string
  rangeEndIso?: string
}

export interface BuildWorklogDraftInput {
  sessionId?: string
  rangeStartIso?: string
  rangeEndIso?: string
  weekStartKey?: string
}

export interface PersistedState {
  settings: AppSettings
  weeklyWorkingHoursOverrides: WeeklyWorkingHoursOverrides
  activeSessionId?: string
  sessions: TaskSession[]
  loggedWorklogs: LoggedWorklogEntry[]
  recentIssueKeys: string[]
  calendarLastPulledIso?: string
  calendarCacheStartIso?: string
  calendarEvents: CalendarEvent[]
  calendarLinks: CalendarEventLink[]
  manualCustomTaskEntries: ManualCustomTaskEntry[]
}

export interface StartTaskInput {
  issueKey: string
  summary: string
  bookingCode?: string
  taskType?: TaskType
}

export interface TaskTransitionInput {
  id?: string
  issueKey: string
  summary: string
  bookingCode?: string
  taskType?: TaskType
  startIso: string
}

export interface UpdateTaskTransitionsInput {
  transitions: TaskTransitionInput[]
}

export interface SetCalendarClassificationInput {
  eventId: string
  classification: CalendarEventClassification
  otherTicketKey?: string
  customTaskCategory?: string
}

export interface AddManualCustomTaskInput {
  date: string
  minutes: number
  category: string
  notes?: string
}

export interface SetWeeklyWorkingHoursInput {
  weekStartKey: string
  schedule?: WorkingHoursSchedule
}

export interface SearchIssuesInput {
  query: string
  maxResults?: number
}

export interface PushWorklogInput {
  issueKey: string
  startedIso: string
  timeSpentSeconds: number
  comment: string
}

export interface AppSnapshot {
  state: PersistedState
  activeSession?: TaskSession
}
