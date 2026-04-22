import type { CustomTaskCategoryLike, ScheduleXCalendarPalette } from './types'

const normalizeCategoryName = (value: string | undefined): string =>
  (value ?? '').trim().toLowerCase()

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const normalizeHex = (value: string): string => {
  const match = value.trim().match(/^#([a-fA-F0-9]{6})$/)
  return match ? `#${match[1].toLowerCase()}` : '#64748b'
}

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const normalized = normalizeHex(hex).slice(1)
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  }
}

const getLuminance = (hex: string): number => {
  const { r, g, b } = hexToRgb(hex)
  const toLinear = (channel: number): number => {
    const normalized = channel / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }

  const red = toLinear(r)
  const green = toLinear(g)
  const blue = toLinear(b)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export const toScheduleXPalette = (
  colorName: string,
  colorHex: string
): ScheduleXCalendarPalette => {
  const main = normalizeHex(colorHex)
  const lightOnContainer = getLuminance(main) > 0.45 ? '#1f2937' : '#f8fafc'
  const darkOnContainer = getLuminance(main) > 0.45 ? '#0f172a' : '#f8fafc'

  return {
    colorName,
    lightColors: {
      main,
      container: main,
      onContainer: lightOnContainer
    },
    darkColors: {
      main,
      container: main,
      onContainer: darkOnContainer
    }
  }
}

export const resolveCustomTaskCalendarVisual = (
  customTaskCategories: CustomTaskCategoryLike[],
  customTaskCategoryName: string | undefined
): { calendarId: string; colorHex: string } => {
  const normalized = normalizeCategoryName(customTaskCategoryName)
  const matched = customTaskCategories.find(
    (category) => normalizeCategoryName(category.name) === normalized
  )

  if (matched) {
    return {
      calendarId: `custom-task-${slugify(matched.name) || 'default'}`,
      colorHex: normalizeHex(matched.color)
    }
  }

  return {
    calendarId: 'custom-task-default',
    colorHex: '#d97706'
  }
}

export const buildScheduleXCalendars = (
  customTaskCategories: CustomTaskCategoryLike[]
): Record<string, ScheduleXCalendarPalette> => {
  const calendars: Record<string, ScheduleXCalendarPalette> = {
    'off-task': toScheduleXPalette('off-task', '#4338ca'),
    primary: toScheduleXPalette('primary', '#0f766e'),
    'other-ticket': toScheduleXPalette('other-ticket', '#1d4ed8'),
    imported: toScheduleXPalette('imported', '#64748b'),
    ignored: toScheduleXPalette('ignored', '#94a3b8'),
    'custom-task-default': toScheduleXPalette('custom-task-default', '#d97706')
  }

  for (const category of customTaskCategories) {
    const categoryId = `custom-task-${slugify(category.name) || 'default'}`
    calendars[categoryId] = toScheduleXPalette(categoryId, category.color)
  }

  return calendars
}
