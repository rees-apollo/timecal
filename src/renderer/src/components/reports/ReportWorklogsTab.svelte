<script lang="ts">
  import type { BuildWorklogDraftInput, TaskSession } from '../../../../shared/types'
  import * as Table from '$lib/components/ui/table'
  import * as ScrollArea from '$lib/components/ui/scroll-area'
  import * as Tooltip from '$lib/components/ui/tooltip'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'

  let {
    jiraSessionsForSelectedWeek,
    isBusy = false,
    selectedWeekStart,
    selectedWeekEnd,
    selectedWeekKey,
    formatSessionDurationForReports,
    openDraftDialog
  }: {
    jiraSessionsForSelectedWeek: TaskSession[]
    isBusy?: boolean
    selectedWeekStart: Date
    selectedWeekEnd: Date
    selectedWeekKey: string
    formatSessionDurationForReports: (session: TaskSession) => string
    openDraftDialog: (input?: string | BuildWorklogDraftInput) => Promise<void>
  } = $props()
</script>

<div class="flex min-h-0 flex-1 flex-col gap-2 pt-2">
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
              <Table.Cell>{formatSessionDurationForReports(session)}</Table.Cell>
              <Table.Cell>
                <Tooltip.Provider>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      <Button
                        size="sm"
                        variant="outline"
                        onclick={() =>
                          openDraftDialog({
                            sessionId: session.id,
                            rangeStartIso: selectedWeekStart.toISOString(),
                            rangeEndIso: selectedWeekEnd.toISOString(),
                            weekStartKey: selectedWeekKey
                          })}
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
</div>
