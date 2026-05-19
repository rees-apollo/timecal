import type { AppSettings, AppSnapshot, JiraIssue } from '../../../../shared/types'
import { DEFAULT_SETTINGS } from '../../../../shared/defaults'
import { enrichSessionsWithCache } from '$lib/helpers/enrich-sessions'

class AppState {
  snapshot = $state<AppSnapshot | null>(null)
  settings = $state<AppSettings>({ ...DEFAULT_SETTINGS })
  jiraResults = $state<JiraIssue[]>([])
  isBusy = $state(false)
  dockSearchState = $state<{ jiraQuery: string; activeTab: 'jira' | 'custom' }>({
    jiraQuery: '',
    activeTab: 'jira'
  })

  enrichedSessions = $derived(
    enrichSessionsWithCache(
      this.snapshot?.state.sessions ?? [],
      this.snapshot?.state.jiraIssueCache ?? {}
    )
  )

  activeIssueKey = $derived(this.snapshot?.activeSession?.jiraIssueKey ?? '')

  activeIssueLabel = $derived.by(() => {
    const key = this.activeIssueKey
    if (!key) return 'No active task'
    const match = this.jiraResults.find((i) => i.key === key)
    if (match) return `${match.key}: ${match.summary}`
    const fromSession = [...this.enrichedSessions].reverse().find((s) => s.jiraIssueKey === key)
    return fromSession ? `${fromSession.jiraIssueKey}: ${fromSession.jiraIssueSummary}` : key
  })
}

export const appState = new AppState()
