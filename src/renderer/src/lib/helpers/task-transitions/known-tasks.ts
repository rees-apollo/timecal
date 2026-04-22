import type { CustomTaskCategory, JiraIssue, TaskSession } from '../../../../../shared/types'
import type { KnownTaskMetadata, TransitionDraftRow } from './types'

export const buildKnownTasksByKey = (
  jiraResults: JiraIssue[],
  customTaskCategories: CustomTaskCategory[],
  sessions: TaskSession[]
): Map<string, KnownTaskMetadata> => {
  const map = new Map<string, KnownTaskMetadata>()

  for (const issue of jiraResults) {
    map.set(issue.key, {
      summary: issue.summary,
      bookingCode: issue.bookingCode,
      taskType: 'jira'
    })
  }

  for (const category of customTaskCategories) {
    map.set(category.name, {
      summary: category.name,
      bookingCode: category.bookingCode || undefined,
      taskType: 'custom'
    })
  }

  for (const session of sessions) {
    map.set(session.jiraIssueKey, {
      summary: session.jiraIssueSummary,
      bookingCode: session.bookingCode,
      taskType: session.taskType ?? 'jira'
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
