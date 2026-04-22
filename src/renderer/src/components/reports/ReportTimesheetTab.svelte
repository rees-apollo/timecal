<script lang="ts">
  import type { TimesheetRow } from '../../../../shared/report-timesheet'
  import * as Table from '$lib/components/ui/table'
  import { Badge } from '$lib/components/ui/badge'

  let {
    timesheetRows,
    totalMinutes,
    totalOverheadMinutes
  }: {
    timesheetRows: TimesheetRow[]
    totalMinutes: number
    totalOverheadMinutes: number
  } = $props()
</script>

<div class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden pt-2">
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
</div>
