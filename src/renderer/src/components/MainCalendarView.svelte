<script lang="ts">
  import type {
    AppSettings,
    AppSnapshot,
    CalendarEventClassification,
    JiraIssue,
    TaskSession,
    WorkingHoursSchedule
  } from '../../../shared/types'
  import CalendarPanel from './CalendarPanel.svelte'
  import EventClassifier from './EventClassifier.svelte'

  type MainCalendarContext = {
    snapshot?: AppSnapshot | null
    settings: AppSettings
    jiraResults?: JiraIssue[]
    sessions?: TaskSession[]
    workingHours: WorkingHoursSchedule
  }

  type MainCalendarSelection = {
    selectedIssueKey?: string
    otherTicketMap?: Record<string, string>
  }

  type MainCalendarActions = {
    classifyEvent: (
      eventId: string,
      classification: string,
      options?: { customTaskCategory?: string }
    ) => Promise<void>
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
    deletePlanningEvent: (id: string) => Promise<void>
  }

  type MainCalendarSelectors = {
    getClassification: (eventId: string) => CalendarEventClassification
    getCustomTaskCategory: (eventId: string) => string | undefined
    getEventColor: (eventId: string) => string
  }

  let {
    context,
    selection = $bindable({ selectedIssueKey: '', otherTicketMap: {} }),
    actions,
    selectors,
    onDisplayedWeekStartChange
  }: {
    context: MainCalendarContext
    selection?: MainCalendarSelection
    actions: MainCalendarActions
    selectors: MainCalendarSelectors
    onDisplayedWeekStartChange: (weekStartKey: string) => void
  } = $props()

  type AnchorRect = {
    top: number
    left: number
    right: number
    bottom: number
    width: number
    height: number
  }

  let selectedCalendarEventId = $state('')
  let selectedEventAnchorRect = $state<AnchorRect | null>(null)

  const calendarEvents = $derived(context.snapshot?.state.calendarEvents ?? [])
  const selectedCalendarEvent = $derived(
    calendarEvents.find((e) => e.id === selectedCalendarEventId) ?? calendarEvents[0]
  )
  const primaryIssueKey = $derived(
    selection.selectedIssueKey || context.snapshot?.activeSession?.jiraIssueKey || ''
  )

  const calendarPanelData = $derived({
    calendarEvents,
    calendarLinks: context.snapshot?.state.calendarLinks ?? [],
    customTaskCategories: context.snapshot?.state.settings.customTaskCategories ?? [],
    sessions: context.sessions ?? [],
    workingHours: context.workingHours
  })

  const calendarPanelBehavior = $derived.by(() => ({
    getClassification: selectors.getClassification,
    getCustomTaskCategory: selectors.getCustomTaskCategory,
    getEventColor: selectors.getEventColor,
    createPlanningEvent: actions.createPlanningEvent,
    updatePlanningEvent: actions.updatePlanningEvent,
    onDisplayedWeekStartChange,
    onEventClick: (payload: { id: string; anchorRect: AnchorRect | null }) => {
      selectedCalendarEventId = payload.id
      selectedEventAnchorRect = payload.anchorRect
    }
  }))

  const eventClassifierContext = $derived({
    selectedCalendarEvent,
    popupAnchorRect: selectedEventAnchorRect,
    jiraResults: context.jiraResults ?? [],
    recentIssueKeys: context.snapshot?.state.recentIssueKeys ?? [],
    sessions: context.snapshot?.state.sessions ?? [],
    primaryIssueKey,
    customTaskCategories: context.settings.customTaskCategories ?? []
  })

  const eventClassifierActions = $derived.by(() => ({
    getClassification: selectors.getClassification,
    getCustomTaskCategory: selectors.getCustomTaskCategory,
    classifyEvent: actions.classifyEvent,
    updatePlanningEvent: actions.updatePlanningEvent,
    deletePlanningEvent: actions.deletePlanningEvent,
    onClose: () => {
      selectedEventAnchorRect = null
      selectedCalendarEventId = ''
    }
  }))

  $effect(() => {
    if (
      calendarEvents.length > 0 &&
      !calendarEvents.some((e) => e.id === selectedCalendarEventId)
    ) {
      selectedCalendarEventId = calendarEvents[0].id
      selectedEventAnchorRect = null
    }
  })
</script>

<div class="h-screen w-screen">
  <CalendarPanel
    calendarEvents={calendarPanelData.calendarEvents}
    calendarLinks={calendarPanelData.calendarLinks}
    customTaskCategories={calendarPanelData.customTaskCategories}
    sessions={calendarPanelData.sessions}
    workingHours={calendarPanelData.workingHours}
    getClassification={calendarPanelBehavior.getClassification}
    getCustomTaskCategory={calendarPanelBehavior.getCustomTaskCategory}
    getEventColor={calendarPanelBehavior.getEventColor}
    createPlanningEvent={calendarPanelBehavior.createPlanningEvent}
    updatePlanningEvent={calendarPanelBehavior.updatePlanningEvent}
    onDisplayedWeekStartChange={calendarPanelBehavior.onDisplayedWeekStartChange}
    onEventClick={calendarPanelBehavior.onEventClick}
  />
  <EventClassifier
    context={eventClassifierContext}
    bind:otherTicketMap={selection.otherTicketMap}
    actions={eventClassifierActions}
  />
</div>
