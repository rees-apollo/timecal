import { toLocalDateKey } from './working-hours'

export const getCurrentWeekStart = (now = new Date()): Date => {
  const start = new Date(now)
  const day = start.getDay()
  const diff = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  return start
}

export const getWeekDays = (start: Date): Date[] => {
  const days: Date[] = []
  for (let index = 0; index < 7; index += 1) {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    day.setHours(0, 0, 0, 0)
    days.push(day)
  }
  return days
}

export const getWeekRangeLabel = (start: Date, endExclusive: Date): string => {
  const endInclusive = new Date(endExclusive)
  endInclusive.setDate(endInclusive.getDate() - 1)

  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endLabel = endInclusive.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  return `${startLabel} - ${endLabel}`
}

export const getWeekStartKeyForOffset = (offset: number): string => {
  const start = getCurrentWeekStart()
  start.setDate(start.getDate() + offset * 7)
  return toLocalDateKey(start)
}
