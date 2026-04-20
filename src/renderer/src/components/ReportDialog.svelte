<script lang="ts">
  import type { AppSnapshot, WorkingHoursSchedule } from '../../../shared/types'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Tabs from '$lib/components/ui/tabs'
  import * as Table from '$lib/components/ui/table'
  import * as ScrollArea from '$lib/components/ui/scroll-area'
  import * as Tooltip from '$lib/components/ui/tooltip'
  import * as Accordion from '$lib/components/ui/accordion'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { Input } from '$lib/components/ui/input'
  import {
    calculateWorkingSecondsBetween,
    getWorkingTimeSegments,
    sanitizeWorkingHoursSchedule,
    toLocalDateKey
  } from '../../../shared/working-hours'

  let {
    open = $bindable(false),
    snapshot = null,
    isBusy = false,
    openDraftDialog,
    saveWeeklyWorkingHours
  }: {
    open?: boolean
    snapshot?: AppSnapshot | null
    isBusy?: boolean
    openDraftDialog: (sessionId?: string) => Promise<void>
    saveWeeklyWorkingHours: (weekStartKey: string, schedule?: WorkingHoursSchedule) => Promise<void>
  } = $props()

  const sessions = $derived(snapshot?.state.sessions ?? [])
  const jiraSessions = $derived(
    sessions.filter((session) => (session.taskType ?? 'jira') === 'jira')
  )
  const defaultWorkingHours = $derived(
    sanitizeWorkingHoursSchedule(snapshot?.state.settings.workingHours)
  )
  const weeklyWorkingHoursOverrides = $derived(snapshot?.state.weeklyWorkingHoursOverrides ?? {})
  const calendarEvents = $derived(snapshot?.state.calendarEvents ?? [])
  const calendarLinks = $derived(snapshot?.state.calendarLinks ?? [])
  const manualCustomTaskEntries = $derived(snapshot?.state.manualCustomTaskEntries ?? [])
  const customTaskCategories = $derived(snapshot?.state.settings.customTaskCategories ?? [])

  interface BookingBreakdown {
    code: string
    minutes: number
  }

  interface TimesheetRow {
    dayKey: string
    day: string
    bookings: BookingBreakdown[]
    bookedMinutes: number
    overheadMinutes: number
    totalMinutes: number
    isEmpty: boolean
  }

  function getWeekStart(): Date {
    const now = new Date()
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const d = new Date(now)
    d.setDate(d.getDate() + diff)
    d.setHours(0, 0, 0, 0)
    return d
  }

  function getWeekDays(start: Date): Date[] {
    const days: Date[] = []
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      d.setHours(0, 0, 0, 0)
      days.push(d)
    }
    return days
  }

  let weekOffset = $state(0)

  const selectedWeekStart = $derived(
    (() => {
      const d = getWeekStart()
      d.setDate(d.getDate() + weekOffset * 7)
      return d
    })()
  )

  const selectedWeekEnd = $derived(
    (() => {
      const d = new Date(selectedWeekStart)
      d.setDate(d.getDate() + 7)
      return d
    })()
  )

  const selectedWeekKey = $derived(toLocalDateKey(selectedWeekStart))
  const effectiveWorkingHours = $derived(
    sanitizeWorkingHoursSchedule(
      weeklyWorkingHoursOverrides[selectedWeekKey] ?? defaultWorkingHours
    )
  )
  let weekOverrideDraft: WorkingHoursSchedule = $state(
    sanitizeWorkingHoursSchedule(defaultWorkingHours)
  )

  $effect(() => {
    weekOverrideDraft = sanitizeWorkingHoursSchedule(
      weeklyWorkingHoursOverrides[selectedWeekKey] ?? defaultWorkingHours
    )
  })

  const weekdays: Array<{ key: keyof WorkingHoursSchedule; label: string }> = [
    { key: 'monday', label: 'Mon' },
    { key: 'tuesday', label: 'Tue' },
    { key: 'wednesday', label: 'Wed' },
    { key: 'thursday', label: 'Thu' },
    { key: 'friday', label: 'Fri' },
    { key: 'saturday', label: 'Sat' },
    { key: 'sunday', label: 'Sun' }
  ]

  const saveWeekSchedule = async (): Promise<void> => {
    await saveWeeklyWorkingHours(selectedWeekKey, sanitizeWorkingHoursSchedule(weekOverrideDraft))
  }

  const resetWeekToDefault = async (): Promise<void> => {
    await saveWeeklyWorkingHours(selectedWeekKey)
  }

  const formatSessionDurationForReports = (startIso: string, endIso?: string): string => {
    const start = new Date(startIso)
    const end = new Date(endIso ?? new Date().toISOString())
    const clippedStart = new Date(Math.max(start.getTime(), selectedWeekStart.getTime()))
    const clippedEnd = new Date(Math.min(end.getTime(), selectedWeekEnd.getTime()))
    if (clippedEnd <= clippedStart) return '0m'

    const mins = Math.max(
      0,
      Math.floor(
        calculateWorkingSecondsBetween(clippedStart, clippedEnd, effectiveWorkingHours) / 60
      )
    )
    return `${mins}m`
  }

  const selectedWeekLabel = $derived(
    (() => {
      const endInclusive = new Date(selectedWeekEnd)
      endInclusive.setDate(endInclusive.getDate() - 1)
      const startLabel = selectedWeekStart.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      })
      const endLabel = endInclusive.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      })
      return `${startLabel} - ${endLabel}`
    })()
  )

  const jiraSessionsForSelectedWeek = $derived(
    [...jiraSessions]
      .filter((session) => {
        const start = new Date(session.startIso)
        const end = new Date(session.endIso ?? new Date().toISOString())
        return end > selectedWeekStart && start < selectedWeekEnd
      })
      .sort((a, b) => new Date(b.startIso).getTime() - new Date(a.startIso).getTime())
  )

  const timesheetRows = $derived(
    (() => {
      const weekDays = getWeekDays(selectedWeekStart)
      const bookingMinutesByDay = new Map<string, Map<string, number>>()
      const overheadMinutesByDay = new Map<string, number>()

      const addBookingMinutes = (dayKey: string, bookingCode: string, minutes: number): void => {
        if (minutes <= 0) return
        const dayBookings = bookingMinutesByDay.get(dayKey) ?? new Map<string, number>()
        dayBookings.set(bookingCode, (dayBookings.get(bookingCode) ?? 0) + minutes)
        bookingMinutesByDay.set(dayKey, dayBookings)
      }

      const addOverheadMinutes = (dayKey: string, minutes: number): void => {
        if (minutes <= 0) return
        overheadMinutesByDay.set(dayKey, (overheadMinutesByDay.get(dayKey) ?? 0) + minutes)
      }

      const categoryBookingCodeByName = new Map(
        customTaskCategories.map((category) => [category.name, category.bookingCode] as const)
      )

      const eventLinkById = new Map(calendarLinks.map((link) => [link.eventId, link] as const))

      for (const session of sessions) {
        const start = new Date(session.startIso)
        const end = session.endIso ? new Date(session.endIso) : new Date()
        const clippedStart = new Date(Math.max(start.getTime(), selectedWeekStart.getTime()))
        const clippedEnd = new Date(Math.min(end.getTime(), selectedWeekEnd.getTime()))
        if (clippedEnd <= clippedStart) continue

        const bookingCode = session.bookingCode?.trim() || 'Unassigned'
        const segments = getWorkingTimeSegments(clippedStart, clippedEnd, effectiveWorkingHours)
        for (const segment of segments) {
          const mins = Math.max(0, Math.floor(segment.seconds / 60))
          addBookingMinutes(segment.dayKey, bookingCode, mins)
        }
      }

      for (const event of calendarEvents) {
        const link = eventLinkById.get(event.id)
        const classification = String(link?.classification ?? '')
        // Legacy persisted states may still use "off-task" as the classification label.
        const isCustomTask = classification === 'custom-task' || classification === 'off-task'
        if (!isCustomTask) continue

        const start = new Date(event.startIso)
        if (start < selectedWeekStart || start >= selectedWeekEnd) continue
        const end = new Date(event.endIso)
        const mins =
          (event.source === 'off-task' || event.source === 'planning') &&
          typeof event.plannedMinutes === 'number' &&
          Number.isFinite(event.plannedMinutes)
            ? Math.max(0, Math.floor(event.plannedMinutes))
            : Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000))
        const category = link?.customTaskCategory
        const bookingCode = category ? categoryBookingCodeByName.get(category)?.trim() : undefined
        const dayKey = toLocalDateKey(start)
        if (bookingCode) {
          addBookingMinutes(dayKey, bookingCode, mins)
        } else {
          addOverheadMinutes(dayKey, mins)
        }
      }

      for (const entry of manualCustomTaskEntries) {
        const entryDate = new Date(`${entry.date}T00:00:00`)
        if (entryDate < selectedWeekStart || entryDate >= selectedWeekEnd) continue
        const mins = Math.max(0, Math.floor(entry.minutes))
        const bookingCode = categoryBookingCodeByName.get(entry.category)?.trim()
        const dayKey = toLocalDateKey(entryDate)
        if (bookingCode) {
          addBookingMinutes(dayKey, bookingCode, mins)
        } else {
          addOverheadMinutes(dayKey, mins)
        }
      }

      const rows: TimesheetRow[] = []
      for (const day of weekDays) {
        const dayKey = toLocalDateKey(day)
        const dayBookings = [...(bookingMinutesByDay.get(dayKey)?.entries() ?? [])]
          .map(([code, minutes]) => ({ code, minutes }))
          .sort((a, b) => b.minutes - a.minutes)
        const bookedMinutes = dayBookings.reduce((acc, entry) => acc + entry.minutes, 0)
        const overheadMinutes = overheadMinutesByDay.get(dayKey) ?? 0
        const totalMinutes = bookedMinutes + overheadMinutes

        rows.push({
          dayKey,
          day: day.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
          }),
          bookings: dayBookings,
          bookedMinutes,
          overheadMinutes,
          totalMinutes,
          isEmpty: totalMinutes === 0
        })
      }

      return rows
    })()
  )

  const totalMinutes = $derived(timesheetRows.reduce((acc, r) => acc + r.totalMinutes, 0))
  const totalOverheadMinutes = $derived(
    timesheetRows.reduce((acc, r) => acc + r.overheadMinutes, 0)
  )
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="flex max-h-[90vh] w-[min(96vw,56rem)] flex-col overflow-hidden sm:max-w-4xl"
  >
    <Dialog.Header>
      <Dialog.Title>Reports</Dialog.Title>
    </Dialog.Header>

    <div class="flex flex-col gap-2 py-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-muted-foreground text-xs">Selected week: {selectedWeekLabel}</div>
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onclick={() => (weekOffset -= 1)}>Previous</Button>
          <Button
            variant="outline"
            size="sm"
            disabled={weekOffset === 0}
            onclick={() => (weekOffset += 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Accordion.Root type="single" collapsible class="rounded-md border" value="">
        <Accordion.Item value="week-hours">
          <Accordion.Trigger class="px-3 py-2 no-underline hover:no-underline">
            Week Timing Override ({selectedWeekLabel})
          </Accordion.Trigger>
          <Accordion.Content>
            <div class="border-t p-3 pt-2">
              <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
                <p class="text-muted-foreground text-xs">
                  Edits here update both Work Logs and Timesheet for the selected week.
                </p>
                <div class="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onclick={resetWeekToDefault}>Use Default</Button
                  >
                  <Button size="sm" disabled={isBusy} onclick={saveWeekSchedule}>Save Week Hours</Button>
                </div>
              </div>
              <div class="w-full overflow-x-auto">
                <div class="min-w-[360px] grid gap-2">
                  <div
                    class="grid grid-cols-[50px_1fr_1fr] gap-2 text-xs font-medium text-muted-foreground"
                  >
                    <span>Day</span>
                    <span>Start</span>
                    <span>End</span>
                  </div>
                  {#each weekdays as day (day.key)}
                    <div class="grid grid-cols-[50px_1fr_1fr] items-center gap-2">
                      <span class="text-xs font-medium">{day.label}</span>
                      <Input type="time" bind:value={weekOverrideDraft[day.key].start} />
                      <Input type="time" bind:value={weekOverrideDraft[day.key].end} />
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    </div>

    <Tabs.Root value="worklogs" class="flex min-h-0 flex-1 flex-col">
      <Tabs.List>
        <Tabs.Trigger value="worklogs">Work Logs</Tabs.Trigger>
        <Tabs.Trigger value="timesheet">Timesheet</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="worklogs" class="flex min-h-0 flex-1 flex-col gap-2 pt-2">
        <ScrollArea.Root class="min-h-0 flex-1 rounded-md border">
          <div class="w-full overflow-x-auto">
            <Table.Root class="min-w-[640px]">
              <Table.Header>
                <Table.Row>
                  <Table.Head>Ticket</Table.Head>
                  <Table.Head>Summary</Table.Head>
                  <Table.Head>Duration</Table.Head>
                  <Table.Head>Worklog</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each jiraSessionsForSelectedWeek as session (session.id)}
                  <Table.Row>
                    <Table.Cell>
                      <Badge variant="outline">{session.jiraIssueKey}</Badge>
                    </Table.Cell>
                    <Table.Cell>{session.jiraIssueSummary}</Table.Cell>
                    <Table.Cell
                      >{formatSessionDurationForReports(
                        session.startIso,
                        session.endIso
                      )}</Table.Cell
                    >
                    <Table.Cell>
                      <Tooltip.Provider>
                        <Tooltip.Root>
                          <Tooltip.Trigger>
                            <Button
                              size="sm"
                              variant="outline"
                              onclick={() => openDraftDialog(session.id)}
                            >
                              Push to Jira
                            </Button>
                          </Tooltip.Trigger>
                          <Tooltip.Content>
                            <p>Draft worklog for this session</p>
                          </Tooltip.Content>
                        </Tooltip.Root>
                      </Tooltip.Provider>
                    </Table.Cell>
                  </Table.Row>
                {/each}
                {#if jiraSessionsForSelectedWeek.length === 0}
                  <Table.Row>
                    <Table.Cell colspan={4} class="text-muted-foreground py-8 text-center text-sm">
                      No Jira sessions in the selected week.
                    </Table.Cell>
                  </Table.Row>
                {/if}
              </Table.Body>
            </Table.Root>
          </div>
        </ScrollArea.Root>
        <Button
          variant="outline"
          class="w-full"
          disabled={isBusy || jiraSessionsForSelectedWeek.length === 0}
          onclick={() => openDraftDialog()}
        >
          Draft All Sessions
        </Button>
      </Tabs.Content>

      <Tabs.Content
        value="timesheet"
        class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden pt-2"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <p class="text-muted-foreground text-xs">
            Total this week: {(totalMinutes / 60).toFixed(2)}h
            <span class="text-muted-foreground font-normal"> | </span>
            <span class="text-red-600">Overhead: {(totalOverheadMinutes / 60).toFixed(2)}h</span>
          </p>
          <div class="text-muted-foreground text-xs">Hours based on selected week timing.</div>
        </div>

        <div class="min-h-0 flex-1 overflow-auto rounded-md border">
          <div class="w-full overflow-x-auto">
            <Table.Root class="min-w-[720px]">
              <Table.Header>
                <Table.Row>
                  <Table.Head>Day</Table.Head>
                  <Table.Head>Booking Codes</Table.Head>
                  <Table.Head class="text-right">Total</Table.Head>
                  <Table.Head class="text-right">Overhead</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each timesheetRows as row (row.dayKey)}
                  <Table.Row>
                    <Table.Cell class={row.isEmpty ? 'text-muted-foreground' : ''}>
                      {row.day}
                    </Table.Cell>
                    <Table.Cell>
                      {#if row.bookings.length === 0}
                        <span class="text-muted-foreground">—</span>
                      {:else}
                        <div class="space-y-1.5">
                          {#each row.bookings as booking (`${row.dayKey}-${booking.code}`)}
                            <div
                              class="bg-muted/40 border-border/70 flex items-center justify-between rounded-md border px-2 py-1"
                            >
                              <Badge variant="outline" class="font-mono text-[11px] leading-none"
                                >{booking.code}</Badge
                              >
                              <span class="font-mono text-xs tabular-nums"
                                >{(booking.minutes / 60).toFixed(2)}h</span
                              >
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </Table.Cell>
                    <Table.Cell class="text-right font-mono">
                      {row.isEmpty ? '—' : `${(row.totalMinutes / 60).toFixed(2)}h`}
                    </Table.Cell>
                    <Table.Cell
                      class={`text-right font-mono ${row.overheadMinutes > 0 ? 'text-red-600' : 'text-muted-foreground'}`}
                    >
                      {row.overheadMinutes > 0 ? `${(row.overheadMinutes / 60).toFixed(2)}h` : '—'}
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        </div>
      </Tabs.Content>
    </Tabs.Root>
  </Dialog.Content>
</Dialog.Root>
