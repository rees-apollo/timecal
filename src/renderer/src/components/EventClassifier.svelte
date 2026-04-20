<script lang="ts">
  import type {
    CalendarEvent,
    CalendarEventClassification,
    JiraIssue,
    TaskSession,
    CustomTaskCategory
  } from '../../../shared/types'
  import { Badge } from '$lib/components/ui/badge'
  import { Input } from '$lib/components/ui/input'
  import { Button } from '$lib/components/ui/button'
  import { FieldGroup, FieldLabel } from '$lib/components/ui/field'
  import TaskSearch from './TaskSearch.svelte'

  type AnchorRect = {
    top: number
    left: number
    right: number
    bottom: number
    width: number
    height: number
  }

  type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

  let {
    selectedCalendarEvent,
    popupAnchorRect = null,
    otherTicketMap = $bindable(),
    jiraResults = [],
    recentIssueKeys = [],
    sessions = [],
    primaryIssueKey = '',
    customTaskCategories = [],
    getClassification,
    getCustomTaskCategory,
    classifyEvent,
    updatePlanningEvent,
    deletePlanningEvent,
    onClose
  }: {
    selectedCalendarEvent: CalendarEvent | undefined
    popupAnchorRect?: AnchorRect | null
    otherTicketMap: Record<string, string>
    jiraResults?: JiraIssue[]
    recentIssueKeys?: string[]
    sessions?: TaskSession[]
    primaryIssueKey?: string
    customTaskCategories?: CustomTaskCategory[]
    getClassification: (eventId: string) => CalendarEventClassification
    getCustomTaskCategory: (eventId: string) => string | undefined
    classifyEvent: (
      eventId: string,
      classification: string,
      options?: { customTaskCategory?: string }
    ) => Promise<void>
    updatePlanningEvent: (
      id: string,
      startIso: string,
      endIso: string,
      plannedMinutes?: number | null
    ) => Promise<void>
    deletePlanningEvent: (id: string) => Promise<void>
    onClose: () => void
  } = $props()

  const classificationBadgeVariant = (c: string): BadgeVariant => {
    if (c === 'primary-task') return 'default'
    if (c === 'custom-task') return 'destructive'
    if (c === 'other-ticket') return 'secondary'
    if (c === 'ignored') return 'secondary'
    return 'outline'
  }

  const toTab = (classification: CalendarEventClassification): 'jira' | 'custom' =>
    classification === 'custom-task' ? 'custom' : 'jira'

  const isOffTaskBlockEvent = (event: CalendarEvent | undefined): boolean =>
    event?.source === 'off-task' || event?.source === 'planning'

  let activeTab = $state<'jira' | 'custom'>('jira')
  let offTaskHoursInput = $state('')
  let lastEventId = $state('')

  const currentClassification = $derived(
    selectedCalendarEvent ? getClassification(selectedCalendarEvent.id) : 'unclassified'
  )

  $effect(() => {
    if (selectedCalendarEvent?.id && selectedCalendarEvent.id !== lastEventId) {
      lastEventId = selectedCalendarEvent.id
      activeTab = toTab(currentClassification)
      offTaskHoursInput =
        typeof selectedCalendarEvent.plannedMinutes === 'number'
          ? String(Number((selectedCalendarEvent.plannedMinutes / 60).toFixed(2)))
          : ''
    }
  })

  const offTaskCalendarDurationHours = $derived.by(() => {
    if (!selectedCalendarEvent) return 0
    const start = new Date(selectedCalendarEvent.startIso).getTime()
    const end = new Date(selectedCalendarEvent.endIso).getTime()
    const minutes = Math.max(0, Math.floor((end - start) / 60000))
    return minutes / 60
  })

  const parsedOffTaskMinutes = $derived.by(() => {
    const value = String(offTaskHoursInput).trim()
    if (!value) return undefined
    const parsed = Number.parseFloat(value)
    if (!Number.isFinite(parsed)) return undefined
    return Math.max(1, Math.round(parsed * 60))
  })

  const eventTicketKey = $derived(
    selectedCalendarEvent ? (otherTicketMap[selectedCalendarEvent.id] ?? '') : ''
  )

  const currentCustomTaskCategory = $derived.by(() => {
    if (!selectedCalendarEvent) return ''
    if (getClassification(selectedCalendarEvent.id) !== 'custom-task') return ''
    return getCustomTaskCategory(selectedCalendarEvent.id) ?? ''
  })

  const taskSelectionLabel = $derived.by(() => {
    if (currentCustomTaskCategory) return currentCustomTaskCategory
    if (eventTicketKey) return eventTicketKey
    return 'Select task'
  })

  const selectTicket = async (issueKey: string): Promise<void> => {
    if (!selectedCalendarEvent) return
    otherTicketMap[selectedCalendarEvent.id] = issueKey
    const isPrimary = Boolean(primaryIssueKey) && issueKey === primaryIssueKey
    if (isPrimary) {
      await classifyEvent(selectedCalendarEvent.id, 'primary-task')
    } else {
      await classifyEvent(selectedCalendarEvent.id, 'other-ticket')
    }
    onClose()
  }

  const selectCustomTask = async (categoryName: string): Promise<void> => {
    if (!selectedCalendarEvent) return
    await classifyEvent(selectedCalendarEvent.id, 'custom-task', {
      customTaskCategory: categoryName
    })
    onClose()
  }

  const clearAssignedTask = async (): Promise<void> => {
    if (!selectedCalendarEvent) return
    delete otherTicketMap[selectedCalendarEvent.id]
    await classifyEvent(selectedCalendarEvent.id, 'unclassified')
  }

  const removeOffTaskEvent = async (): Promise<void> => {
    if (!isOffTaskBlockEvent(selectedCalendarEvent) || !selectedCalendarEvent) return
    await deletePlanningEvent(selectedCalendarEvent.id)
    onClose()
  }

  const saveOffTaskHours = async (): Promise<void> => {
    if (!isOffTaskBlockEvent(selectedCalendarEvent) || !selectedCalendarEvent) return
    if (parsedOffTaskMinutes === undefined) return

    await updatePlanningEvent(
      selectedCalendarEvent.id,
      selectedCalendarEvent.startIso,
      selectedCalendarEvent.endIso,
      parsedOffTaskMinutes
    )
  }

  $effect(() => {
    if (!isOffTaskBlockEvent(selectedCalendarEvent) || !selectedCalendarEvent) return
    if (parsedOffTaskMinutes === undefined) return

    const persistedMinutes =
      typeof selectedCalendarEvent.plannedMinutes === 'number'
        ? selectedCalendarEvent.plannedMinutes
        : null

    if (persistedMinutes === parsedOffTaskMinutes) return

    const timer = window.setTimeout(() => {
      void saveOffTaskHours()
    }, 350)

    return () => {
      window.clearTimeout(timer)
    }
  })

  const clearOffTaskHours = async (): Promise<void> => {
    if (!isOffTaskBlockEvent(selectedCalendarEvent) || !selectedCalendarEvent) return

    offTaskHoursInput = ''
    await updatePlanningEvent(
      selectedCalendarEvent.id,
      selectedCalendarEvent.startIso,
      selectedCalendarEvent.endIso,
      null
    )
  }

  const toggleIgnored = async (): Promise<void> => {
    if (!selectedCalendarEvent) return
    if (currentClassification === 'ignored') {
      await classifyEvent(selectedCalendarEvent.id, 'unclassified')
    } else {
      await classifyEvent(selectedCalendarEvent.id, 'ignored')
    }
    onClose()
  }

  const getPopupPosition = (
    anchorRect: AnchorRect
  ): { top: number; left: number; transformOrigin: string } => {
    const popupWidth = 360
    const popupHeight = 420
    const spacing = 10
    const maxLeft = Math.max(spacing, window.innerWidth - popupWidth - spacing)
    const maxTop = Math.max(spacing, window.innerHeight - popupHeight - spacing)

    const preferredRight = anchorRect.right + spacing
    const canShowRight = preferredRight <= maxLeft
    const left = canShowRight
      ? preferredRight
      : Math.min(maxLeft, Math.max(spacing, anchorRect.left - popupWidth - spacing))
    const top = Math.min(maxTop, Math.max(spacing, anchorRect.top))

    return {
      top,
      left,
      transformOrigin: canShowRight ? 'left top' : 'right top'
    }
  }

  const popupPosition = $derived(popupAnchorRect ? getPopupPosition(popupAnchorRect) : null)
</script>

{#if selectedCalendarEvent && popupAnchorRect && popupPosition}
  <div class="fixed inset-0 z-30 pointer-events-none" aria-hidden="true"></div>
  <div
    class="fixed z-40 w-[min(360px,calc(100vw-1.5rem))] rounded-lg border bg-popover p-3 shadow-xl pointer-events-auto text-muted-foreground"
    style={`top: ${popupPosition.top}px; left: ${popupPosition.left}px; transform-origin: ${popupPosition.transformOrigin};`}
  >
    <div class="mb-2 flex items-start justify-between gap-2 text-sm">
      <div class="space-y-1">
        <div class="font-semibold leading-tight">{selectedCalendarEvent.subject}</div>
        <div class="text-xs text-muted-foreground">
          {new Date(selectedCalendarEvent.startIso).toLocaleString()} - {new Date(
            selectedCalendarEvent.endIso
          ).toLocaleTimeString()}
        </div>
      </div>
      <Badge variant={classificationBadgeVariant(currentClassification)}
        >{currentClassification}</Badge
      >
    </div>

    <div class="flex flex-col gap-3 py-2">
      {#if isOffTaskBlockEvent(selectedCalendarEvent)}
        <FieldGroup>
          <FieldLabel>Hours</FieldLabel>
          <Input
            type="number"
            min="0.01"
            step="0.25"
            class="h-8"
            bind:value={offTaskHoursInput}
            placeholder="e.g. 1.5"
          />
        </FieldGroup>
      {/if}
      <FieldGroup>
        <FieldLabel>Task</FieldLabel>
        <TaskSearch
          useSelectionTrigger={true}
          triggerLabel={taskSelectionLabel}
          triggerButtonClass="h-8 w-full justify-between rounded-md text-sm"
          popoverContentClass="w-[320px] p-3"
          {jiraResults}
          {sessions}
          {recentIssueKeys}
          {primaryIssueKey}
          currentKey={eventTicketKey}
          {currentCustomTaskCategory}
          {customTaskCategories}
          bind:activeTab
          onSelectJira={selectTicket}
          onSelectCustomTask={selectCustomTask}
          onClearSelection={clearAssignedTask}
        />
      </FieldGroup>
    </div>

    <div class="mt-3 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        {#if !isOffTaskBlockEvent(selectedCalendarEvent)}
          <Button size="sm" variant="outline" onclick={toggleIgnored}
            >{currentClassification === 'ignored'
              ? 'Include in calculations'
              : 'Ignore in calculations'}</Button
          >
        {/if}
        {#if isOffTaskBlockEvent(selectedCalendarEvent)}
          <Button size="sm" variant="destructive" onclick={removeOffTaskEvent}
            >Delete off-task block</Button
          >
        {/if}
      </div>
      <Button size="sm" variant="ghost" onclick={onClose}>Close</Button>
    </div>
  </div>
{/if}
