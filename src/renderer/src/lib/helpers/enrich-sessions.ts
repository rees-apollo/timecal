import type { JiraIssueCacheEntry, TaskSession } from '../../../../shared/types'

/**
 * Returns a new sessions array where each session's `jiraIssueSummary` and
 * `bookingCode` are overlaid with the latest values from `jiraIssueCache`.
 *
 * This is the single enrichment point for the renderer. Derive it once at the
 * top level and pass the result everywhere — no component needs to reach into
 * the cache directly, and Svelte's reactivity ensures the derived value
 * re-computes automatically whenever the snapshot (and therefore the cache)
 * is updated by a background refresh.
 */
export const enrichSessionsWithCache = (
  sessions: TaskSession[],
  jiraIssueCache: Record<string, JiraIssueCacheEntry>
): TaskSession[] =>
  sessions.map((session) => {
    const cached = jiraIssueCache[session.jiraIssueKey]
    if (!cached) return session

    const summary =
      cached.summary && cached.summary !== session.jiraIssueKey
        ? cached.summary
        : session.jiraIssueSummary
    const bookingCode = cached.bookingCode ?? session.bookingCode

    if (summary === session.jiraIssueSummary && bookingCode === session.bookingCode) {
      return session
    }

    return { ...session, jiraIssueSummary: summary, bookingCode }
  })
