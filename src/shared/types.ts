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

export interface WorkingTimeSegment {
  dayKey: string
  start: Date
  end: Date
  seconds: number
}

export const WEEKDAY_KEYS: WeekdayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
]

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

export interface JiraIssueCacheEntry {
  summary: string
  bookingCode?: string
  lastFetchedIso: string
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
  jiraIssueCache: Record<string, JiraIssueCacheEntry>
  jiraLastSyncedIso?: string
  calendarLastPulledIso?: string
  calendarCacheStartIso?: string
  calendarEvents: CalendarEvent[]
  calendarLinks: CalendarEventLink[]
  manualCustomTaskEntries: ManualCustomTaskEntry[]
  lastUpdateCheckIso?: string
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

// ─── Timeline types ───────────────────────────────────────────────────────────

export type SegmentKind = 'active-task' | 'meeting' | 'lunch' | 'no-work'

export interface TimelineSegment {
  startMs: number
  endMs: number
  /** Duration in whole minutes (floored). */
  minutes: number
  /**
   * For off-task/planning meeting segments: the manually-set planned minutes
   * to use for timesheet reclassification instead of `minutes`.
   */
  plannedMinutes?: number
  kind: SegmentKind
  title: string
  subtitle?: string
  assignedTaskLabel: string
  sessionId?: string
  sessionBookingCode?: string
  eventId?: string
  classification?: CalendarEventClassification
  isOverlapConflict: boolean
}

export interface DayTimelineInput {
  dayKey: string
  sessions: TaskSession[]
  calendarEvents: CalendarEvent[]
  calendarLinks: CalendarEventLink[]
  customTaskCategories?: CustomTaskCategory[]
  activeSessionId?: string
  workingHours: WorkingHoursSchedule
}

export interface DayTimelineSummary {
  workdayLabel: string
  totalMinutes: number
  activeMinutes: number
  meetingMinutes: number
  lunchMinutes: number
  noWorkMinutes: number
  overlapConflicts: number
}

export type TimesheetBookings = Map<string, number>
export type TimesheetOverheadMinutes = number

export interface TimesheetDayResult {
  bookings: TimesheetBookings
  overheadMinutes: TimesheetOverheadMinutes
}

export interface DayOverviewRow {
  startIso: string
  endIso: string
  startLabel: string
  endLabel: string
  durationLabel: string
  kind: SegmentKind
  title: string
  subtitle?: string
  assignedTaskLabel: string
  isOverlapConflict: boolean
}

export interface DayOverviewResult {
  rows: DayOverviewRow[]
  workdayLabel: string
  totalMinutes: number
  activeMinutes: number
  meetingMinutes: number
  lunchMinutes: number
  noWorkMinutes: number
  overlapConflicts: number
}

export interface BookingBreakdown {
  code: string
  minutes: number
}

export interface TimesheetRow {
  dayKey: string
  day: string
  bookings: BookingBreakdown[]
  bookedMinutes: number
  overheadMinutes: number
  totalMinutes: number
  isEmpty: boolean
}

export interface SessionWorklogMinutes {
  remaining: number
  logged: number
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
