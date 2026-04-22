import type { TaskTransitionInput } from '../../../../../shared/types'
import type { TransitionDraftRow } from './types'

export const buildTransitionsFromRows = (
  rows: TransitionDraftRow[]
):
  | { transitions: TaskTransitionInput[]; error?: never }
  | { transitions?: never; error: string } => {
  const transitions: TaskTransitionInput[] = []

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const issueKey = row.issueKey.trim()
    const summary = row.summary.trim() || issueKey
    if (!issueKey) {
      return { error: `Row ${index + 1}: task key is required.` }
    }

    const startDate = new Date(row.startLocal)
    if (Number.isNaN(startDate.getTime())) {
      return { error: `Row ${index + 1}: start time is invalid.` }
    }

    transitions.push({
      id: row.id,
      issueKey,
      summary,
      bookingCode: row.bookingCode.trim() || undefined,
      taskType: row.taskType,
      startIso: startDate.toISOString()
    })
  }

  transitions.sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime())
  for (let index = 1; index < transitions.length; index += 1) {
    if (transitions[index].startIso === transitions[index - 1].startIso) {
      return { error: 'Each transition must have a unique start time.' }
    }
  }

  return { transitions }
}
