import type { TaskType } from './types'

export const JIRA_ISSUE_KEY_REGEX = /^[A-Z][A-Z0-9]+-\d+$/

export const inferTaskType = (issueKey: string): TaskType =>
  JIRA_ISSUE_KEY_REGEX.test(issueKey.trim().toUpperCase()) ? 'jira' : 'custom'

export const isJiraIssueKey = (issueKey: string): boolean =>
  JIRA_ISSUE_KEY_REGEX.test(issueKey.trim().toUpperCase())
