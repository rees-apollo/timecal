<script lang="ts">
  import type { CustomTaskCategory, JiraIssue, TaskSession } from '../../../shared/types'
  import * as Tabs from '$lib/components/ui/tabs'
  import * as Popover from '$lib/components/ui/popover'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import {
    getSortedFilteredCustomTaskCategories,
    getSortedFilteredTicketKeys,
    getTicketSummaryByKey
  } from '$lib/helpers/task-search/options'
  import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down'
  import XIcon from '@lucide/svelte/icons/x'

  type TaskSearchData = {
    jiraResults?: JiraIssue[]
    customTaskCategories?: CustomTaskCategory[]
    sessions?: TaskSession[]
    recentIssueKeys?: string[]
  }

  type TaskSearchSelection = {
    primaryIssueKey?: string
    currentKey?: string
    currentCustomTaskCategory?: string
  }

  type TaskSearchState = {
    jiraQuery: string
    activeTab: 'jira' | 'custom'
  }

  type TaskSearchUi = {
    useSelectionTrigger?: boolean
    triggerLabel?: string
    triggerButtonClass?: string
    popoverContentClass?: string
  }

  let {
    data = {},
    selection = {},
    searchState = $bindable({ jiraQuery: '', activeTab: 'jira' }),
    ui = {},
    disabled = false,
    onClearSelection,
    onSearch,
    onSelectJira,
    onSelectCustomTask
  }: {
    data?: TaskSearchData
    selection?: TaskSearchSelection
    searchState?: TaskSearchState
    ui?: TaskSearchUi
    disabled?: boolean
    onClearSelection?: () => Promise<void> | void
    onSearch?: () => Promise<void>
    onSelectJira?: (key: string) => void
    onSelectCustomTask?: (categoryName: string) => void
  } = $props()

  const jiraResults = $derived(data.jiraResults ?? [])
  const customTaskCategories = $derived(data.customTaskCategories ?? [])
  const sessions = $derived(data.sessions ?? [])
  const recentIssueKeys = $derived(data.recentIssueKeys ?? [])
  const primaryIssueKey = $derived(selection.primaryIssueKey ?? '')
  const currentKey = $derived(selection.currentKey ?? '')
  const currentCustomTaskCategory = $derived(selection.currentCustomTaskCategory ?? '')
  const useSelectionTrigger = $derived(ui.useSelectionTrigger ?? false)
  const triggerLabel = $derived(ui.triggerLabel ?? 'Select task')
  const triggerButtonClass = $derived(
    ui.triggerButtonClass ?? 'h-8 w-[220px] justify-between rounded-full text-sm'
  )
  const popoverContentClass = $derived(ui.popoverContentClass ?? 'w-[320px] p-3')

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let popoverOpen = $state(false)

  const ticketSummaryByKey = (key: string): string | undefined =>
    getTicketSummaryByKey({ key, jiraResults, sessions, customTaskCategories })

  const sortedFilteredTicketKeys = $derived(
    getSortedFilteredTicketKeys({
      jiraQuery: searchState.jiraQuery,
      jiraResults,
      sessions,
      recentIssueKeys,
      customTaskCategories,
      primaryIssueKey,
      currentKey
    })
  )

  const customTicketInput = $derived(searchState.jiraQuery.trim())

  const sortedFilteredCustomTaskCategories = $derived(
    getSortedFilteredCustomTaskCategories({
      jiraQuery: searchState.jiraQuery,
      customTaskCategories,
      currentCustomTaskCategory
    })
  )

  const optionButtonClass = (isActive: boolean): string =>
    `w-full rounded-md border px-2 py-1.5 text-left text-sm hover:bg-muted ${
      isActive ? 'border-primary bg-primary/10 ring-1 ring-primary/40' : ''
    }`

  function handleJiraInput(): void {
    if (!onSearch) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (searchState.jiraQuery.trim().length >= 2) void onSearch!()
    }, 350)
  }

  const hasCurrentSelection = $derived(Boolean(currentKey || currentCustomTaskCategory))
</script>

{#snippet SearchContent()}
  <Tabs.Root bind:value={searchState.activeTab}>
    <Tabs.List class="w-full">
      <Tabs.Trigger value="jira" class="flex-1">Jira</Tabs.Trigger>
      <Tabs.Trigger value="custom" class="flex-1">Custom Tasks</Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="jira" class="mt-2 space-y-2">
      <Input
        bind:value={searchState.jiraQuery}
        placeholder="Search by key or summary"
        oninput={handleJiraInput}
      />
      <div class="max-h-48 space-y-1 overflow-y-auto pr-1">
        {#if customTicketInput}
          <button
            type="button"
            class={optionButtonClass(customTicketInput === currentKey)}
            onclick={() => {
              onSelectJira?.(customTicketInput)
              popoverOpen = false
            }}
          >
            <div class="font-medium">{customTicketInput}</div>
            <div class="text-xs text-muted-foreground">Use typed task key</div>
          </button>
        {/if}
        {#if sortedFilteredTicketKeys.length > 0}
          {#each sortedFilteredTicketKeys as issueKey (issueKey)}
            <button
              type="button"
              class={optionButtonClass(issueKey === currentKey)}
              onclick={() => {
                onSelectJira?.(issueKey)
                popoverOpen = false
              }}
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium">{issueKey}</span>
                {#if issueKey === currentKey}
                  <Badge variant="outline">Active</Badge>
                {:else if primaryIssueKey && issueKey === primaryIssueKey}
                  <Badge variant="default">Primary</Badge>
                {/if}
              </div>
              {#if ticketSummaryByKey(issueKey)}
                <div class="text-xs text-muted-foreground">{ticketSummaryByKey(issueKey)}</div>
              {/if}
            </button>
          {/each}
        {:else}
          <p class="px-1 text-xs text-muted-foreground">No matching tickets.</p>
        {/if}
      </div>
    </Tabs.Content>

    <Tabs.Content value="custom" class="mt-2 space-y-2">
      <Input bind:value={searchState.jiraQuery} placeholder="Search custom task categories" />
      <div class="max-h-48 space-y-1 overflow-y-auto pr-1">
        {#if sortedFilteredCustomTaskCategories.length > 0}
          {#each sortedFilteredCustomTaskCategories as category (category.name)}
            <button
              type="button"
              class={optionButtonClass(category.name === currentCustomTaskCategory)}
              onclick={() => {
                onSelectCustomTask?.(category.name)
                popoverOpen = false
              }}
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium">{category.name}</span>
                {#if category.name === currentCustomTaskCategory}
                  <Badge variant="outline">Active</Badge>
                {:else}
                  <Badge variant="secondary">Custom</Badge>
                {/if}
              </div>
              <div class="mt-0.5 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  class="h-2.5 w-2.5 rounded-full border"
                  style={`background-color: ${category.color};`}
                ></span>
                {category.bookingCode ? `Booking: ${category.bookingCode}` : 'No booking code'}
              </div>
            </button>
          {/each}
        {:else}
          <p class="px-1 text-xs text-muted-foreground">No custom task categories.</p>
        {/if}
      </div>
    </Tabs.Content>
  </Tabs.Root>
{/snippet}

{#if useSelectionTrigger}
  <Popover.Root bind:open={popoverOpen}>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="outline"
          role="combobox"
          aria-expanded={popoverOpen}
          class={triggerButtonClass}
          {disabled}
        >
          <span class="min-w-0 flex-1 truncate text-left text-muted-foreground">{triggerLabel}</span
          >
          <span class="ml-2 inline-flex shrink-0 items-center gap-1">
            {#if hasCurrentSelection && onClearSelection}
              <span
                role="button"
                tabindex="0"
                class="text-muted-foreground hover:text-foreground inline-flex size-5 items-center justify-center rounded-sm"
                aria-label="Clear selected task"
                onclick={async (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  await onClearSelection?.()
                  popoverOpen = false
                }}
                onkeydown={async (event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  event.stopPropagation()
                  await onClearSelection?.()
                  popoverOpen = false
                }}
              >
                <XIcon class="size-3.5" />
              </span>
            {/if}
            <ChevronsUpDownIcon class="size-3.5 opacity-50" />
          </span>
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class={popoverContentClass} onFocusOutside={(e) => e.preventDefault()}>
      {@render SearchContent()}
    </Popover.Content>
  </Popover.Root>
{:else}
  {@render SearchContent()}
{/if}
