import type { AppSettings, CustomTaskCategory, WorkingHoursSchedule } from './types'

export const DEFAULT_CUSTOM_TASK_CATEGORIES: CustomTaskCategory[] = []

export const DEFAULT_WORKING_HOURS: WorkingHoursSchedule = {
  monday: { start: '09:00', end: '17:00' },
  tuesday: { start: '09:00', end: '17:00' },
  wednesday: { start: '09:00', end: '17:00' },
  thursday: { start: '09:00', end: '17:00' },
  friday: { start: '09:00', end: '17:00' },
  saturday: { start: '00:00', end: '00:00' },
  sunday: { start: '00:00', end: '00:00' }
}

export const DEFAULT_SETTINGS: AppSettings = {
  jiraBaseUrl: '',
  jiraEmail: '',
  jiraApiToken: '',
  jiraBookingCodeField: 'customfield_10001',
  customTaskCategories: DEFAULT_CUSTOM_TASK_CATEGORIES,
  workingHours: DEFAULT_WORKING_HOURS
}
