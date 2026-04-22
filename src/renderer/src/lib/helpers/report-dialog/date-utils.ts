import { getLocalTimeZone, parseDate, today, type DateValue } from '@internationalized/date'

export const formatDayKeyFromDateValue = (value: DateValue): string =>
  `${value.year.toString().padStart(4, '0')}-${value.month.toString().padStart(2, '0')}-${value.day.toString().padStart(2, '0')}`

export const parseDayKeyOrToday = (value: string): DateValue => {
  try {
    return parseDate(value)
  } catch {
    return today(getLocalTimeZone())
  }
}

export const formatDayLabel = (value: string): string => {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}
