import type { WorkingHoursSchedule } from '../../../../../shared/types'
import { getCurrentWeekStart } from '../../../../../shared/report-week'

export const REPORT_WEEKDAYS: Array<{ key: keyof WorkingHoursSchedule; label: string }> = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' }
]

export const getSelectedWeekStart = (weekOffset: number): Date => {
  const start = getCurrentWeekStart()
  start.setDate(start.getDate() + weekOffset * 7)
  return start
}

export const getSelectedWeekEndExclusive = (selectedWeekStart: Date): Date => {
  const end = new Date(selectedWeekStart)
  end.setDate(end.getDate() + 7)
  return end
}
