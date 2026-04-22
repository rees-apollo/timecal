import type { AppSettings, WorkingHoursSchedule } from '../../../../shared/types'
import { autoCustomTaskCategoryColor } from '../../../../shared/off-task-colors'

export const SETTINGS_WEEKDAYS: Array<{ key: keyof AppSettings['workingHours']; label: string }> = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' }
]

export const addCustomTaskCategory = (settings: AppSettings): AppSettings => {
  const index = settings.customTaskCategories.length
  return {
    ...settings,
    customTaskCategories: [
      ...settings.customTaskCategories,
      { name: '', bookingCode: '', color: autoCustomTaskCategoryColor('', index) }
    ]
  }
}

export const removeCustomTaskCategoryAt = (settings: AppSettings, index: number): AppSettings => ({
  ...settings,
  customTaskCategories: settings.customTaskCategories.filter((_, i) => i !== index)
})

export const updateWorkingDayLunchDuration = (
  settings: AppSettings,
  dayKey: keyof WorkingHoursSchedule,
  rawValue: string
): AppSettings => {
  const parsed = Number.parseInt(rawValue, 10)
  const lunchDurationMins =
    rawValue.trim() === '' || Number.isNaN(parsed)
      ? undefined
      : Math.max(0, Math.min(240, Math.round(parsed)))

  return {
    ...settings,
    workingHours: {
      ...settings.workingHours,
      [dayKey]: {
        ...settings.workingHours[dayKey],
        lunchDurationMins
      }
    }
  }
}
