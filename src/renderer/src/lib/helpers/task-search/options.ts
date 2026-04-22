import type { CustomTaskCategory, JiraIssue, TaskSession } from '../../../../../shared/types'

type SessionTaskType = 'jira' | 'custom'

const normalize = (value: string): string => value.trim().toLowerCase()

const categoryNameSet = (customTaskCategories: CustomTaskCategory[]): Set<string> =>
  new Set(customTaskCategories.map((item) => item.name))

const isCustomCategoryName = (key: string, customCategoryNames: Set<string>): boolean =>
  customCategoryNames.has(key)

const sessionTaskType = (session: TaskSession, customCategoryNames: Set<string>): SessionTaskType =>
  session.taskType ??
  (isCustomCategoryName(session.jiraIssueKey, customCategoryNames) ? 'custom' : 'jira')

export const getTicketSummaryByKey = (input: {
  key: string
  jiraResults: JiraIssue[]
  sessions: TaskSession[]
  customTaskCategories: CustomTaskCategory[]
}): string | undefined => {
  const { key, jiraResults, sessions, customTaskCategories } = input
  const issue = jiraResults.find((item) => item.key === key)
  if (issue) return issue.summary

  const customCategoryNames = categoryNameSet(customTaskCategories)
  const recentJiraSession = [...sessions]
    .reverse()
    .find(
      (session) =>
        sessionTaskType(session, customCategoryNames) === 'jira' && session.jiraIssueKey === key
    )
  return recentJiraSession?.jiraIssueSummary
}

export const getSortedFilteredTicketKeys = (input: {
  jiraQuery: string
  jiraResults: JiraIssue[]
  sessions: TaskSession[]
  recentIssueKeys: string[]
  customTaskCategories: CustomTaskCategory[]
  primaryIssueKey: string
  currentKey: string
}): string[] => {
  const {
    jiraQuery,
    jiraResults,
    sessions,
    recentIssueKeys,
    customTaskCategories,
    primaryIssueKey,
    currentKey
  } = input

  const customCategoryNames = categoryNameSet(customTaskCategories)
  const query = normalize(jiraQuery)

  const orderedKeys = [
    !isCustomCategoryName(primaryIssueKey, customCategoryNames) ? primaryIssueKey : '',
    !isCustomCategoryName(currentKey, customCategoryNames) ? currentKey : '',
    ...jiraResults.map((item) => item.key),
    ...recentIssueKeys.filter((key) => !isCustomCategoryName(key, customCategoryNames)),
    ...[...sessions]
      .reverse()
      .filter((session) => sessionTaskType(session, customCategoryNames) === 'jira')
      .map((session) => session.jiraIssueKey)
  ].filter((key): key is string => Boolean(key))

  const uniqueKeys = [...new Set(orderedKeys)]

  const filteredKeys = uniqueKeys.filter((key) => {
    if (!query) return true
    const summary = getTicketSummaryByKey({
      key,
      jiraResults,
      sessions,
      customTaskCategories
    })
    return normalize(`${key} ${summary ?? ''}`).includes(query)
  })

  return [...filteredKeys].sort((a, b) => {
    if (!currentKey) return 0
    const aIsCurrent = a === currentKey
    const bIsCurrent = b === currentKey
    if (aIsCurrent === bIsCurrent) return 0
    return aIsCurrent ? -1 : 1
  })
}

export const getSortedFilteredCustomTaskCategories = (input: {
  jiraQuery: string
  customTaskCategories: CustomTaskCategory[]
  currentCustomTaskCategory: string
}): CustomTaskCategory[] => {
  const { jiraQuery, customTaskCategories, currentCustomTaskCategory } = input
  const query = normalize(jiraQuery)

  const filteredCategories = customTaskCategories.filter((category) => {
    if (!query) return true
    return normalize(`${category.name} ${category.bookingCode ?? ''}`).includes(query)
  })

  return [...filteredCategories].sort((a, b) => {
    if (!currentCustomTaskCategory) return 0
    const aIsCurrent = a.name === currentCustomTaskCategory
    const bIsCurrent = b.name === currentCustomTaskCategory
    if (aIsCurrent === bIsCurrent) return 0
    return aIsCurrent ? -1 : 1
  })
}
