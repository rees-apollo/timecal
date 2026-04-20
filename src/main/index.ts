import { app, shell, BrowserWindow, ipcMain, Tray, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { StateStore } from './state-store'
import { JiraClient } from './jira-client'
import { OutlookClient } from './outlook-client'
import { buildWorklogDraft } from './time-engine'
import { autoCustomTaskCategoryColor } from '../shared/off-task-colors'
import { getWeekStartKey, sanitizeWorkingHoursSchedule } from '../shared/working-hours'
import type {
  AddManualCustomTaskInput,
  AppSettings,
  AppSnapshot,
  BuildWorklogDraftInput,
  CreatePlanningEventInput,
  DeletePlanningEventInput,
  SearchIssuesInput,
  SetWeeklyWorkingHoursInput,
  SetCalendarClassificationInput,
  StartTaskInput,
  TaskSession,
  UpdatePlanningEventInput,
  WorklogDraft
} from '../shared/types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

const stateStore = new StateStore()
const jiraClient = new JiraClient()
const outlookClient = new OutlookClient()

const STATE_CHANGED_CHANNEL = 'state:changed'
const DEFAULT_OFF_TASK_SUBJECT = 'Off-task block'
const JIRA_ISSUE_KEY_REGEX = /^[A-Z][A-Z0-9]+-\d+$/

const sanitizePlannedMinutes = (value: number | null | undefined): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const rounded = Math.floor(value)
  return rounded > 0 ? rounded : undefined
}

const isOffTaskSource = (source: string | undefined): boolean =>
  source === 'off-task' || source === 'planning'

const inferTaskType = (issueKey: string): 'jira' | 'custom' =>
  JIRA_ISSUE_KEY_REGEX.test(issueKey.trim().toUpperCase()) ? 'jira' : 'custom'

const getActiveSession = (): TaskSession | undefined => {
  const state = stateStore.get()
  return state.sessions.find((item) => item.id === state.activeSessionId)
}

const getSnapshot = (): AppSnapshot => {
  const state = stateStore.get()
  return {
    state,
    activeSession: state.sessions.find((item) => item.id === state.activeSessionId)
  }
}

const settingsReady = (settings: AppSettings): boolean => {
  return Boolean(settings.jiraBaseUrl && settings.jiraEmail && settings.jiraApiToken)
}

const withStateUpdate = (updater: () => void): AppSnapshot => {
  updater()
  stateStore.save(stateStore.get())
  const snapshot = getSnapshot()
  mainWindow?.webContents.send(STATE_CHANGED_CHANNEL, snapshot)
  refreshTray()
  return snapshot
}

const findRecentIssueDetails = (
  issueKey: string
): { summary: string; bookingCode?: string; taskType?: 'jira' | 'custom' } => {
  const state = stateStore.get()
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

const startSession = (input: StartTaskInput): AppSnapshot => {
  return withStateUpdate(() => {
    const state = stateStore.get()
    const now = new Date().toISOString()

    if (state.activeSessionId) {
      const active = state.sessions.find((item) => item.id === state.activeSessionId)
      if (active && !active.endIso) {
        active.endIso = now
      }
    }

    const nextSession: TaskSession = {
      id: crypto.randomUUID(),
      jiraIssueKey: input.issueKey,
      jiraIssueSummary: input.summary,
      bookingCode: input.bookingCode,
      taskType: input.taskType ?? inferTaskType(input.issueKey),
      startIso: now
    }
    state.sessions.push(nextSession)
    state.activeSessionId = nextSession.id

    if ((input.taskType ?? inferTaskType(input.issueKey)) === 'jira') {
      state.recentIssueKeys = [
        input.issueKey,
        ...state.recentIssueKeys.filter((item) => item !== input.issueKey)
      ].slice(0, 8)
    }
  })
}

const stopActiveSession = (): AppSnapshot => {
  return withStateUpdate(() => {
    const state = stateStore.get()
    if (!state.activeSessionId) return

    const active = state.sessions.find((item) => item.id === state.activeSessionId)
    if (active && !active.endIso) {
      active.endIso = new Date().toISOString()
    }
    state.activeSessionId = undefined
  })
}

const getRollingWindow = (includeHistoric: boolean): { startIso: string; endIso: string } => {
  const now = new Date()
  const start = new Date(now)
  if (includeHistoric) {
    start.setDate(start.getDate() - 90)
  }
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setDate(end.getDate() + 30)
  end.setHours(23, 59, 59, 999)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

const performCalendarPull = async (
  full: boolean,
  includeHistoric = false
): Promise<AppSnapshot> => {
  const { startIso, endIso } = getRollingWindow(includeHistoric)
  const state = stateStore.get()
  const modifiedSinceIso = full ? undefined : (state.calendarLastPulledIso ?? undefined)

  const incoming = await outlookClient.getCalendarEvents({ startIso, endIso, modifiedSinceIso })
  const pulledAt = new Date().toISOString()

  return withStateUpdate(() => {
    const s = stateStore.get()
    // Off-task events are user-created and must never be touched by an Outlook pull.
    const offTaskEvents = s.calendarEvents.filter((e) => isOffTaskSource(e.source))

    if (full) {
      // Replace all imported/legacy Outlook events with the fresh batch; keep off-task events.
      s.calendarEvents = [...offTaskEvents, ...incoming]
    } else {
      // Upsert: apply changed/new events, keep everything else.
      // Use age-based pruning only — window-based pruning was discarding valid cached history.
      const MAX_HISTORY_MS = 120 * 24 * 60 * 60 * 1000
      const cutoff = Date.now() - MAX_HISTORY_MS
      const incomingIds = new Set(incoming.map((e) => e.id))
      const kept = s.calendarEvents.filter(
        (e) =>
          !isOffTaskSource(e.source) &&
          !incomingIds.has(e.id) &&
          new Date(e.startIso).getTime() >= cutoff
      )
      s.calendarEvents = [...offTaskEvents, ...kept, ...incoming]
    }
    s.calendarLastPulledIso = pulledAt
  })
}

const ensureJiraSettings = (): AppSettings => {
  const settings = stateStore.get().settings
  if (!settingsReady(settings)) {
    throw new Error('Please configure Jira base URL, email, and API token first.')
  }

  return settings
}

const refreshTray = (): void => {
  if (!tray) return

  const snapshot = getSnapshot()
  const active = snapshot.activeSession
  const state = snapshot.state
  const title = active
    ? `${active.jiraIssueKey} (${Math.floor((Date.now() - new Date(active.startIso).getTime()) / 60000)}m)`
    : 'No active task'
  tray.setToolTip(`TimeCal - ${title}`)

  const quickSwitchItems = state.recentIssueKeys.map((issueKey) => {
    const issue = findRecentIssueDetails(issueKey)
    return {
      label: `${issueKey}: ${issue.summary}`,
      click: (): void => {
        startSession({
          issueKey,
          summary: issue.summary,
          bookingCode: issue.bookingCode,
          taskType: issue.taskType ?? inferTaskType(issueKey)
        })
      }
    }
  })

  const menu = Menu.buildFromTemplate([
    {
      label: active ? `Active: ${active.jiraIssueKey}` : 'Active: none',
      enabled: false
    },
    {
      label: 'Show TimeCal',
      click: () => {
        if (!mainWindow) return
        mainWindow.show()
        mainWindow.focus()
      }
    },
    {
      label: 'Stop current task',
      enabled: Boolean(active),
      click: () => {
        stopActiveSession()
      }
    },
    { type: 'separator' },
    {
      label: 'Quick switch task',
      submenu:
        quickSwitchItems.length > 0
          ? quickSwitchItems
          : [
              {
                label: 'No recent tasks',
                enabled: false
              }
            ]
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(menu)
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow?.hide()
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle('app:getSnapshot', async () => getSnapshot())

  ipcMain.handle('app:saveSettings', async (_, settings: AppSettings) => {
    return withStateUpdate(() => {
      stateStore.get().settings = {
        ...settings,
        workingHours: sanitizeWorkingHoursSchedule(settings.workingHours),
        customTaskCategories: settings.customTaskCategories.map((category, index) => ({
          ...category,
          color: category.color || autoCustomTaskCategoryColor(category.name, index)
        }))
      }
    })
  })

  ipcMain.handle('reports:setWeeklyWorkingHours', async (_, input: SetWeeklyWorkingHoursInput) => {
    return withStateUpdate(() => {
      const state = stateStore.get()
      if (!input.schedule) {
        delete state.weeklyWorkingHoursOverrides[input.weekStartKey]
        return
      }

      state.weeklyWorkingHoursOverrides[input.weekStartKey] = sanitizeWorkingHoursSchedule(
        input.schedule
      )
    })
  })

  ipcMain.handle('jira:searchIssues', async (_, input: SearchIssuesInput) => {
    const settings = ensureJiraSettings()
    return jiraClient.searchIssues({
      baseUrl: settings.jiraBaseUrl,
      email: settings.jiraEmail,
      apiToken: settings.jiraApiToken,
      bookingCodeField: settings.jiraBookingCodeField,
      query: input.query,
      maxResults: input.maxResults ?? 20
    })
  })

  ipcMain.handle('task:start', async (_, input: StartTaskInput) => startSession(input))

  ipcMain.handle('task:switch', async (_, input: StartTaskInput) => startSession(input))

  ipcMain.handle('task:stopActive', async () => stopActiveSession())

  ipcMain.handle('calendar:pull', async () => {
    return performCalendarPull(true, true)
  })

  ipcMain.handle('calendar:planning:create', async (_, input: CreatePlanningEventInput) => {
    return withStateUpdate(() => {
      stateStore.get().calendarEvents.push({
        id: crypto.randomUUID(),
        subject: input.subject ?? DEFAULT_OFF_TASK_SUBJECT,
        startIso: input.startIso,
        endIso: input.endIso,
        source: 'off-task',
        plannedMinutes: sanitizePlannedMinutes(input.plannedMinutes)
      })
    })
  })

  ipcMain.handle('calendar:planning:update', async (_, input: UpdatePlanningEventInput) => {
    return withStateUpdate(() => {
      const event = stateStore.get().calendarEvents.find((e) => e.id === input.id)
      if (event) {
        event.startIso = input.startIso
        event.endIso = input.endIso
        if (input.subject !== undefined) event.subject = input.subject
        if (input.plannedMinutes !== undefined) {
          event.plannedMinutes = sanitizePlannedMinutes(input.plannedMinutes)
        }
      }
    })
  })

  ipcMain.handle('calendar:planning:delete', async (_, input: DeletePlanningEventInput) => {
    return withStateUpdate(() => {
      const s = stateStore.get()
      s.calendarEvents = s.calendarEvents.filter((e) => e.id !== input.id)
      s.calendarLinks = s.calendarLinks.filter((l) => l.eventId !== input.id)
    })
  })

  ipcMain.handle('calendar:classify', async (_, input: SetCalendarClassificationInput) => {
    return withStateUpdate(() => {
      const state = stateStore.get()
      const calendarEvent = state.calendarEvents.find((item) => item.id === input.eventId)
      const existing = state.calendarLinks.find((item) => item.eventId === input.eventId)
      const nextCustomTaskCategory =
        input.classification === 'custom-task' ? input.customTaskCategory : undefined

      if (calendarEvent && isOffTaskSource(calendarEvent.source)) {
        // Off-task blocks must never be ignored from calculations.
        if (input.classification === 'ignored') return
        if (input.classification === 'custom-task' && nextCustomTaskCategory) {
          calendarEvent.subject = nextCustomTaskCategory
        } else if (input.classification !== 'custom-task') {
          calendarEvent.subject = DEFAULT_OFF_TASK_SUBJECT
        }
      }

      if (existing) {
        existing.classification = input.classification
        existing.otherTicketKey = input.otherTicketKey
        existing.customTaskCategory = nextCustomTaskCategory
      } else {
        state.calendarLinks.push({
          eventId: input.eventId,
          classification: input.classification,
          otherTicketKey: input.otherTicketKey,
          customTaskCategory: nextCustomTaskCategory
        })
      }
    })
  })

  ipcMain.handle('customTask:addManual', async (_, input: AddManualCustomTaskInput) => {
    return withStateUpdate(() => {
      stateStore.get().manualCustomTaskEntries.push({
        id: crypto.randomUUID(),
        date: input.date,
        minutes: input.minutes,
        category: input.category,
        notes: input.notes
      })
    })
  })

  // Backward-compatible IPC alias for older renderer builds.
  ipcMain.handle('offTask:addManual', async (_, input: AddManualCustomTaskInput) => {
    return withStateUpdate(() => {
      stateStore.get().manualCustomTaskEntries.push({
        id: crypto.randomUUID(),
        date: input.date,
        minutes: input.minutes,
        category: input.category,
        notes: input.notes
      })
    })
  })

  ipcMain.handle('worklog:buildDraft', async (_, input?: BuildWorklogDraftInput): Promise<WorklogDraft> => {
    const snapshot = getSnapshot()
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
      ? snapshot.state.weeklyWorkingHoursOverrides[request.weekStartKey] ??
        snapshot.state.settings.workingHours
      : snapshot.state.weeklyWorkingHoursOverrides[getWeekStartKey(new Date(session.startIso))] ??
        snapshot.state.settings.workingHours

    return buildWorklogDraft({
      session,
      nowIso: new Date().toISOString(),
      calendarEvents: snapshot.state.calendarEvents,
      calendarLinks: snapshot.state.calendarLinks,
      workingHours,
      rangeStartIso: request.rangeStartIso,
      rangeEndIso: request.rangeEndIso
    })
  })

  ipcMain.handle('worklog:push', async (_, draft: WorklogDraft) => {
    const settings = ensureJiraSettings()
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

    return true
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  stateStore.load()

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  createWindow()

  // Pull Outlook calendar on startup (incremental with history) and every 15 minutes thereafter.
  // Using incremental on startup preserves the existing cache: events already fetched in previous
  // sessions are kept and only new/modified events are merged in.  If there is no prior
  // calendarLastPulledIso the incremental path fetches all events in the window (same net effect
  // as a full pull but without discarding the cache first).
  // Errors are logged but do not crash the app.
  performCalendarPull(false, true).catch((err) =>
    console.error('Initial calendar pull failed:', err)
  )
  setInterval(
    () =>
      performCalendarPull(false).catch((err) =>
        console.error('Scheduled calendar pull failed:', err)
      ),
    15 * 60 * 1000
  )

  tray = new Tray(icon)
  tray.on('double-click', () => {
    if (!mainWindow) return
    mainWindow.show()
    mainWindow.focus()
  })
  refreshTray()

  setInterval(() => {
    if (getActiveSession()) {
      mainWindow?.webContents.send(STATE_CHANGED_CHANNEL, getSnapshot())
      refreshTray()
    }
  }, 30000)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  tray?.destroy()
  tray = null
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
