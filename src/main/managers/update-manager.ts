import type { App } from 'electron'
import { autoUpdater } from 'electron-updater'

export const setupAutoUpdates = (app: App): void => {
  if (!app.isPackaged) {
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('Auto-updater: checking for updates')
  })

  autoUpdater.on('update-available', (info) => {
    console.log(`Auto-updater: update available (${info.version})`)
  })

  autoUpdater.on('update-not-available', () => {
    console.log('Auto-updater: no update available')
  })

  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error:', error)
  })

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent)
    console.log(`Auto-updater: download ${pct}%`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`Auto-updater: update downloaded (${info.version}), will install on quit`)
  })

  autoUpdater.checkForUpdates().catch((error) => {
    console.error('Auto-updater check failed:', error)
  })

  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch((error) => {
        console.error('Scheduled auto-updater check failed:', error)
      })
    },
    60 * 60 * 1000
  )
}
