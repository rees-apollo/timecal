<script lang="ts">
  import { getLocalTimeZone, parseDate, type DateValue } from '@internationalized/date'
  import type { CustomTaskCategory, JiraIssue, TaskSession } from '../../../shared/types'
  import { Button } from '$lib/components/ui/button'
  import Calendar from '$lib/components/ui/calendar/calendar.svelte'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import * as Popover from '$lib/components/ui/popover'
  import * as Table from '$lib/components/ui/table'
  import TaskSearch from './TaskSearch.svelte'
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down'
  import Trash2Icon from '@lucide/svelte/icons/trash-2'
  import type { TransitionDraftRow } from '$lib/helpers/task-transitions'

  let {
    rows,
    rowDurations,
    jiraResults,
    customTaskCategories,
    sessions,
    updateRow,
    applyKnownTask,
    removeRow
  }: {
    rows: TransitionDraftRow[]
    rowDurations: string[]
    jiraResults: JiraIssue[]
    customTaskCategories: CustomTaskCategory[]
    sessions: TaskSession[]
    updateRow: (index: number, next: Partial<TransitionDraftRow>) => void
    applyKnownTask: (index: number, nextKey?: string) => void
    removeRow: (index: number) => void
  } = $props()

  const recentIssueKeys = $derived.by(() =>
    [...sessions].reverse().map((session) => session.jiraIssueKey)
  )

  const taskSearchData = $derived({
    jiraResults,
    customTaskCategories,
    sessions,
    recentIssueKeys
  })

  let startDatePopoverOpenById = $state<Record<string, boolean>>({})

  const getStartDatePopoverOpen = (rowId: string): boolean =>
    startDatePopoverOpenById[rowId] ?? false

  const setStartDatePopoverOpen = (rowId: string, value: boolean): void => {
    startDatePopoverOpenById[rowId] = value
  }

  const getStartDate = (startLocal: string): string => startLocal.slice(0, 10)

  const getStartTime = (startLocal: string): string => startLocal.slice(11, 16)

  const parseStartDateValue = (startLocal: string): DateValue | undefined => {
    const date = getStartDate(startLocal)
    if (!date) return undefined
    try {
      return parseDate(date)
    } catch {
      return undefined
    }
  }

  const formatDateValue = (value: DateValue): string =>
    `${value.year.toString().padStart(4, '0')}-${value.month.toString().padStart(2, '0')}-${value.day.toString().padStart(2, '0')}`

  const formatStartDateLabel = (startLocal: string): string => {
    const dateValue = parseStartDateValue(startLocal)
    if (!dateValue) return 'Select date'
    return dateValue.toDate(getLocalTimeZone()).toLocaleDateString()
  }

  const mergeDateAndTime = (date: string, time: string): string => {
    if (!date || !time) return ''
    return `${date}T${time}`
  }

  const updateStartDate = (index: number, nextDate: string): void => {
    const row = rows[index]
    if (!row) return
    const next = mergeDateAndTime(nextDate, getStartTime(row.startLocal) || '00:00')
    if (!next) return
    updateRow(index, { startLocal: next })
  }

  const updateStartTime = (index: number, nextTime: string): void => {
    const row = rows[index]
    if (!row) return
    const next = mergeDateAndTime(getStartDate(row.startLocal), nextTime)
    if (!next) return
    updateRow(index, { startLocal: next })
  }
</script>

<div>
  <Table.Root>
    <Table.Header>
      <Table.Row>
        <Table.Head class="w-52">Start Time</Table.Head>
        <Table.Head class="w-8"></Table.Head>
        <Table.Head class="w-56">Task</Table.Head>
        <Table.Head class="w-32">Booking</Table.Head>
        <Table.Head class="w-12"></Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#if rows.length === 0}
        <Table.Row>
          <Table.Cell colspan={5} class="py-4 text-center text-sm text-muted-foreground">
            No transitions yet.
          </Table.Cell>
        </Table.Row>
      {:else}
        {#each rows as row, index (row.id)}
          <Table.Row>
            <Table.Cell class="align-top">
              <div class="flex gap-2">
                <Label class="sr-only" for={`start-date-${row.id}`}>Start date</Label>
                <Popover.Root
                  bind:open={
                    () => getStartDatePopoverOpen(row.id),
                    (value) => setStartDatePopoverOpen(row.id, value)
                  }
                >
                  <Popover.Trigger id={`start-date-${row.id}`}>
                    {#snippet child({ props })}
                      <Button {...props} variant="outline" class="w-36 justify-between font-normal">
                        {formatStartDateLabel(row.startLocal)}
                        <ChevronDownIcon class="size-4 opacity-70" />
                      </Button>
                    {/snippet}
                  </Popover.Trigger>
                  <Popover.Content class="w-auto overflow-hidden p-0" align="start">
                    <Calendar
                      type="single"
                      value={parseStartDateValue(row.startLocal)}
                      onValueChange={(value) => {
                        if (!value) return
                        updateStartDate(index, formatDateValue(value))
                        startDatePopoverOpenById[row.id] = false
                      }}
                      captionLayout="dropdown"
                    />
                  </Popover.Content>
                </Popover.Root>
                <Label class="sr-only" for={`start-time-${row.id}`}>Start time</Label>
                <Input
                  id={`start-time-${row.id}`}
                  type="time"
                  step="1"
                  value={getStartTime(row.startLocal)}
                  class="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                  onchange={(event) =>
                    updateStartTime(index, (event.currentTarget as HTMLInputElement).value)}
                />
              </div>
            </Table.Cell>
            <Table.Cell>
              {#if rowDurations[index] === 'active'}
                <p class="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">● active</p>
              {:else if rowDurations[index]}
                <p class="mt-0.5 text-xs text-muted-foreground">{rowDurations[index]}</p>
              {/if}
            </Table.Cell>
            <Table.Cell class="align-top">
              <TaskSearch
                data={taskSearchData}
                selection={{
                  primaryIssueKey: '',
                  currentKey: row.taskType === 'jira' ? row.issueKey : '',
                  currentCustomTaskCategory: row.taskType === 'custom' ? row.issueKey : ''
                }}
                ui={{
                  useSelectionTrigger: true,
                  triggerLabel: row.issueKey || 'Select task',
                  triggerButtonClass: 'h-9 w-full justify-between rounded-md text-sm',
                  popoverContentClass: 'w-[360px] p-3'
                }}
                onClearSelection={() => {
                  updateRow(index, {
                    issueKey: '',
                    summary: '',
                    bookingCode: '',
                    taskType: 'jira'
                  })
                }}
                onSelectJira={(key) => {
                  updateRow(index, { issueKey: key, taskType: 'jira' })
                  applyKnownTask(index, key)
                }}
                onSelectCustomTask={(categoryName) => {
                  updateRow(index, { issueKey: categoryName, taskType: 'custom' })
                  applyKnownTask(index, categoryName)
                }}
              />
            </Table.Cell>

            <Table.Cell class="align-middle">
              <Label class="sr-only" for={`booking-${row.id}`}>Booking code</Label>
              <span class="mt-0.5 text-muted-foreground">
                {row.bookingCode}
              </span></Table.Cell
            >

            <Table.Cell class="align-top text-right">
              <Button
                variant="ghost"
                size="icon"
                class="text-muted-foreground"
                onclick={() => removeRow(index)}
              >
                <Trash2Icon class="size-4" />
                <span class="sr-only">Remove transition</span>
              </Button>
            </Table.Cell>
          </Table.Row>
        {/each}
      {/if}
    </Table.Body>
  </Table.Root>
</div>
