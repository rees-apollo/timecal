<script lang="ts">
  import * as Alert from '$lib/components/ui/alert'

  let {
    status = '',
    isError = false
  }: {
    status?: string
    isError?: boolean
  } = $props()
</script>

{#if status}
  <Alert.Root class="mb-4" variant={isError ? 'destructive' : 'default'}>
    <Alert.Title>{isError ? 'Error' : 'Status'}</Alert.Title>
    <Alert.Description>{status}</Alert.Description>
  </Alert.Root>
{/if}
