<script lang="ts">
  import type { DateValue } from '@internationalized/date'
  import type { DayTimeline, IntervalKind } from '../../../../shared/report-day-overview'
  import * as Popover from '$lib/components/ui/popover'
  import * as Calendar from '$lib/components/ui/calendar'
  import * as Table from '$lib/components/ui/table'
  import { Button } from '$lib/components/ui/button'
  import CalendarIcon from '@lucide/svelte/icons/calendar'

  let {
    dayPickerOpen = $bindable(false),
    dayPickerValue = $bindable(),
    dayKey,
    dayTimeline,
    formatDayLabel,
    formatDurationBetween,
    kindBadgeClass
  }: {
    dayPickerOpen?: boolean
    dayPickerValue: DateValue
    dayKey: string
    dayTimeline: DayTimeline
    formatDayLabel: (value: string) => string
    formatDurationBetween: (startMs: number, endMs: number) => string
    kindBadgeClass: (kind: IntervalKind) => string
  } = $props()
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3 pt-2">
  <div class="flex items-end justify-between gap-3 rounded-xl border p-3">
    <div class="space-y-1">
      <Popover.Root bind:open={dayPickerOpen}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              id="report-timeline-day"
              variant="outline"
              class="w-52 justify-start text-left font-normal"
            >
              <CalendarIcon class="mr-2 size-4" />
              <span>{formatDayLabel(dayKey)}</span>
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-auto p-0" align="start">
          <Calendar.Calendar
            bind:value={dayPickerValue}
            onValueChange={() => {
              dayPickerOpen = false
            }}
          />
        </Popover.Content>
      </Popover.Root>
    </div>
    <div class="text-right text-xs text-muted-foreground">
      <div>Workday: {dayTimeline.workdayLabel}</div>
      <div>Total: {formatDurationBetween(0, dayTimeline.totalMinutes * 60_000)}</div>
    </div>
  </div>

  <div class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
    <div class="rounded-lg border p-2">Active task: {dayTimeline.activeMinutes}m</div>
    <div class="rounded-lg border p-2">Meetings: {dayTimeline.meetingMinutes}m</div>
    <div class="rounded-lg border p-2">Lunch: {dayTimeline.lunchMinutes}m</div>
    <div class="rounded-lg border p-2">No work: {dayTimeline.noWorkMinutes}m</div>
    <div class="rounded-lg border p-2">Overlap flags: {dayTimeline.overlapConflicts}</div>
  </div>

  {#if dayTimeline.rows.length === 0}
    <p class="rounded-lg border px-3 py-4 text-sm text-muted-foreground">
      {dayTimeline.workdayLabel || 'No timeline entries for this day.'}
    </p>
  {:else}
    <div class="min-h-0 flex-1 overflow-auto rounded-xl border">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Time</Table.Head>
            <Table.Head>Duration</Table.Head>
            <Table.Head>Type</Table.Head>
            <Table.Head>Detail</Table.Head>
            <Table.Head>Assigned To</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each dayTimeline.rows as row (`${row.startIso}-${row.endIso}-${row.kind}`)}
            <Table.Row>
              <Table.Cell class="whitespace-nowrap">{row.startLabel} - {row.endLabel}</Table.Cell>
              <Table.Cell class="whitespace-nowrap text-muted-foreground"
                >{row.durationLabel}</Table.Cell
              >
              <Table.Cell>
                <span
                  class={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${kindBadgeClass(row.kind)}`}
                >
                  {row.kind}
                </span>
              </Table.Cell>
              <Table.Cell>
                <div class="font-medium">{row.title}</div>
                {#if row.subtitle}
                  <div class="text-xs text-muted-foreground">{row.subtitle}</div>
                {/if}
              </Table.Cell>
              <Table.Cell class="text-xs">
                <div>{row.assignedTaskLabel}</div>
                {#if row.isOverlapConflict}
                  <div class="font-semibold text-destructive">overlap</div>
                {/if}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {/if}
</div>
