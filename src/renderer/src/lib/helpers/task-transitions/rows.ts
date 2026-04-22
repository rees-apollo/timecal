import type { TaskSession } from '../../../../../shared/types'
import { formatMinutesAsHoursAndMinutes } from '../duration'
import { toLocalDateTimeInput } from './date-time'
import type { TransitionDraftRow } from './types'

export const toTransitionRows = (items: TaskSession[]): TransitionDraftRow[] => {
  return [...items]
    .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime())
    .map((session) => ({
      id: session.id,
      startLocal: toLocalDateTimeInput(session.startIso),
      issueKey: session.jiraIssueKey,
      summary: session.jiraIssueSummary,
      bookingCode: session.bookingCode ?? '',
      taskType: session.taskType ?? 'jira'
    }))
}

export const buildRowDurationLabels = (
  rows: TransitionDraftRow[],
  calculateWorkingSeconds: (start: Date, end: Date) => number
): Array<string | null> => {
  return rows.map((row, index) => {
    const start = new Date(row.startLocal)
    if (Number.isNaN(start.getTime())) return null

    const next = rows[index + 1]
    if (!next) return 'active'

    const end = new Date(next.startLocal)
    if (Number.isNaN(end.getTime())) return null
    if (end <= start) return null

    const totalMinutes = Math.round(calculateWorkingSeconds(start, end) / 60)
    if (totalMinutes < 0) return null
    return formatMinutesAsHoursAndMinutes(totalMinutes)
  })
}
