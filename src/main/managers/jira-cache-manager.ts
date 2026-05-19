import { jiraClient } from './api-clients/jira-client'
import type { StateStore } from './state-manager'
import type { AppSnapshot, JiraIssueCacheEntry } from '../../shared/types'

const NORMAL_REFRESH_INTERVAL_MS = 30 * 60 * 1000
const INCOMPLETE_REFRESH_INTERVAL_MS = 2 * 60 * 1000

const isRealSummary = (summary: string, issueKey: string): boolean =>
  summary.trim().length > 0 && summary !== issueKey

/**
 * Merges an incoming issue fetch result into an existing cache entry.
 * Prefers whichever version has richer data:
 *   - Summary: keep existing if it's real (non-trivial) and incoming isn't
 *   - Booking code: never discard a value once we have one
 */
export const mergeJiraIssueEntry = (
  existing: JiraIssueCacheEntry | undefined,
  incoming: { summary: string; bookingCode?: string },
  issueKey: string
): JiraIssueCacheEntry => {
  const now = new Date().toISOString()

  if (!existing) {
    return { summary: incoming.summary, bookingCode: incoming.bookingCode, lastFetchedIso: now }
  }

  const keepExistingSummary =
    isRealSummary(existing.summary, issueKey) && !isRealSummary(incoming.summary, issueKey)
  const summary = keepExistingSummary ? existing.summary : incoming.summary
  const bookingCode = incoming.bookingCode ?? existing.bookingCode

  return { summary, bookingCode, lastFetchedIso: now }
}

interface JiraCacheManagerOptions {
  stateStore: StateStore
  withStateUpdate: (updater: () => void) => AppSnapshot
}

export class JiraCacheManager {
  private readonly stateStore: StateStore
  private readonly withStateUpdate: (updater: () => void) => AppSnapshot

  constructor(options: JiraCacheManagerOptions) {
    this.stateStore = options.stateStore
    this.withStateUpdate = options.withStateUpdate
  }

  private getSettings() {
    const { settings } = this.stateStore.get()
    if (!settings.jiraBaseUrl || !settings.jiraEmail || !settings.jiraApiToken) return null
    return settings
  }

  /**
   * Upserts entries from already-available data (e.g. search results).
   * Calls withStateUpdate internally — do NOT call from inside another withStateUpdate.
   */
  upsertEntries(issues: Array<{ key: string; summary: string; bookingCode?: string }>): void {
    if (issues.length === 0) return
    this.withStateUpdate(() => {
      const state = this.stateStore.get()
      for (const issue of issues) {
        const existing = state.jiraIssueCache[issue.key]
        state.jiraIssueCache[issue.key] = mergeJiraIssueEntry(existing, issue, issue.key)
      }
    })
  }

  /** Returns true if the cached entry for a key is missing or lacks real data. */
  isIncomplete(issueKey: string): boolean {
    const state = this.stateStore.get()
    const entry = state.jiraIssueCache[issueKey]
    if (!entry) return true
    if (!isRealSummary(entry.summary, issueKey)) return true
    const bookingCodeFieldConfigured = state.settings.jiraBookingCodeField.trim().length > 0
    if (bookingCodeFieldConfigured && entry.bookingCode === undefined) return true
    return false
  }

  /**
   * Returns the union of recentIssueKeys and all keys already in the cache.
   * recentIssueKeys is capped at 8, but the cache may hold more from older sessions
   * and search results — all of them need periodic data verification.
   */
  private getAllKnownKeys(): string[] {
    const state = this.stateStore.get()
    return [...new Set([...state.recentIssueKeys, ...Object.keys(state.jiraIssueCache)])]
  }

  /** Fetches fresh data from Jira for the given keys and merges results into the cache. */
  async refreshKeys(issueKeys: string[]): Promise<void> {
    const settings = this.getSettings()
    if (!settings || issueKeys.length === 0) return

    const fetched: Array<{ key: string; details: { summary: string; bookingCode?: string } }> = []

    for (const key of issueKeys) {
      try {
        const details = await jiraClient.fetchIssueDetails({
          baseUrl: settings.jiraBaseUrl,
          email: settings.jiraEmail,
          apiToken: settings.jiraApiToken,
          issueKey: key,
          bookingCodeField: settings.jiraBookingCodeField
        })
        if (details) {
          fetched.push({ key, details })
        }
      } catch (err) {
        console.error(`[JiraCacheManager] Failed to refresh ${key}:`, err)
      }
    }

    if (fetched.length > 0) {
      this.withStateUpdate(() => {
        const state = this.stateStore.get()
        for (const { key, details } of fetched) {
          const existing = state.jiraIssueCache[key]
          state.jiraIssueCache[key] = mergeJiraIssueEntry(existing, details, key)
        }
      })
    }
  }

  /**
   * Sets up two recurring refresh loops:
   *  - Every 30 minutes: re-fetch all known issue keys (recentIssueKeys + all cache entries)
   *    to verify booking codes and summaries are still current in Jira.
   *  - Every 2 minutes: aggressively re-fetch any known keys with incomplete cached data.
   * Also runs an immediate pass on startup for incomplete entries.
   */
  scheduleRefresh(): void {
    setImmediate(() => {
      const incompleteKeys = this.getAllKnownKeys().filter((k) => this.isIncomplete(k))
      if (incompleteKeys.length > 0) {
        this.refreshKeys(incompleteKeys).catch((err) =>
          console.error('[JiraCacheManager] Startup incomplete-entry refresh failed:', err)
        )
      }
    })

    setInterval(() => {
      const allKeys = this.getAllKnownKeys()
      if (allKeys.length > 0) {
        this.refreshKeys(allKeys).catch((err) =>
          console.error('[JiraCacheManager] Periodic refresh failed:', err)
        )
      }
    }, NORMAL_REFRESH_INTERVAL_MS)

    setInterval(() => {
      const incompleteKeys = this.getAllKnownKeys().filter((k) => this.isIncomplete(k))
      if (incompleteKeys.length > 0) {
        this.refreshKeys(incompleteKeys).catch((err) =>
          console.error('[JiraCacheManager] Incomplete-entry refresh failed:', err)
        )
      }
    }, INCOMPLETE_REFRESH_INTERVAL_MS)
  }
}
