<script lang="ts">
  import type { TaskSession } from '../../../shared/types'
  import * as Card from '$lib/components/ui/card'
  import * as ScrollArea from '$lib/components/ui/scroll-area'
  import * as Table from '$lib/components/ui/table'
  import * as Tooltip from '$lib/components/ui/tooltip'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'

  let {
    sessions,
    formatDuration,
    openDraftDialog
  }: {
    sessions: TaskSession[]
    formatDuration: (startIso: string, endIso?: string) => string
    openDraftDialog: (sessionId?: string) => Promise<void>
  } = $props()
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Tracked Sessions</Card.Title>
  </Card.Header>
  <Card.Content>
    <ScrollArea.Root class="h-[260px] border rounded-md">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Ticket</Table.Head>
            <Table.Head>Summary</Table.Head>
            <Table.Head>Duration</Table.Head>
            <Table.Head>Worklog</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each [...sessions].reverse() as session (session.id)}
            <Table.Row>
              <Table.Cell>
                <Badge variant="outline">{session.jiraIssueKey}</Badge>
              </Table.Cell>
              <Table.Cell>{session.jiraIssueSummary}</Table.Cell>
              <Table.Cell>{formatDuration(session.startIso, session.endIso)}</Table.Cell>
              <Table.Cell>
                <Tooltip.Provider>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      <Button
                        size="sm"
                        variant="outline"
                        onclick={() => openDraftDialog(session.id)}>Draft</Button
                      >
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      <p>Draft worklog for this session</p>
                    </Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </ScrollArea.Root>
  </Card.Content>
</Card.Root>
