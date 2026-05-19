import type {
  CustomTaskCategory,
  JiraIssue,
  JiraIssueCacheEntry,
  TaskSession
} from '../../../../../shared/types'
import type { KnownTaskMetadata, TransitionDraftRow } from './types'

export const buildKnownTasksByKey = (
  jiraResults: JiraIssue[],
  customTaskCategories: CustomTaskCategory[],
  sessions: TaskSession[],
  jiraIssueCache?: Record<string, JiraIssueCacheEntry>
): Map<string, KnownTaskMetadata> => {
  const map = new Map<string, KnownTaskMetadata>()

  // Sessions contribute known keys only — summary/bookingCode come from authoritative sources below
  for (const session of sessions) {
    if (!map.has(session.jiraIssueKey)) {
      map.set(session.jiraIssueKey, { summary: '', bookingCode: undefined, taskType: 'jira' })
    }
  }

  // Cache is the single source of truth for Jira issue metadata
  if (jiraIssueCache) {
    for (const [key, entry] of Object.entries(jiraIssueCache)) {
      const existing = map.get(key)
      if (existing) {
        map.set(key, {
          ...existing,
          summary: entry.summary && entry.summary !== key ? entry.summary : existing.summary,
          bookingCode: entry.bookingCode ?? existing.bookingCode
        })
      }
    }
  }

  for (const category of customTaskCategories) {
    map.set(category.name, {
      summary: category.name,
      bookingCode: category.bookingCode || undefined,
      taskType: 'custom'
    })
  }

  // Live search results take highest priority for Jira keys
  for (const issue of jiraResults) {
    map.set(issue.key, {
      summary: issue.summary,
      bookingCode: issue.bookingCode,
      taskType: 'jira'
    })
  }

  return map
}

export const toKnownTaskOptions = (
  knownTasksByKey: Map<string, KnownTaskMetadata>
): Array<{ key: string; summary: string; taskType: 'jira' | 'custom' }> => {
  const options: Array<{ key: string; summary: string; taskType: 'jira' | 'custom' }> = []
  for (const [key, value] of knownTasksByKey.entries()) {
    options.push({ key, summary: value.summary, taskType: value.taskType })
  }
  return options.sort((a, b) => a.key.localeCompare(b.key))
}

export const applyKnownTaskToRow = (
  row: TransitionDraftRow,
  knownTasksByKey: Map<string, KnownTaskMetadata>,
  nextKey?: string
): Partial<TransitionDraftRow> | null => {
  const key = (nextKey ?? row.issueKey).trim()
  const known = key ? knownTasksByKey.get(key) : undefined
  if (!known) return null

  return {
    summary: row.summary.trim() ? row.summary : known.summary,
    bookingCode: row.bookingCode.trim() ? row.bookingCode : (known.bookingCode ?? ''),
    taskType: known.taskType
  }
}
