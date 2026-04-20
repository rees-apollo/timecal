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

  let {
    snapshot = null,
    settings,
    jiraResults = [],
    selectedIssueKey = $bindable(''),
    otherTicketMap = $bindable({}),
    classifyEvent,
    createPlanningEvent,
    updatePlanningEvent,
    deletePlanningEvent,
    sessions = [],
    workingHours,
    getClassification,
    getCustomTaskCategory,
    getEventColor
  }: {
    snapshot?: AppSnapshot | null
    settings: AppSettings
    jiraResults?: JiraIssue[]
    selectedIssueKey?: string
    otherTicketMap?: Record<string, string>
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
    sessions?: TaskSession[]
    workingHours: WorkingHoursSchedule
    getClassification: (eventId: string) => CalendarEventClassification
    getCustomTaskCategory: (eventId: string) => string | undefined
    getEventColor: (eventId: string) => string
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

  const calendarEvents = $derived(snapshot?.state.calendarEvents ?? [])
  const selectedCalendarEvent = $derived(
    calendarEvents.find((e) => e.id === selectedCalendarEventId) ?? calendarEvents[0]
  )
  const primaryIssueKey = $derived(selectedIssueKey || snapshot?.activeSession?.jiraIssueKey || '')

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
    {calendarEvents}
    calendarLinks={snapshot?.state.calendarLinks ?? []}
    customTaskCategories={snapshot?.state.settings.customTaskCategories ?? []}
    {getClassification}
    {getCustomTaskCategory}
    {getEventColor}
    {createPlanningEvent}
    {updatePlanningEvent}
    {sessions}
    {workingHours}
    onEventClick={(payload) => {
      selectedCalendarEventId = payload.id
      selectedEventAnchorRect = payload.anchorRect
    }}
  />
  <EventClassifier
    {selectedCalendarEvent}
    popupAnchorRect={selectedEventAnchorRect}
    bind:otherTicketMap
    {jiraResults}
    recentIssueKeys={snapshot?.state.recentIssueKeys ?? []}
    sessions={snapshot?.state.sessions ?? []}
    {primaryIssueKey}
    customTaskCategories={settings.customTaskCategories ?? []}
    {getClassification}
    {getCustomTaskCategory}
    {classifyEvent}
    {updatePlanningEvent}
    {deletePlanningEvent}
    onClose={() => {
      selectedEventAnchorRect = null
      selectedCalendarEventId = ''
    }}
  />
</div>
