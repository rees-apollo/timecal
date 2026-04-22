<script lang="ts">
  import type { WorklogDraft } from '../../../shared/types'
  import * as Dialog from '$lib/components/ui/dialog'
  import { Button } from '$lib/components/ui/button'
  import { Label } from '$lib/components/ui/label'
  import { Textarea } from '$lib/components/ui/textarea'

  let {
    draftDialogOpen = $bindable(false),
    draftComment = $bindable(''),
    worklogDraft = null,
    isBusy = false,
    pushWorklog
  }: {
    draftDialogOpen?: boolean
    draftComment?: string
    worklogDraft?: WorklogDraft | null
    isBusy?: boolean
    pushWorklog: () => Promise<void>
  } = $props()
</script>

<Dialog.Root bind:open={draftDialogOpen}>
  <Dialog.Content class="max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Confirm Jira Worklog Push</Dialog.Title>
      <Dialog.Description>Review time before posting to Jira.</Dialog.Description>
    </Dialog.Header>

    {#if worklogDraft}
      <div class="space-y-3 py-2">
        <div class="grid grid-cols-2 gap-2 rounded-xl border p-3 text-sm">
          <div>Issue</div>
          <div class="font-semibold">{worklogDraft.issueKey}</div>
          <div>Time to log</div>
          <div class="font-semibold">
            {Math.max(0, Math.round(worklogDraft.timeSpentSeconds / 60))}m
          </div>
        </div>

        <div>
          <Label for="worklogComment">Worklog Comment</Label>
          <Textarea id="worklogComment" rows={4} bind:value={draftComment} />
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
