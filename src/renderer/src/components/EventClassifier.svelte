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
  import {
    classificationBadgeVariant,
    getPopupPosition,
    isOffTaskBlockEvent,
    parseOffTaskHoursInputMinutes,
    toTaskSearchTab,
    type AnchorRect
  } from '$lib/helpers/event-classifier'
  import TaskSearch from './TaskSearch.svelte'

  type EventClassifierContext = {
    selectedCalendarEvent: CalendarEvent | undefined
    popupAnchorRect?: AnchorRect | null
    jiraResults?: JiraIssue[]
    recentIssueKeys?: string[]
    sessions?: TaskSession[]
    primaryIssueKey?: string
    customTaskCategories?: CustomTaskCategory[]
  }

  type EventClassifierActions = {
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
  }

  let {
    context,
    otherTicketMap = $bindable(),
    actions
  }: {
    context: EventClassifierContext
    otherTicketMap: Record<string, string>
    actions: EventClassifierActions
  } = $props()

  const selectedCalendarEvent = $derived(context.selectedCalendarEvent)
  const popupAnchorRect = $derived(context.popupAnchorRect ?? null)
  const jiraResults = $derived(context.jiraResults ?? [])
  const recentIssueKeys = $derived(context.recentIssueKeys ?? [])
  const sessions = $derived(context.sessions ?? [])
  const primaryIssueKey = $derived(context.primaryIssueKey ?? '')
  const customTaskCategories = $derived(context.customTaskCategories ?? [])

  let taskSearchState = $state<{ jiraQuery: string; activeTab: 'jira' | 'custom' }>({
    jiraQuery: '',
    activeTab: 'jira'
  })
  let offTaskHoursInput = $state('')
  let lastEventId = $state('')

  const currentClassification = $derived(
    selectedCalendarEvent ? actions.getClassification(selectedCalendarEvent.id) : 'unclassified'
  )

  $effect(() => {
    if (selectedCalendarEvent?.id && selectedCalendarEvent.id !== lastEventId) {
      lastEventId = selectedCalendarEvent.id
      taskSearchState.activeTab = toTaskSearchTab(currentClassification)
      taskSearchState.jiraQuery = ''
      offTaskHoursInput =
        typeof selectedCalendarEvent.plannedMinutes === 'number'
          ? String(Number((selectedCalendarEvent.plannedMinutes / 60).toFixed(2)))
          : ''
    }
  })

  const parsedOffTaskMinutes = $derived.by(() => parseOffTaskHoursInputMinutes(offTaskHoursInput))

  const eventTicketKey = $derived(
    selectedCalendarEvent ? (otherTicketMap[selectedCalendarEvent.id] ?? '') : ''
  )

  const currentCustomTaskCategory = $derived.by(() => {
    if (!selectedCalendarEvent) return ''
    if (actions.getClassification(selectedCalendarEvent.id) !== 'custom-task') return ''
    return actions.getCustomTaskCategory(selectedCalendarEvent.id) ?? ''
  })

  const taskSelectionLabel = $derived.by(() => {
    if (currentCustomTaskCategory) return currentCustomTaskCategory
    if (eventTicketKey) return eventTicketKey
    return 'Select task'
  })

  const saveOffTaskHours = async (): Promise<void> => {
    if (!isOffTaskBlockEvent(selectedCalendarEvent) || !selectedCalendarEvent) return
    if (parsedOffTaskMinutes === undefined) return

    await actions.updatePlanningEvent(
      selectedCalendarEvent.id,
      selectedCalendarEvent.startIso,
      selectedCalendarEvent.endIso,
      parsedOffTaskMinutes
    )
  }

  $effect(() => {
    let cleanup: (() => void) | undefined

    if (
      isOffTaskBlockEvent(selectedCalendarEvent) &&
      selectedCalendarEvent &&
      parsedOffTaskMinutes !== undefined
    ) {
      const persistedMinutes =
        typeof selectedCalendarEvent.plannedMinutes === 'number'
          ? selectedCalendarEvent.plannedMinutes
          : null

      if (persistedMinutes !== parsedOffTaskMinutes) {
        const timer = window.setTimeout(() => {
          void saveOffTaskHours()
        }, 350)

        cleanup = () => {
          window.clearTimeout(timer)
        }
      }
    }

    return cleanup
  })

  const popupPosition = $derived(
    popupAnchorRect
      ? getPopupPosition(popupAnchorRect, window.innerWidth, window.innerHeight)
      : null
  )
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
          data={{ jiraResults, sessions, recentIssueKeys, customTaskCategories }}
          selection={{
            primaryIssueKey,
            currentKey: eventTicketKey,
            currentCustomTaskCategory
          }}
          bind:searchState={taskSearchState}
          ui={{
            useSelectionTrigger: true,
            triggerLabel: taskSelectionLabel,
            triggerButtonClass: 'h-8 w-full justify-between rounded-md text-sm',
            popoverContentClass: 'w-[320px] p-3'
          }}
          onSelectJira={async (issueKey) => {
            if (!selectedCalendarEvent) return
            otherTicketMap[selectedCalendarEvent.id] = issueKey
            const isPrimary = Boolean(primaryIssueKey) && issueKey === primaryIssueKey
            if (isPrimary) {
              await actions.classifyEvent(selectedCalendarEvent.id, 'primary-task')
            } else {
              await actions.classifyEvent(selectedCalendarEvent.id, 'other-ticket')
            }
            actions.onClose()
          }}
          onSelectCustomTask={async (categoryName) => {
            if (!selectedCalendarEvent) return
            await actions.classifyEvent(selectedCalendarEvent.id, 'custom-task', {
              customTaskCategory: categoryName
            })
            actions.onClose()
          }}
          onClearSelection={async () => {
            if (!selectedCalendarEvent) return
            delete otherTicketMap[selectedCalendarEvent.id]
            await actions.classifyEvent(selectedCalendarEvent.id, 'unclassified')
          }}
        />
      </FieldGroup>
    </div>

    <div class="mt-3 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        {#if !isOffTaskBlockEvent(selectedCalendarEvent)}
          <Button
            size="sm"
            variant="outline"
            onclick={async () => {
              if (!selectedCalendarEvent) return
              if (currentClassification === 'ignored') {
                await actions.classifyEvent(selectedCalendarEvent.id, 'unclassified')
              } else {
                await actions.classifyEvent(selectedCalendarEvent.id, 'ignored')
              }
              actions.onClose()
            }}
            >{currentClassification === 'ignored'
              ? 'Include in calculations'
              : 'Ignore in calculations'}</Button
          >
        {/if}
        {#if isOffTaskBlockEvent(selectedCalendarEvent)}
          <Button
            size="sm"
            variant="destructive"
            onclick={async () => {
              if (!selectedCalendarEvent) return
              await actions.deletePlanningEvent(selectedCalendarEvent.id)
              actions.onClose()
            }}>Delete off-task block</Button
          >
        {/if}
      </div>
      <Button size="sm" variant="ghost" onclick={actions.onClose}>Close</Button>
    </div>
  </div>
{/if}
