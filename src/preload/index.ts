import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
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

// Custom APIs for renderer
const api = {
  getSnapshot: (): Promise<AppSnapshot> => electronAPI.ipcRenderer.invoke('app:getSnapshot'),
  saveSettings: (settings: AppSettings): Promise<AppSnapshot> =>
    electronAPI.ipcRenderer.invoke('app:saveSettings', settings),
  setWeeklyWorkingHours: (input: SetWeeklyWorkingHoursInput): Promise<AppSnapshot> =>
    electronAPI.ipcRenderer.invoke('reports:setWeeklyWorkingHours', input),
  searchIssues: (input: SearchIssuesInput): Promise<JiraIssue[]> =>
    electronAPI.ipcRenderer.invoke('jira:searchIssues', input),
  startTask: (input: StartTaskInput): Promise<AppSnapshot> =>
    electronAPI.ipcRenderer.invoke('task:start', input),
  switchTask: (input: StartTaskInput): Promise<AppSnapshot> =>
    electronAPI.ipcRenderer.invoke('task:switch', input),
  updateTaskTransitions: (input: UpdateTaskTransitionsInput): Promise<AppSnapshot> =>
    electronAPI.ipcRenderer.invoke('task:updateTransitions', input),
  stopActiveTask: (): Promise<AppSnapshot> => electronAPI.ipcRenderer.invoke('task:stopActive'),
  pullCalendar: (): Promise<AppSnapshot> => electronAPI.ipcRenderer.invoke('calendar:pull'),
  classifyCalendarEvent: (input: SetCalendarClassificationInput): Promise<AppSnapshot> =>
    electronAPI.ipcRenderer.invoke('calendar:classify', input),
  createPlanningEvent: (input: CreatePlanningEventInput): Promise<AppSnapshot> =>
    electronAPI.ipcRenderer.invoke('calendar:planning:create', input),
  updatePlanningEvent: (input: UpdatePlanningEventInput): Promise<AppSnapshot> =>
    electronAPI.ipcRenderer.invoke('calendar:planning:update', input),
  deletePlanningEvent: (input: DeletePlanningEventInput): Promise<AppSnapshot> =>
    electronAPI.ipcRenderer.invoke('calendar:planning:delete', input),
  addManualCustomTask: (input: AddManualCustomTaskInput): Promise<AppSnapshot> =>
    electronAPI.ipcRenderer.invoke('customTask:addManual', input),
  buildWorklogDraft: (sessionId?: string): Promise<WorklogDraft> =>
    electronAPI.ipcRenderer.invoke('worklog:buildDraft', sessionId),
  pushWorklog: (draft: WorklogDraft): Promise<boolean> =>
    electronAPI.ipcRenderer.invoke('worklog:push', draft),
  onStateChanged: (callback: (snapshot: AppSnapshot) => void): (() => void) => {
    const subscription = (_: unknown, snapshot: AppSnapshot): void => callback(snapshot)
    electronAPI.ipcRenderer.on('state:changed', subscription)
    return () => electronAPI.ipcRenderer.removeListener('state:changed', subscription)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
