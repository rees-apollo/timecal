<script lang="ts">
  import type { WorkingHoursSchedule } from '../../../../shared/types'
  import * as Popover from '$lib/components/ui/popover'
  import * as Table from '$lib/components/ui/table'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'

  let {
    isBusy = false,
    weekdays,
    weekOverrideDraft = $bindable(),
    resetWeekToDefault,
    saveWeekSchedule
  }: {
    isBusy?: boolean
    weekdays: Array<{ key: keyof WorkingHoursSchedule; label: string }>
    weekOverrideDraft: WorkingHoursSchedule
    resetWeekToDefault: () => Promise<void>
    saveWeekSchedule: () => Promise<void>
  } = $props()
</script>

<Popover.Root>
  <Popover.Trigger>
    <Button variant="outline" size="sm">Override Hours</Button>
  </Popover.Trigger>
  <Popover.Content class="w-96" align="end">
    <div class="space-y-3">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Day</Table.Head>
            <Table.Head>Start</Table.Head>
            <Table.Head>End</Table.Head>
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
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-muted-foreground text-xs">
          Updates Work Logs and Timesheet for the selected week.
        </p>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={isBusy} onclick={resetWeekToDefault}>
            Use Default
          </Button>
          <Button size="sm" disabled={isBusy} onclick={saveWeekSchedule}>Save</Button>
        </div>
      </div>
    </div>
  </Popover.Content>
</Popover.Root>
