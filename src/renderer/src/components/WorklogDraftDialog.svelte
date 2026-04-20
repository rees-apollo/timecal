<script lang="ts">
  import type { WorklogDraft } from '../../../shared/types'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Table from '$lib/components/ui/table'
  import { Button } from '$lib/components/ui/button'
  import { Label } from '$lib/components/ui/label'
  import { Textarea } from '$lib/components/ui/textarea'

  let {
    draftDialogOpen = $bindable(false),
    draftComment = $bindable(''),
    worklogDraft = null,
    isBusy = false,
    pushWorklog,
    formatMinutes
  }: {
    draftDialogOpen?: boolean
    draftComment?: string
    worklogDraft?: WorklogDraft | null
    isBusy?: boolean
    pushWorklog: () => Promise<void>
    formatMinutes: (seconds: number) => string
  } = $props()
</script>

<Dialog.Root bind:open={draftDialogOpen}>
  <Dialog.Content class="max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Confirm Jira Worklog Push</Dialog.Title>
      <Dialog.Description>
        Review calculated time before posting. Off-task and unrelated meeting time is subtracted
        from gross session duration.
      </Dialog.Description>
    </Dialog.Header>

    {#if worklogDraft}
      <div class="space-y-3 py-2">
        <div class="grid grid-cols-2 gap-2 rounded-xl border p-3 text-sm">
          <div>Issue</div>
          <div class="font-semibold">{worklogDraft.issueKey}</div>
          <div>On-task</div>
          <div class="font-semibold">{formatMinutes(worklogDraft.secondsOnTask)}</div>
          <div>Off-task</div>
          <div class="font-semibold">{formatMinutes(worklogDraft.secondsCustomTask)}</div>
        </div>

        <div>
          <Label for="worklogComment">Worklog Comment</Label>
          <Textarea id="worklogComment" rows={4} bind:value={draftComment} />
        </div>

        <div class="rounded-xl border p-3">
          <p class="mb-2 text-xs font-semibold uppercase tracking-widest">Off-task Breakdown</p>
          {#if worklogDraft.detailBreakdown.length === 0}
            <p class="text-sm">No off-task deductions applied.</p>
          {:else}
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Category</Table.Head>
                  <Table.Head>Booking Code</Table.Head>
                  <Table.Head class="text-right">Minutes</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each worklogDraft.detailBreakdown as row (`${row.category}-${row.minutes}`)}
                  <Table.Row>
                    <Table.Cell>{row.category}</Table.Cell>
                    <Table.Cell>{row.bookingCode ?? '—'}</Table.Cell>
                    <Table.Cell class="text-right">{row.minutes}m</Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          {/if}
        </div>
      </div>
    {/if}

    <Dialog.Footer>
      <Button variant="secondary" onclick={() => (draftDialogOpen = false)}>Cancel</Button>
      <Button disabled={isBusy || !worklogDraft} onclick={pushWorklog}
        >Confirm & Push to Jira</Button
      >
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
