<script lang="ts">
  import type {
    CustomTaskCategory,
    JiraIssue,
    TaskSession,
    TaskTransitionInput,
    WorkingHoursSchedule
  } from '../../../shared/types'
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
  import { sanitizeWorkingHoursSchedule } from '../../../shared/working-hours'
  import { calculateWorkingSecondsWithWeeklyOverrides } from '../../../shared/working-time-overrides'

  let {
    open = $bindable(false),
    sessions = [],
    jiraResults = [],
    customTaskCategories = [],
    workingHours,
    weeklyWorkingHoursOverrides = {},
    isBusy = false,
    onSave
  }: {
    open?: boolean
    sessions?: TaskSession[]
    jiraResults?: JiraIssue[]
    customTaskCategories?: CustomTaskCategory[]
    workingHours: WorkingHoursSchedule
    weeklyWorkingHoursOverrides?: Record<string, WorkingHoursSchedule>
    isBusy?: boolean
    onSave: (transitions: TaskTransitionInput[]) => Promise<void>
  } = $props()

  const defaultWorkingHours = $derived(sanitizeWorkingHoursSchedule(workingHours))

  let rows: TransitionDraftRow[] = $state([])
  let wasOpen = $state(false)

  const knownTasksByKey = $derived.by(() => {
    return buildKnownTasksByKey(jiraResults, customTaskCategories, sessions)
  })

  $effect(() => {
    if (open && !wasOpen) {
      rows = toTransitionRows(sessions)
      wasOpen = true
    }

    if (!open) {
      wasOpen = false
    }
  })

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
      calculateWorkingSecondsWithWeeklyOverrides({
        start,
        end,
        defaultWorkingHours,
        weeklyWorkingHoursOverrides
      })
    )
  )

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
  <Dialog.Content class="overflow-y-auto w-[min(96vw,64rem)] sm:max-w-5xl overflow-x-hidden">
    <Dialog.Header>
      <Dialog.Title>Task Transition History</Dialog.Title>
      <Dialog.Description>
        Edit task transition start times. Saving will rebuild session history so each task starts
        when the previous one ends.
      </Dialog.Description>
    </Dialog.Header>
    <div class="space-y-3 py-2">
      <TaskTransitionsTable
        {rows}
        {rowDurations}
        {jiraResults}
        {customTaskCategories}
        {sessions}
        {updateRow}
        {applyKnownTask}
        {removeRow}
      />

      <div class="flex justify-between">
        <Button
          variant="secondary"
          onclick={() => {
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
          }}
        >
          <PlusIcon class="mr-2 size-4" />
          Add Transition
        </Button>
        <p class="text-xs text-muted-foreground">Rows are saved in chronological order.</p>
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={isBusy} onclick={save}>Save History</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
