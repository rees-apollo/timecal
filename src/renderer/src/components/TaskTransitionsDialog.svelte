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
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { toast } from 'svelte-sonner'
  import * as Table from '$lib/components/ui/table'
  import PlusIcon from '@lucide/svelte/icons/plus'
  import Trash2Icon from '@lucide/svelte/icons/trash-2'
  import {
    calculateWorkingSecondsBetween,
    sanitizeWorkingHoursSchedule
  } from '../../../shared/working-hours'

  type TransitionDraftRow = {
    id: string
    startLocal: string
    issueKey: string
    summary: string
    bookingCode: string
    taskType: 'jira' | 'custom'
  }

  let {
    open = $bindable(false),
    sessions = [],
    jiraResults = [],
    customTaskCategories = [],
    workingHours,
    isBusy = false,
    onSave
  }: {
    open?: boolean
    sessions?: TaskSession[]
    jiraResults?: JiraIssue[]
    customTaskCategories?: CustomTaskCategory[]
    workingHours: WorkingHoursSchedule
    isBusy?: boolean
    onSave: (transitions: TaskTransitionInput[]) => Promise<void>
  } = $props()

  const safeWorkingHours = $derived(sanitizeWorkingHoursSchedule(workingHours))

  let rows: TransitionDraftRow[] = $state([])
  let wasOpen = $state(false)

  const knownTasksByKey = $derived.by(() => {
    const map = new Map<
      string,
      {
        summary: string
        bookingCode?: string
        taskType: 'jira' | 'custom'
      }
    >()

    for (const issue of jiraResults) {
      map.set(issue.key, {
        summary: issue.summary,
        bookingCode: issue.bookingCode,
        taskType: 'jira'
      })
    }

    for (const category of customTaskCategories) {
      map.set(category.name, {
        summary: category.name,
        bookingCode: category.bookingCode || undefined,
        taskType: 'custom'
      })
    }

    for (const session of sessions) {
      map.set(session.jiraIssueKey, {
        summary: session.jiraIssueSummary,
        bookingCode: session.bookingCode,
        taskType: session.taskType ?? 'jira'
      })
    }

    return map
  })

  const knownTaskOptions = $derived.by(() => {
    const options: Array<{ key: string; summary: string; taskType: 'jira' | 'custom' }> = []
    for (const [key, value] of knownTasksByKey.entries()) {
      options.push({ key, summary: value.summary, taskType: value.taskType })
    }
    return options.sort((a, b) => a.key.localeCompare(b.key))
  })

  const toLocalInput = (iso: string): string => {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
  }

  const nowLocalInput = (): string => {
    const now = new Date()
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
  }

  const toTransitionRows = (items: TaskSession[]): TransitionDraftRow[] => {
    return [...items]
      .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime())
      .map((session) => ({
        id: session.id,
        startLocal: toLocalInput(session.startIso),
        issueKey: session.jiraIssueKey,
        summary: session.jiraIssueSummary,
        bookingCode: session.bookingCode ?? '',
        taskType: session.taskType ?? 'jira'
      }))
  }

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

    const key = (nextKey ?? row.issueKey).trim()
    const known = key ? knownTasksByKey.get(key) : undefined
    if (!known) return

    updateRow(index, {
      summary: row.summary.trim() ? row.summary : known.summary,
      bookingCode: row.bookingCode.trim() ? row.bookingCode : (known.bookingCode ?? ''),
      taskType: known.taskType
    })
  }

  const addRow = (): void => {
    rows = [
      ...rows,
      {
        id: crypto.randomUUID(),
        startLocal: nowLocalInput(),
        issueKey: '',
        summary: '',
        bookingCode: '',
        taskType: 'jira'
      }
    ]
  }

  const removeRow = (index: number): void => {
    rows = rows.filter((_, rowIndex) => rowIndex !== index)
  }

  const rowDurations = $derived(
    rows.map((row, index) => {
      const start = new Date(row.startLocal)
      if (Number.isNaN(start.getTime())) return null

      const next = rows[index + 1]
      if (!next) return 'active'

      const end = new Date(next.startLocal)
      if (Number.isNaN(end.getTime())) return null

      if (end <= start) return null
      const totalMinutes = Math.round(
        calculateWorkingSecondsBetween(start, end, safeWorkingHours) / 60
      )
      if (totalMinutes < 0) return null
      if (totalMinutes < 60) return `${totalMinutes}m`
      const hours = Math.floor(totalMinutes / 60)
      const minutes = totalMinutes % 60
      return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
    })
  )

  const save = async (): Promise<void> => {
    const transitions: TaskTransitionInput[] = []
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const issueKey = row.issueKey.trim()
      const summary = row.summary.trim() || issueKey
      if (!issueKey) {
        toast.error(`Row ${index + 1}: task key is required.`)
        return
      }

      const startDate = new Date(row.startLocal)
      if (Number.isNaN(startDate.getTime())) {
        toast.error(`Row ${index + 1}: start time is invalid.`)
        return
      }

      transitions.push({
        id: row.id,
        issueKey,
        summary,
        bookingCode: row.bookingCode.trim() || undefined,
        taskType: row.taskType,
        startIso: startDate.toISOString()
      })
    }

    transitions.sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime())
    for (let index = 1; index < transitions.length; index += 1) {
      if (transitions[index].startIso === transitions[index - 1].startIso) {
        toast.error('Each transition must have a unique start time.')
        return
      }
    }

    await onSave(transitions)
    open = false
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="overflow-y-auto sm:max-w-5xl">
    <Dialog.Header>
      <Dialog.Title>Task Transition History</Dialog.Title>
      <Dialog.Description>
        Edit task transition start times. Saving will rebuild session history so each task starts
        when the previous one ends.
      </Dialog.Description>
    </Dialog.Header>
    <div class="space-y-3 py-2">
      <div class="rounded-xl border mb-4 overflow-hidden">
        <Table.Root>
          <Table.Header>
            <Table.Row class="bg-muted/30 hover:bg-muted/30">
              <Table.Head class="w-52">Start Time</Table.Head>
              <Table.Head class="w-40">Task</Table.Head>
              <Table.Head>Summary</Table.Head>
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
                    <Label class="sr-only" for={`start-${row.id}`}>Start time</Label>
                    <Input
                      id={`start-${row.id}`}
                      type="datetime-local"
                      value={row.startLocal}
                      onchange={(event) =>
                        updateRow(index, {
                          startLocal: (event.currentTarget as HTMLInputElement).value
                        })}
                    />
                    {#if rowDurations[index] === 'active'}
                      <p class="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">● active</p>
                    {:else if rowDurations[index]}
                      <p class="mt-0.5 text-xs text-muted-foreground">{rowDurations[index]}</p>
                    {/if}
                  </Table.Cell>

                  <Table.Cell class="align-top">
                    <Label class="sr-only" for={`task-${row.id}`}>Task</Label>
                    <Input
                      id={`task-${row.id}`}
                      list="task-transition-options"
                      value={row.issueKey}
                      onchange={(event) => {
                        const nextKey = (event.currentTarget as HTMLInputElement).value
                        updateRow(index, { issueKey: nextKey })
                        applyKnownTask(index, nextKey)
                      }}
                    />
                  </Table.Cell>

                  <Table.Cell class="align-top">
                    <Label class="sr-only" for={`summary-${row.id}`}>Summary</Label>
                    <Input
                      id={`summary-${row.id}`}
                      value={row.summary}
                      onchange={(event) =>
                        updateRow(index, {
                          summary: (event.currentTarget as HTMLInputElement).value
                        })}
                    />
                  </Table.Cell>

                  <Table.Cell class="align-top">
                    <Label class="sr-only" for={`booking-${row.id}`}>Booking code</Label>
                    <Input
                      id={`booking-${row.id}`}
                      value={row.bookingCode}
                      onchange={(event) =>
                        updateRow(index, {
                          bookingCode: (event.currentTarget as HTMLInputElement).value
                        })}
                    />
                  </Table.Cell>

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

      <datalist id="task-transition-options">
        {#each knownTaskOptions as option (option.key)}
          <option value={option.key}>{option.summary}</option>
        {/each}
      </datalist>

      <div class="flex justify-between">
        <Button variant="secondary" onclick={addRow}>
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
