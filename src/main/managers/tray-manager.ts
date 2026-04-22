import { Menu, Tray } from 'electron'
import type { AppSnapshot, StartTaskInput, TaskSession } from '../../shared/types'

interface TrayIssueDetails {
  summary: string
  bookingCode?: string
  taskType?: 'jira' | 'custom'
}

interface BuildTrayMenuInput {
  activeSession?: TaskSession
  recentIssueKeys: string[]
  lookupIssue: (issueKey: string) => TrayIssueDetails
  onShow: () => void
  onStop: () => void
  onQuickSwitch: (input: {
    issueKey: string
    summary: string
    bookingCode?: string
    taskType?: 'jira' | 'custom'
  }) => void
  onQuit: () => void
}

const buildTrayTooltip = (activeSession?: TaskSession): string => {
  const title = activeSession
    ? `${activeSession.jiraIssueKey} (${Math.floor((Date.now() - new Date(activeSession.startIso).getTime()) / 60000)}m)`
    : 'No active task'
  return `TimeCal - ${title}`
}

const buildTrayMenu = (input: BuildTrayMenuInput): Menu => {
  const quickSwitchItems = input.recentIssueKeys.map((issueKey) => {
    const issue = input.lookupIssue(issueKey)
    return {
      label: `${issueKey}: ${issue.summary}`,
      click: (): void => {
        input.onQuickSwitch({
          issueKey,
          summary: issue.summary,
          bookingCode: issue.bookingCode,
          taskType: issue.taskType
        })
      }
    }
  })

  return Menu.buildFromTemplate([
    {
      label: input.activeSession ? `Active: ${input.activeSession.jiraIssueKey}` : 'Active: none',
      enabled: false
    },
    {
      label: 'Show TimeCal',
      click: input.onShow
    },
    {
      label: 'Stop current task',
      enabled: Boolean(input.activeSession),
      click: input.onStop
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
      click: input.onQuit
    }
  ])
}

interface TrayManagerOptions {
  icon: string
  getSnapshot: () => AppSnapshot
  getRecentIssueDetails: (issueKey: string) => {
    summary: string
    bookingCode?: string
    taskType?: 'jira' | 'custom'
  }
  startSession: (input: StartTaskInput) => void
  stopActiveSession: () => void
  showMainWindow: () => void
  quitApp: () => void
}

export class TrayManager {
  private readonly options: TrayManagerOptions

  private tray: Tray | null = null

  constructor(options: TrayManagerOptions) {
    this.options = options
  }

  create(): void {
    if (this.tray) return

    this.tray = new Tray(this.options.icon)
    this.tray.on('double-click', () => {
      this.options.showMainWindow()
    })
    this.refresh()
  }

  refresh(): void {
    if (!this.tray) return

    const snapshot = this.options.getSnapshot()
    this.tray.setToolTip(buildTrayTooltip(snapshot.activeSession))
    this.tray.setContextMenu(
      buildTrayMenu({
        activeSession: snapshot.activeSession,
        recentIssueKeys: snapshot.state.recentIssueKeys,
        lookupIssue: (issueKey) => this.options.getRecentIssueDetails(issueKey),
        onShow: this.options.showMainWindow,
        onStop: this.options.stopActiveSession,
        onQuickSwitch: (input) => {
          this.options.startSession(input)
        },
        onQuit: this.options.quitApp
      })
    )
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
