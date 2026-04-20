<script lang="ts">
  import type { CalendarEvent, TaskSession, WorkingHoursSchedule } from '../../../shared/types'
  import { ScheduleXCalendar } from '@schedule-x/svelte'
  import { createCalendar, createViewWeek } from '@schedule-x/calendar'
  import { createDragAndDropPlugin } from '@schedule-x/drag-and-drop'
  import { createResizePlugin } from '@schedule-x/resize'
  import { createEventsServicePlugin } from '@schedule-x/events-service'
  import { Temporal } from 'temporal-polyfill'
  import {
    getCalendarDayBoundaries,
    getWorkingTimeSegments,
    sanitizeWorkingHoursSchedule
  } from '../../../shared/working-hours'
  import { autoCustomTaskCategoryColor } from '../../../shared/off-task-colors'
  import '@schedule-x/theme-shadcn/dist/index.css'
  import { mode } from 'mode-watcher'

  type AnchorRect = {
    top: number
    left: number
    right: number
    bottom: number
    width: number
    height: number
  }

  type ScheduleXEventLike = {
    id: string | number
    start: Temporal.ZonedDateTime | Temporal.PlainDate
    end: Temporal.ZonedDateTime | Temporal.PlainDate
    source?: 'imported' | 'planning' | 'off-task' | 'active-task'
  }

  type CalendarLinkLike = {
    eventId: string
    classification?:
      | 'primary-task'
      | 'other-ticket'
      | 'off-task'
      | 'custom-task'
      | 'ignored'
      | 'unclassified'
    offTaskCategory?: string
    customTaskCategory?: string
  }

  type CustomTaskCategory = {
    name: string
    color: string
  }

  let {
    calendarEvents = [],
    calendarLinks = [],
    customTaskCategories = [],
    sessions = [],
    workingHours,
    getClassification,
    getCustomTaskCategory,
    getEventColor,
    createPlanningEvent,
    updatePlanningEvent,
    onEventClick
  }: {
    calendarEvents?: CalendarEvent[]
    calendarLinks?: CalendarLinkLike[]
    customTaskCategories?: CustomTaskCategory[]
    sessions?: TaskSession[]
    workingHours: WorkingHoursSchedule
    getClassification: (
      eventId: string
    ) => 'primary-task' | 'other-ticket' | 'off-task' | 'custom-task' | 'unclassified'
    getCustomTaskCategory: (eventId: string) => string | undefined
    getEventColor: (eventId: string) => string
    createPlanningEvent: (
      startIso: string,
      endIso: string,
      plannedMinutes?: number
    ) => Promise<void>
    updatePlanningEvent: (
      id: string,
      startIso: string,
      endIso: string,
      plannedMinutes?: number | null
    ) => Promise<void>
    onEventClick: (payload: { id: string; anchorRect: AnchorRect | null }) => void
  } = $props()

  const linkByEventId = $derived(
    new Map(calendarLinks.map((link) => [link.eventId, link] as const))
  )

  const slugify = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

  const normalizeHex = (value: string): string => {
    const match = value.trim().match(/^#([a-fA-F0-9]{6})$/)
    return match ? `#${match[1].toLowerCase()}` : '#64748b'
  }

  const normalizeCategoryName = (value: string | undefined): string =>
    (value ?? '').trim().toLowerCase()

  type EventVisualMeta = {
    eventId: string
    calendarId: string
    colorHex: string
  }

  type ScheduleXCalendarPalette = {
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

  const toScheduleXPalette = (colorName: string, colorHex: string): ScheduleXCalendarPalette => {
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

  const resolveCustomTaskCalendarVisual = (
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
      calendarId: `custom-task-${slugify(customTaskCategoryName || '') || 'default'}`,
      colorHex: '#d97706'
    }
  }

  const resolveAnchorRect = (eventId: string, clickEvent: UIEvent): AnchorRect | null => {
    const target = clickEvent.target as HTMLElement | null
    const clickedElement = target?.closest('[data-event-id]') as HTMLElement | null
    const fallbackElement = document.querySelector(
      `[data-event-id="${eventId}"]`
    ) as HTMLElement | null
    const eventElement = clickedElement ?? fallbackElement

    if (!eventElement) return null

    const rect = eventElement.getBoundingClientRect()
    return {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    }
  }

  const weekView = createViewWeek()
  const calendarTimezone = Temporal.Now.timeZoneId()

  const temporalToIso = (
    value: Temporal.ZonedDateTime | Temporal.PlainDate,
    endOfDay = false
  ): string => {
    if (value instanceof Temporal.ZonedDateTime) {
      return new Date(value.epochMilliseconds).toISOString()
    }

    const timeSuffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
    return new Date(`${value.toString()}${timeSuffix}`).toISOString()
  }

  const planningWindowFromDateTime = (
    dateTime: Temporal.ZonedDateTime
  ): { startIso: string; endIso: string } => {
    const day = dateTime.toPlainDate().toString()
    const start = new Date(`${day}T00:00:00.000Z`)
    const end = new Date(`${day}T23:59:59.999Z`)
    return { startIso: start.toISOString(), endIso: end.toISOString() }
  }

  const planningWindowFromDate = (
    date: Temporal.PlainDate
  ): { startIso: string; endIso: string } => {
    const start = new Date(`${date.toString()}T00:00:00.000Z`)
    const end = new Date(`${date.toString()}T23:59:59.999Z`)
    return { startIso: start.toISOString(), endIso: end.toISOString() }
  }

  const toTemporalDateForPlanning = (
    startIso: string,
    endIso: string
  ): { start: Temporal.PlainDate; end: Temporal.PlainDate } => {
    const startDate = Temporal.PlainDate.from(new Date(startIso).toISOString().slice(0, 10))
    const endDate = Temporal.PlainDate.from(new Date(endIso).toISOString().slice(0, 10))
    return { start: startDate, end: endDate }
  }

  const isDayScopedOffTaskSource = (source: ScheduleXEventLike['source']): boolean =>
    source === 'off-task' || source === 'planning'

  const isDayScopedOffTaskEvent = (event: CalendarEvent): boolean =>
    event.source === 'off-task' || event.source === 'planning'

  type CalendarInstance = {
    calendarApp: ReturnType<typeof createCalendar>
    eventsServicePlugin: ReturnType<typeof createEventsServicePlugin>
  }

  const buildCalendarInstance = (
    gridHeight: number,
    calendars: Record<string, ScheduleXCalendarPalette>,
    dayBoundaries: { start: string; end: string },
    darkMode = false
  ): CalendarInstance => {
    const eventsServicePlugin = createEventsServicePlugin()
    const dragAndDropPlugin = createDragAndDropPlugin(15)
    const resizePlugin = createResizePlugin(15)

    const calendarApp = createCalendar(
      {
        views: [weekView],
        defaultView: weekView.name,
        timezone: calendarTimezone,
        calendars,
        dayBoundaries: {
          start: dayBoundaries.start,
          end: dayBoundaries.end
        },
        isDark: darkMode,
        theme: 'shadcn',
        isResponsive: true,
        weekOptions: {
          gridHeight
        },
        callbacks: {
          onEventClick: (calendarEvent: { id: string | number }, clickEvent: UIEvent): void => {
            const eventId = String(calendarEvent.id)
            onEventClick({ id: eventId, anchorRect: resolveAnchorRect(eventId, clickEvent) })
          },
          onClickDateTime: (dateTime: Temporal.ZonedDateTime): void => {
            const next = planningWindowFromDateTime(dateTime)
            void createPlanningEvent(next.startIso, next.endIso)
          },
          onClickDate: (date: Temporal.PlainDate): void => {
            const next = planningWindowFromDate(date)
            void createPlanningEvent(next.startIso, next.endIso)
          },
          onBeforeEventUpdate: (oldEvent: ScheduleXEventLike): boolean => {
            return (
              String(oldEvent.id).startsWith('plan-') || isDayScopedOffTaskSource(oldEvent.source)
            )
          },
          onEventUpdate: (event: ScheduleXEventLike): void => {
            const id = String(event.id)
            if (!id.startsWith('plan-') && !isDayScopedOffTaskSource(event.source)) return

            const startIso = temporalToIso(event.start)
            const endIso = temporalToIso(event.end, true)
            void updatePlanningEvent(id, startIso, endIso)
          }
        }
      },
      [eventsServicePlugin, dragAndDropPlugin, resizePlugin]
    ) as unknown as ReturnType<typeof createCalendar>

    return { calendarApp, eventsServicePlugin }
  }

  let gridHeight = $state(840)
  let calendarInstance = $state<CalendarInstance | null>(null)

  function toTemporalZonedDateTime(iso: string): Temporal.ZonedDateTime {
    return Temporal.Instant.from(iso).toZonedDateTimeISO(calendarTimezone)
  }

  const scheduleXEvents = $derived(
    calendarEvents.map((event) => {
      const eventId = String(event.id)
      const link = linkByEventId.get(eventId)
      const classification = link?.classification ?? getClassification(eventId)
      const customTaskCategory =
        link?.customTaskCategory ?? link?.offTaskCategory ?? getCustomTaskCategory(eventId)
      const eventType =
        classification === 'primary-task'
          ? 'primary'
          : classification === 'other-ticket'
            ? 'other-ticket'
            : classification === 'off-task' || classification === 'custom-task'
              ? 'custom-task'
              : classification === 'ignored'
                ? 'ignored'
                : isDayScopedOffTaskEvent(event)
                  ? 'off-task'
                  : 'unclassified'
      const colorHex = normalizeHex(getEventColor(eventId))
      const customTaskVisual = resolveCustomTaskCalendarVisual(customTaskCategory)
      const calendarId =
        eventType === 'custom-task'
          ? customTaskVisual.calendarId
          : eventType === 'off-task'
            ? 'off-task'
            : eventType === 'primary'
              ? 'primary'
              : eventType === 'other-ticket'
                ? 'other-ticket'
                : eventType === 'ignored'
                  ? 'ignored'
                  : 'imported'
      const visualMeta: EventVisualMeta = {
        eventId,
        calendarId,
        colorHex: eventType === 'custom-task' ? customTaskVisual.colorHex : colorHex
      }

      const isIgnored = eventType === 'ignored'

      if (isDayScopedOffTaskEvent(event)) {
        const planningWindow = toTemporalDateForPlanning(event.startIso, event.endIso)
        return {
          id: event.id,
          title: event.subject,
          start: planningWindow.start,
          end: planningWindow.end,
          calendarId: visualMeta.calendarId,
          source: 'off-task' as const,
          _options: {
            disableDND: true,
            disableResize: true,
            additionalClasses: isIgnored
              ? ['tc-event', 'tc-off-task-event', 'tc-ignored-event']
              : ['tc-event', 'tc-off-task-event']
          }
        }
      }
      const zonedStart = toTemporalZonedDateTime(event.startIso)
      const zonedEnd = toTemporalZonedDateTime(event.endIso)

      // Detect all-day events: start is exactly local midnight (Outlook whole-day events).
      // Use PlainDate so ScheduleX assigns to the correct local date column rather than
      // the UTC date, which may fall on the previous calendar day for UTC+ timezones.
      const startIsMidnight =
        zonedStart.hour === 0 &&
        zonedStart.minute === 0 &&
        zonedStart.second === 0 &&
        zonedStart.millisecond === 0
      if (startIsMidnight) {
        const startDate = zonedStart.toPlainDate()
        // Outlook all-day end is midnight of next day — subtract 1 day for inclusive end
        const endIsMidnight =
          zonedEnd.hour === 0 &&
          zonedEnd.minute === 0 &&
          zonedEnd.second === 0 &&
          zonedEnd.millisecond === 0
        const endDate = endIsMidnight
          ? zonedEnd.toPlainDate().subtract({ days: 1 })
          : zonedEnd.toPlainDate()
        return {
          id: event.id,
          title: event.subject,
          start: startDate,
          end: endDate,
          calendarId: visualMeta.calendarId,
          source: event.source ?? 'imported',
          _options: {
            disableDND: true,
            disableResize: true,
            additionalClasses: isIgnored ? ['tc-event', 'tc-ignored-event'] : ['tc-event']
          }
        }
      }

      return {
        id: event.id,
        title: event.subject,
        start: zonedStart,
        end: zonedEnd,
        calendarId: visualMeta.calendarId,
        source: event.source ?? 'imported',
        _options: {
          disableDND: true,
          disableResize: true,
          additionalClasses: isIgnored ? ['tc-event', 'tc-ignored-event'] : ['tc-event']
        }
      }
    })
  )

  const scheduleXBackgroundEvents = $derived.by(() => {
    const backgroundEvents: Array<{
      start: Temporal.ZonedDateTime
      end: Temporal.ZonedDateTime
      title: string
      style: Record<string, string>
    }> = []

    const safeSchedule = sanitizeWorkingHoursSchedule(workingHours)
    const now = new Date()

    for (const session of sessions) {
      const start = new Date(session.startIso)
      const end = new Date(session.endIso ?? now.toISOString())
      const segments = getWorkingTimeSegments(start, end, safeSchedule)
      const ticketKey = session.jiraIssueKey.trim()
      const taskName = session.jiraIssueSummary.trim()
      const shadedLabel =
        taskName && taskName.toLowerCase() !== ticketKey.toLowerCase()
          ? `${ticketKey} - ${taskName}`
          : ticketKey
      const ticketColorSeed = `${session.taskType ?? 'jira'}:${ticketKey}`
      const ticketColor = autoCustomTaskCategoryColor(ticketColorSeed)
      const borderColor = `color-mix(in oklab, ${ticketColor} 78%, #0f172a)`
      const fillColor = `color-mix(in oklab, ${ticketColor} 32%, transparent)`
      const stripeStrong = `color-mix(in oklab, ${ticketColor} 28%, transparent)`
      const stripeSoft = `color-mix(in oklab, ${ticketColor} 12%, transparent)`

      for (const segment of segments) {
        backgroundEvents.push({
          start: toTemporalZonedDateTime(segment.start.toISOString()),
          end: toTemporalZonedDateTime(segment.end.toISOString()),
          title: shadedLabel,
          style: {
            backgroundColor: fillColor,
            backgroundImage: `repeating-linear-gradient(135deg, ${stripeStrong} 0 10px, ${stripeSoft} 10px 20px)`,
            border: `1px solid ${borderColor}`,
            borderLeft: `3px solid ${ticketColor}`,
            boxShadow: 'inset 0 0 0 1px color-mix(in oklab, #f8fafc 16%, transparent)'
          }
        })
      }
    }

    return backgroundEvents
  })

  const eventVisualMetas = $derived(
    calendarEvents.map((event) => {
      const eventId = String(event.id)
      const link = linkByEventId.get(eventId)
      const classification = link?.classification ?? getClassification(eventId)
      const customTaskCategory =
        link?.customTaskCategory ?? link?.offTaskCategory ?? getCustomTaskCategory(eventId)
      const eventType =
        classification === 'primary-task'
          ? 'primary'
          : classification === 'other-ticket'
            ? 'other-ticket'
            : classification === 'off-task' || classification === 'custom-task'
              ? 'custom-task'
              : classification === 'ignored'
                ? 'ignored'
                : isDayScopedOffTaskEvent(event)
                  ? 'off-task'
                  : 'unclassified'
      const colorHex = normalizeHex(getEventColor(eventId))
      const customTaskVisual = resolveCustomTaskCalendarVisual(customTaskCategory)
      return {
        eventId,
        calendarId:
          eventType === 'custom-task'
            ? customTaskVisual.calendarId
            : eventType === 'off-task'
              ? 'off-task'
              : eventType === 'primary'
                ? 'primary'
                : eventType === 'other-ticket'
                  ? 'other-ticket'
                  : eventType === 'ignored'
                    ? 'ignored'
                    : 'imported',
        colorHex: eventType === 'custom-task' ? customTaskVisual.colorHex : colorHex
      }
    })
  )

  const scheduleXCalendars = $derived.by(() => {
    const calendars: Record<string, ScheduleXCalendarPalette> = {
      'off-task': toScheduleXPalette('off-task', '#4338ca'),
      primary: toScheduleXPalette('primary', '#0f766e'),
      'other-ticket': toScheduleXPalette('other-ticket', '#1d4ed8'),
      imported: toScheduleXPalette('imported', '#64748b'),
      ignored: toScheduleXPalette('ignored', '#94a3b8')
    }

    for (const category of customTaskCategories) {
      const categoryId = `custom-task-${slugify(category.name) || 'default'}`
      calendars[categoryId] = toScheduleXPalette(categoryId, category.color)
    }

    for (const eventMeta of eventVisualMetas) {
      if (!calendars[eventMeta.calendarId]) {
        calendars[eventMeta.calendarId] = toScheduleXPalette(
          eventMeta.calendarId,
          eventMeta.colorHex
        )
      }
    }

    return calendars
  })

  let cache = $state('')

  $effect(() => {
    const safeSchedule = sanitizeWorkingHoursSchedule(workingHours)
    const newCache = JSON.stringify({
      x: getCalendarDayBoundaries(safeSchedule),
      scheduleXCalendars,
      mode: mode.current,
      gridHeight
    })
    if (newCache !== cache) {
      cache = newCache
      calendarInstance = buildCalendarInstance(
        gridHeight,
        scheduleXCalendars,
        getCalendarDayBoundaries(safeSchedule),
        mode.current == 'dark'
      )
    }
  })

  $effect(() => {
    if (!calendarInstance) return
    calendarInstance.eventsServicePlugin.set(scheduleXEvents)
  })

  $effect(() => {
    if (!calendarInstance) return
    calendarInstance.eventsServicePlugin.setBackgroundEvents(scheduleXBackgroundEvents)
  })

  let calendarContainer: HTMLDivElement | null = $state(null)

  $effect(() => {
    if (!calendarContainer) return () => {}

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const updateGridHeight = (): void => {
      gridHeight = Math.max(200, calendarContainer!.clientHeight - 150)
    }

    updateGridHeight()

    const observer = new ResizeObserver(() => {
      if (debounceTimer !== null) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        updateGridHeight()
      }, 150)
    })

    observer.observe(calendarContainer)

    return () => {
      observer.disconnect()
      if (debounceTimer !== null) clearTimeout(debounceTimer)
    }
  })

  const handleDayHeaderClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null
    if (!target) return
    // Ignore clicks on any existing calendar event element.
    if (target.closest('[data-event-id], .sx__event, .sx__date-grid-event, .sx__time-grid-event')) {
      return
    }
    // Clicks on the week-view day header cells (day name + number bar)
    const weekDateEl = target.closest('.sx__week-grid__date') as HTMLElement | null
    if (weekDateEl?.dataset.date) {
      try {
        const date = Temporal.PlainDate.from(weekDateEl.dataset.date)
        const next = planningWindowFromDate(date)
        void createPlanningEvent(next.startIso, next.endIso)
      } catch {
        // ignore
      }
      return
    }
    // Clicks on empty all-day row cells only (not event chips)
    const emptyDateGridCell = target.closest(
      '.sx__date-grid-cell, .sx__spacer'
    ) as HTMLElement | null
    if (!emptyDateGridCell) return

    const dateGridEl = target.closest('[data-date-grid-date]') as HTMLElement | null
    const dateGridDate = dateGridEl?.dataset.dateGridDate
    if (dateGridDate) {
      try {
        const date = Temporal.PlainDate.from(dateGridDate)
        const next = planningWindowFromDate(date)
        void createPlanningEvent(next.startIso, next.endIso)
      } catch {
        // ignore
      }
    }
  }
</script>

<div
  bind:this={calendarContainer}
  role="presentation"
  onclick={handleDayHeaderClick}
  class="w-screen h-screen"
>
  {#if calendarInstance}
    {#key cache}
      <ScheduleXCalendar calendarApp={calendarInstance.calendarApp} />
    {/key}
  {/if}
</div>

<style>
  :global(.tc-off-task-event) {
    cursor: pointer;
  }

  :global(.tc-ignored-event) {
    opacity: 0.45;
    filter: grayscale(0.7);
  }

  :global(.tc-ignored-event .sx__event-title) {
    text-decoration: line-through;
    text-decoration-color: currentColor;
  }

  :global(.sx__time-grid-background-event) {
    overflow: hidden;
  }

  :global(.sx__time-grid-background-event::before) {
    content: attr(title);
    position: absolute;
    top: 4px;
    left: 6px;
    right: 6px;
    display: block;
    font-size: 0.65rem;
    line-height: 1.1;
    font-weight: 700;
    letter-spacing: 0.01em;
    color: color-mix(in oklab, #0f172a 86%, #f8fafc 14%);
    text-shadow: 0 1px 0 color-mix(in oklab, #f8fafc 55%, transparent);
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    pointer-events: none;
    opacity: 0.88;
  }
</style>
