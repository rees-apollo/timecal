import type { JiraIssue, PushWorklogInput } from '../shared/types'

interface JiraIssuePickerResponse {
  sections?: Array<{
    issues?: Array<{
      id?: number | string
      key?: string
      summaryText?: string
      summary?: string
    }>
  }>
}

interface JiraIssueDetailsResponse {
  fields?: Record<string, unknown>
}

const ensureBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, '')

const jiraAuthHeader = (email: string, token: string): string => {
  const value = Buffer.from(`${email}:${token}`).toString('base64')
  return `Basic ${value}`
}

const stringifyUnknown = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return undefined
}

export class JiraClient {
  async searchIssues(input: {
    baseUrl: string
    email: string
    apiToken: string
    bookingCodeField: string
    query: string
    maxResults: number
  }): Promise<JiraIssue[]> {
    const trimmedQuery = input.query.trim()
    if (!trimmedQuery) return []

    const params = new URLSearchParams({ query: trimmedQuery })
    const url = `${ensureBaseUrl(input.baseUrl)}/rest/api/3/issue/picker?${params.toString()}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: jiraAuthHeader(input.email, input.apiToken)
      }
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Jira issue picker failed (${response.status}): ${text}`)
    }

    const data = (await response.json()) as JiraIssuePickerResponse
    const suggestions = (data.sections ?? [])
      .flatMap((section) => section.issues ?? [])
      .filter(
        (
          issue
        ): issue is { id?: number | string; key: string; summaryText?: string; summary?: string } =>
          typeof issue?.key === 'string' && issue.key.length > 0
      )

    const seenKeys = new Set<string>()
    const deduped = suggestions.filter((issue) => {
      const key = issue.key
      if (seenKeys.has(key)) return false
      seenKeys.add(key)
      return true
    })

    const limited = deduped.slice(0, Math.max(1, input.maxResults))

    return Promise.all(
      limited.map(async (issue) => {
        const summary =
          stringifyUnknown(issue.summaryText) ?? stringifyUnknown(issue.summary) ?? '(No summary)'

        const bookingCode = await this.fetchBookingCode({
          baseUrl: input.baseUrl,
          email: input.email,
          apiToken: input.apiToken,
          issueKey: issue.key,
          bookingCodeField: input.bookingCodeField
        })

        return {
          id: issue.id !== undefined ? String(issue.id) : issue.key,
          key: issue.key,
          summary,
          bookingCode
        }
      })
    )
  }

  private async fetchBookingCode(input: {
    baseUrl: string
    email: string
    apiToken: string
    issueKey: string
    bookingCodeField: string
  }): Promise<string | undefined> {
    const field = input.bookingCodeField.trim()
    if (!field) return undefined

    const params = new URLSearchParams({ fields: field })
    const url = `${ensureBaseUrl(input.baseUrl)}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}?${params.toString()}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: jiraAuthHeader(input.email, input.apiToken)
      }
    })

    if (!response.ok) return undefined

    const data = (await response.json()) as JiraIssueDetailsResponse
    return stringifyUnknown(data.fields?.[field])
  }

  async pushWorklog(input: {
    baseUrl: string
    email: string
    apiToken: string
    worklog: PushWorklogInput
  }): Promise<void> {
    const url = `${ensureBaseUrl(input.baseUrl)}/rest/api/3/issue/${encodeURIComponent(input.worklog.issueKey)}/worklog`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: jiraAuthHeader(input.email, input.apiToken)
      },
      body: JSON.stringify({
        started: input.worklog.startedIso,
        timeSpentSeconds: input.worklog.timeSpentSeconds,
        comment: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: input.worklog.comment }]
            }
          ]
        }
      })
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Jira worklog push failed (${response.status}): ${text}`)
    }
  }
}
