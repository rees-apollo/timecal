export type TransitionDraftRow = {
  id: string
  startLocal: string
  issueKey: string
  summary: string
  bookingCode: string
  taskType: 'jira' | 'custom'
}

export type KnownTaskMetadata = {
  summary: string
  bookingCode?: string
  taskType: 'jira' | 'custom'
}
