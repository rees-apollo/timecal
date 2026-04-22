import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { setupAutoUpdates } from './managers/update-manager'
import { StateStore } from './managers/state-manager'
import { EventManager } from './managers/event-manager'
import { SettingsManager } from './managers/settings-manager'
import { TaskManager } from './managers/task-manager'
import { WorklogManager } from './managers/worklog-manager'
import { TrayManager } from './managers/tray-manager'
import type { AppSnapshot } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

const stateStore = new StateStore()
let trayManager: TrayManager | null = null

const STATE_CHANGED_CHANNEL = 'state:changed'
const getSnapshot = (): AppSnapshot => {
  const state = stateStore.get()
  return {
    state,
    activeSession: state.sessions.find((item) => item.id === state.activeSessionId)
  }
}

const withStateUpdate = (updater: () => void): AppSnapshot => {
  updater()
  stateStore.save(stateStore.get())
  const snapshot = getSnapshot()
  mainWindow?.webContents.send(STATE_CHANGED_CHANNEL, snapshot)
  trayManager?.refresh()
  return snapshot
}

const settingsManager = new SettingsManager({
  stateStore,
  withStateUpdate
})

const taskManager = new TaskManager({
  stateStore,
  withStateUpdate
})

const eventManager = new EventManager({
  stateStore,
  withStateUpdate
})

const worklogManager = new WorklogManager({
  stateStore,
  withStateUpdate,
  getRequiredJiraSettings: () => settingsManager.getRequiredJiraSettings()
})

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  console.log('BrowserWindow created')

  mainWindow.on('ready-to-show', () => {
    console.log('BrowserWindow ready to show')
    mainWindow?.show()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('BrowserWindow did-finish-load fallback show')
    if (!mainWindow?.isVisible()) mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    console.log('Loading renderer from URL:', process.env['ELECTRON_RENDERER_URL'])
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  console.log('APP READY - Initialising Classes')
  stateStore.load()

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.timecal.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('app:getSnapshot', async () => getSnapshot())
  settingsManager.registerIpcHandlers(ipcMain)
  taskManager.registerIpcHandlers(ipcMain)
  eventManager.registerIpcHandlers(ipcMain)
  worklogManager.registerIpcHandlers(ipcMain)
  console.log('APP READY - Creating Window')
  createWindow()
  console.log('APP READY - Window Created, Setting up Auto Updates')
  setupAutoUpdates(app)

  // On startup, show cached calendar data immediately from stateStore.load(), then run a
  // one-time full refresh in the background to reconcile everything without blocking launch.
  // Errors are logged but do not crash the app.
  setImmediate(() => {
    eventManager
      .performCalendarPull(true, true)
      .catch((err) => console.error('Initial background full calendar pull failed:', err))
  })

  // Continue with periodic incremental refreshes during runtime.
  setInterval(
    () =>
      eventManager
        .performCalendarPull(false)
        .catch((err) => console.error('Scheduled calendar pull failed:', err)),
    15 * 60 * 1000
  )
  console.log(
    "SETTING UP TRAY MANAGER WITH SNAPSHOT AND TASK MANAGER'S getRecentIssueDetails, startSession, stopActiveSession METHODS, AND APP QUIT/SHOW BEHAVIOURS"
  )
  trayManager = new TrayManager({
    icon,
    getSnapshot: () => getSnapshot(),
    getRecentIssueDetails: (issueKey) => taskManager.getRecentIssueDetails(issueKey),
    startSession: (input) => {
      taskManager.startSession(input)
    },
    stopActiveSession: () => {
      taskManager.stopActiveSession()
    },
    showMainWindow: () => {
      if (!mainWindow) return
      mainWindow.show()
      mainWindow.focus()
    },
    quitApp: () => {
      isQuitting = true
      app.quit()
    }
  })
  trayManager.create()
  console.log('APP READY - Tray Manager Set Up')
  setInterval(() => {
    if (taskManager.getActiveSession()) {
      mainWindow?.webContents.send(STATE_CHANGED_CHANNEL, getSnapshot())
      trayManager?.refresh()
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
  trayManager?.destroy()
  trayManager = null
})
