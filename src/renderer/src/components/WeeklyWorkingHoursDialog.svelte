<script lang="ts">
  import type { AppSnapshot, WorkingHoursSchedule } from '../../../shared/types'
  import { DEFAULT_SETTINGS } from '../../../shared/defaults'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Table from '$lib/components/ui/table'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { getWeekRangeLabel } from '../../../shared/report-week'
  import {
    getSelectedWeekEndExclusive,
    getSelectedWeekStart,
    REPORT_WEEKDAYS
  } from '$lib/helpers/report-dialog/week-utils'
  import { sanitizeWorkingHoursSchedule, toLocalDateKey } from '../../../shared/working-hours'

  let {
    open = $bindable(false),
    snapshot = null,
    isBusy = false,
    saveWeeklyWorkingHours
  }: {
    open?: boolean
    snapshot?: AppSnapshot | null
    isBusy?: boolean
    saveWeeklyWorkingHours: (weekStartKey: string, schedule?: WorkingHoursSchedule) => Promise<void>
  } = $props()

  const defaultWorkingHours = $derived(
    sanitizeWorkingHoursSchedule(snapshot?.state.settings.workingHours)
  )
  const weeklyWorkingHoursOverrides = $derived(snapshot?.state.weeklyWorkingHoursOverrides ?? {})

  let weekOffset = $state(0)
  const weekdays = REPORT_WEEKDAYS

  const selectedWeekStart = $derived(getSelectedWeekStart(weekOffset))
  const selectedWeekEnd = $derived(getSelectedWeekEndExclusive(selectedWeekStart))
  const selectedWeekKey = $derived(toLocalDateKey(selectedWeekStart))
  const selectedWeekLabel = $derived(getWeekRangeLabel(selectedWeekStart, selectedWeekEnd))

  const updateWeekOverrideLunchDuration = (
    dayKey: keyof WorkingHoursSchedule,
    rawValue: string
  ): void => {
    const parsed = Number.parseInt(rawValue, 10)
    weekOverrideDraft = {
      ...weekOverrideDraft,
      [dayKey]: {
        ...weekOverrideDraft[dayKey],
        lunchDurationMins:
          rawValue.trim() === '' || Number.isNaN(parsed)
            ? undefined
            : Math.max(0, Math.min(240, Math.round(parsed)))
      }
    }
  }

  // eslint-disable-next-line svelte/prefer-writable-derived -- draft is two-way bound to input fields
  let weekOverrideDraft: WorkingHoursSchedule = $state(
    sanitizeWorkingHoursSchedule(DEFAULT_SETTINGS.workingHours)
  )

  $effect(() => {
    weekOverrideDraft = sanitizeWorkingHoursSchedule(
      weeklyWorkingHoursOverrides[selectedWeekKey] ?? defaultWorkingHours
    )
  })
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="w-[min(96vw,44rem)] sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Weekly Working Hours</Dialog.Title>
      <Dialog.Description>
        Set custom working hours for a specific week to adjust report calculations.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-1">
          <Button variant="outline" size="sm" onclick={() => (weekOffset -= 1)}>Previous</Button>
          <span class="text-muted-foreground px-2 text-xs">{selectedWeekLabel}</span>
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

      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Day</Table.Head>
            <Table.Head>Start</Table.Head>
            <Table.Head>End</Table.Head>
            <Table.Head>Lunch (min)</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each weekdays as day (day.key)}
            <Table.Row>
              <Table.Cell class="font-medium">{day.label}</Table.Cell>
              <Table.Cell>
                <Input type="time" bind:value={weekOverrideDraft[day.key].start} />
              </Table.Cell>
              <Table.Cell>
                <Input type="time" bind:value={weekOverrideDraft[day.key].end} />
              </Table.Cell>
              <Table.Cell>
                <Input
                  type="number"
                  min="0"
                  max="240"
                  placeholder="60"
                  value={weekOverrideDraft[day.key].lunchDurationMins ?? ''}
                  oninput={(e) =>
                    updateWeekOverrideLunchDuration(
                      day.key,
                      (e.currentTarget as HTMLInputElement).value
                    )}
                />
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-muted-foreground text-xs">
          Applies to Work Logs and Timesheet totals for the selected week.
        </p>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy}
            onclick={() => saveWeeklyWorkingHours(selectedWeekKey)}
          >
            Use Default
          </Button>
          <Button
            size="sm"
            disabled={isBusy}
            onclick={() =>
              saveWeeklyWorkingHours(
                selectedWeekKey,
                sanitizeWorkingHoursSchedule(weekOverrideDraft)
              )}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
