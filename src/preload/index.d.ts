import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AddManualCustomTaskInput,
  AppSettings,
  AppSnapshot,
  CreatePlanningEventInput,
  DeletePlanningEventInput,
  JiraIssue,
  SearchIssuesInput,
  SetWeeklyWorkingHoursInput,
  SetCalendarClassificationInput,
  StartTaskInput,
  UpdateTaskTransitionsInput,
  UpdatePlanningEventInput,
  WorklogDraft
} from '../shared/types'

interface TimecalApi {
  getSnapshot: () => Promise<AppSnapshot>
  saveSettings: (settings: AppSettings) => Promise<AppSnapshot>
  setWeeklyWorkingHours: (input: SetWeeklyWorkingHoursInput) => Promise<AppSnapshot>
  searchIssues: (input: SearchIssuesInput) => Promise<JiraIssue[]>
  startTask: (input: StartTaskInput) => Promise<AppSnapshot>
  switchTask: (input: StartTaskInput) => Promise<AppSnapshot>
  updateTaskTransitions: (input: UpdateTaskTransitionsInput) => Promise<AppSnapshot>
  stopActiveTask: () => Promise<AppSnapshot>
  pullCalendar: () => Promise<AppSnapshot>
  classifyCalendarEvent: (input: SetCalendarClassificationInput) => Promise<AppSnapshot>
  createPlanningEvent: (input: CreatePlanningEventInput) => Promise<AppSnapshot>
  updatePlanningEvent: (input: UpdatePlanningEventInput) => Promise<AppSnapshot>
  deletePlanningEvent: (input: DeletePlanningEventInput) => Promise<AppSnapshot>
  addManualCustomTask: (input: AddManualCustomTaskInput) => Promise<AppSnapshot>
  buildWorklogDraft: (sessionId?: string) => Promise<WorklogDraft>
  pushWorklog: (draft: WorklogDraft) => Promise<boolean>
  onStateChanged: (callback: (snapshot: AppSnapshot) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: TimecalApi
  }
}
