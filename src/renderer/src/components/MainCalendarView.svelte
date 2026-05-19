<script lang="ts">
  import type { CalendarEventClassification, WorkingHoursSchedule } from '../../../shared/types'
  import CalendarPanel from './CalendarPanel.svelte'
  import EventClassifier from './EventClassifier.svelte'
  import { appState } from '$lib/stores/app-state.svelte'

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
    workingHours,
    selection = $bindable({ selectedIssueKey: '', otherTicketMap: {} }),
    actions,
    selectors,
    onDisplayedWeekStartChange
  }: {
    workingHours: WorkingHoursSchedule
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

  const calendarEvents = $derived(appState.snapshot?.state.calendarEvents ?? [])
  const selectedCalendarEvent = $derived(
    calendarEvents.find((e) => e.id === selectedCalendarEventId) ?? calendarEvents[0]
  )
  const primaryIssueKey = $derived(
    selection.selectedIssueKey || appState.snapshot?.activeSession?.jiraIssueKey || ''
  )

  const calendarPanelData = $derived({
    calendarEvents,
    calendarLinks: appState.snapshot?.state.calendarLinks ?? [],
    customTaskCategories: appState.snapshot?.state.settings.customTaskCategories ?? [],
    sessions: appState.enrichedSessions,
    workingHours
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
    jiraResults: appState.jiraResults,
    recentIssueKeys: appState.snapshot?.state.recentIssueKeys ?? [],
    sessions: appState.enrichedSessions,
    primaryIssueKey,
    customTaskCategories: appState.settings.customTaskCategories ?? []
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
