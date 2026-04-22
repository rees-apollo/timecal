import type { CalendarEvent, CalendarEventClassification } from '../../../../shared/types'

export type AnchorRect = {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

export const classificationBadgeVariant = (classification: string): BadgeVariant => {
  if (classification === 'primary-task') return 'default'
  if (classification === 'custom-task') return 'destructive'
  if (classification === 'other-ticket') return 'secondary'
  if (classification === 'ignored') return 'secondary'
  return 'outline'
}

export const toTaskSearchTab = (classification: CalendarEventClassification): 'jira' | 'custom' =>
  classification === 'custom-task' ? 'custom' : 'jira'

export const isOffTaskBlockEvent = (event: CalendarEvent | undefined): boolean =>
  event?.source === 'off-task' || event?.source === 'planning'

export const parseOffTaskHoursInputMinutes = (input: string): number | undefined => {
  const value = String(input).trim()
  if (!value) return undefined
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(1, Math.round(parsed * 60))
}

export const getPopupPosition = (
  anchorRect: AnchorRect,
  viewportWidth: number,
  viewportHeight: number
): { top: number; left: number; transformOrigin: string } => {
  const popupWidth = 360
  const popupHeight = 420
  const spacing = 10
  const maxLeft = Math.max(spacing, viewportWidth - popupWidth - spacing)
  const maxTop = Math.max(spacing, viewportHeight - popupHeight - spacing)

  const preferredRight = anchorRect.right + spacing
  const canShowRight = preferredRight <= maxLeft
  const left = canShowRight
    ? preferredRight
    : Math.min(maxLeft, Math.max(spacing, anchorRect.left - popupWidth - spacing))
  const top = Math.min(maxTop, Math.max(spacing, anchorRect.top))

  return {
    top,
    left,
    transformOrigin: canShowRight ? 'left top' : 'right top'
  }
}
