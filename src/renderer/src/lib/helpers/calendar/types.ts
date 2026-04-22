export type AnchorRect = {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export type ScheduleXCalendarPalette = {
  colorName: string
  lightColors: {
    main: string
    container: string
    onContainer: string
  }
  darkColors: {
    main: string
    container: string
    onContainer: string
  }
}

export type ScheduleXEventSource = 'imported' | 'planning' | 'off-task' | 'active-task' | undefined

export type CustomTaskCategoryLike = {
  name: string
  color: string
}
