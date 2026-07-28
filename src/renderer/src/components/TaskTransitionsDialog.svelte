<script lang="ts">
  import { tick } from 'svelte'
  import type { TaskTransitionInput } from '../../../shared/types'
  import * as Dialog from '$lib/components/ui/dialog'
  import { Button } from '$lib/components/ui/button'
  import { toast } from 'svelte-sonner'
  import PlusIcon from '@lucide/svelte/icons/plus'
  import TaskTransitionsTable from './TaskTransitionsTable.svelte'
  import {
    applyKnownTaskToRow,
    buildKnownTasksByKey,
    buildRowDurationLabels,
    buildTransitionsFromRows,
    nowLocalDateTimeInput,
    toTransitionRows,
    type TransitionDraftRow
  } from '$lib/helpers/task-transitions'
  import { WorkingSchedule } from '../../../shared/working-schedule'
  import { appState } from '$lib/stores/app-state.svelte'

  let {
    open = $bindable(false),
    onSave
  }: {
    open?: boolean
    onSave: (transitions: TaskTransitionInput[]) => Promise<void>
  } = $props()

  const sessions = $derived(appState.enrichedSessions)
  const jiraResults = $derived(appState.jiraResults)
  const customTaskCategories = $derived(appState.settings.customTaskCategories)
  const jiraIssueCache = $derived(appState.snapshot?.state.jiraIssueCache ?? {})
  const defaultWorkingHours = $derived(WorkingSchedule.sanitize(appState.settings.workingHours))
  const weeklyWorkingHoursOverrides = $derived(
    appState.snapshot?.state.weeklyWorkingHoursOverrides ?? {}
  )

  const PAGE_SIZE = 20

  let rows: TransitionDraftRow[] = $state([])
  let wasOpen = $state(false)
  let visibleCount = $state(PAGE_SIZE)
  let scrollContainer: HTMLElement | null = $state(null)

  const knownTasksByKey = $derived.by(() => {
    return buildKnownTasksByKey(jiraResults, customTaskCategories, sessions, jiraIssueCache)
  })

  $effect(() => {
    if (open && !wasOpen) {
      rows = toTransitionRows(sessions)
      visibleCount = PAGE_SIZE
      wasOpen = true
      tick().then(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight
        }
      })
    }

    if (!open) {
      wasOpen = false
    }
  })

  const sliceStart = $derived(Math.max(0, rows.length - visibleCount))
  const visibleRows = $derived(rows.slice(sliceStart))
  const hasMore = $derived(sliceStart > 0)

  const updateRow = (index: number, next: Partial<TransitionDraftRow>): void => {
    rows = rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...next } : row))
  }

  const applyKnownTask = (index: number, nextKey?: string): void => {
    const row = rows[index]
    if (!row) return

    const next = applyKnownTaskToRow(row, knownTasksByKey, nextKey)
    if (!next) return
    updateRow(index, next)
  }

  const removeRow = (index: number): void => {
    rows = rows.filter((_, rowIndex) => rowIndex !== index)
  }

  const rowDurations = $derived(
    buildRowDurationLabels(rows, (start, end) =>
      new WorkingSchedule(defaultWorkingHours, weeklyWorkingHoursOverrides).calculateWorkingSeconds(
        start,
        end
      )
    )
  )
  const visibleDurations = $derived(rowDurations.slice(sliceStart))

  const handleScroll = (event: Event): void => {
    const el = event.currentTarget as HTMLElement
    if (el.scrollTop <= 0 && hasMore) {
      const prevHeight = el.scrollHeight
      visibleCount += PAGE_SIZE
      tick().then(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight - prevHeight
        }
      })
    }
  }

  const addTransition = (): void => {
    rows = [
      ...rows,
      {
        id: crypto.randomUUID(),
        startLocal: nowLocalDateTimeInput(),
        issueKey: '',
        summary: '',
        bookingCode: '',
        taskType: 'jira'
      }
    ]
    tick().then(() => {
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    })
  }

  const save = async (): Promise<void> => {
    const result = buildTransitionsFromRows(rows)
    if (result.error) {
      toast.error(result.error)
      return
    }

    await onSave(result.transitions)
    open = false
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[90vh] w-[min(96vw,64rem)] flex-col overflow-hidden sm:max-w-5xl">
    <Dialog.Header class="shrink-0">
      <Dialog.Title>Task Transition History</Dialog.Title>
      <Dialog.Description>
        Edit task transition start times. Saving will rebuild session history so each task starts
        when the previous one ends.
      </Dialog.Description>
    </Dialog.Header>

    <div
      bind:this={scrollContainer}
      class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      onscroll={handleScroll}
    >
      <div class="space-y-3 py-2">
        {#if hasMore}
          <div class="flex justify-center py-1">
            <Button
              variant="ghost"
              size="sm"
              onclick={() => {
                const prevHeight = scrollContainer?.scrollHeight ?? 0
                visibleCount += PAGE_SIZE
                tick().then(() => {
                  if (scrollContainer) {
                    scrollContainer.scrollTop = scrollContainer.scrollHeight - prevHeight
                  }
                })
              }}
            >
              Load older history
            </Button>
          </div>
        {/if}
        <TaskTransitionsTable
          rows={visibleRows}
          rowDurations={visibleDurations}
          {jiraResults}
          {customTaskCategories}
          {sessions}
          {jiraIssueCache}
          updateRow={(index, next) => updateRow(sliceStart + index, next)}
          applyKnownTask={(index, nextKey) => applyKnownTask(sliceStart + index, nextKey)}
          removeRow={(index) => removeRow(sliceStart + index)}
        />

        <div class="flex justify-between">
          <Button variant="secondary" onclick={addTransition}>
            <PlusIcon class="mr-2 size-4" />
            Add Transition
          </Button>
          <p class="text-xs text-muted-foreground">Rows are saved in chronological order.</p>
        </div>
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={appState.isBusy} onclick={save}>Save History</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
