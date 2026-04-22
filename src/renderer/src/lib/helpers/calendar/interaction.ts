import { Temporal } from 'temporal-polyfill'
import { planningWindowFromDate } from './time'

export const getCalendarGridHeight = (containerHeight: number): number =>
  Math.max(200, containerHeight - 150)

export const resolvePlanningWindowFromCalendarClick = (
  target: HTMLElement | null
): { startIso: string; endIso: string } | null => {
  if (!target) return null

  if (target.closest('[data-event-id], .sx__event, .sx__date-grid-event, .sx__time-grid-event')) {
    return null
  }

  const weekDateEl = target.closest('.sx__week-grid__date') as HTMLElement | null
  if (weekDateEl?.dataset.date) {
    try {
      const date = Temporal.PlainDate.from(weekDateEl.dataset.date)
      return planningWindowFromDate(date)
    } catch {
      return null
    }
  }

  const emptyDateGridCell = target.closest('.sx__date-grid-cell, .sx__spacer') as HTMLElement | null
  if (!emptyDateGridCell) return null

  const dateGridEl = target.closest('[data-date-grid-date]') as HTMLElement | null
  const dateGridDate = dateGridEl?.dataset.dateGridDate
  if (!dateGridDate) return null

  try {
    const date = Temporal.PlainDate.from(dateGridDate)
    return planningWindowFromDate(date)
  } catch {
    return null
  }
}
