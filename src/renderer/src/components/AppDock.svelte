<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import TaskSearch from './TaskSearch.svelte'
  import CogIcon from '@lucide/svelte/icons/settings'
  import BarChartIcon from '@lucide/svelte/icons/bar-chart-2'
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
  import HistoryIcon from '@lucide/svelte/icons/history'
  import Clock3Icon from '@lucide/svelte/icons/clock-3'
  import SunIcon from '@lucide/svelte/icons/sun'
  import MoonIcon from '@lucide/svelte/icons/moon'
  import { mode } from 'mode-watcher'
  import { appState } from '$lib/stores/app-state.svelte'

  let {
    onOpenSettings,
    onToggleTheme,
    onPullCalendar,
    onClearSelection,
    onSearchIssues,
    onSelectIssue,
    onSelectCustomTask,
    onOpenTransitions,
    onOpenReports,
    onOpenWeeklyOverrides
  }: {
    onOpenSettings: () => void
    onToggleTheme: () => void
    onPullCalendar: () => Promise<void>
    onClearSelection: () => Promise<void>
    onSearchIssues: () => Promise<void>
    onSelectIssue: (key: string) => Promise<void>
    onSelectCustomTask: (categoryName: string) => Promise<void>
    onOpenTransitions: () => void
    onOpenReports: () => void
    onOpenWeeklyOverrides: () => void
  } = $props()

  const isDarkMode = $derived(mode.current === 'dark')

  const dockTaskSearchData = $derived({
    jiraResults: appState.jiraResults,
    customTaskCategories: appState.settings.customTaskCategories,
    sessions: appState.enrichedSessions,
    recentIssueKeys: appState.snapshot?.state.recentIssueKeys ?? [],
    jiraIssueCache: appState.snapshot?.state.jiraIssueCache ?? {}
  })

  const dockTaskSearchSelection = $derived({
    primaryIssueKey: appState.activeIssueKey,
    currentKey: appState.activeIssueKey,
    currentCustomTaskCategory: ''
  })

  const dockTaskSearchUi = $derived({
    useSelectionTrigger: true,
    triggerLabel: appState.activeIssueLabel,
    triggerButtonClass: 'h-8 w-[220px] justify-between rounded-full text-sm',
    popoverContentClass: 'w-[320px] p-3'
  })
</script>

<div class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
  <div
    class="bg-background/95 supports-[backdrop-filter]:bg-background/80 flex items-center gap-2 rounded-full border px-4 py-2 shadow-lg backdrop-blur text-muted-foreground"
  >
    <Button variant="ghost" size="icon" class="rounded-full" onclick={onOpenSettings}>
      <CogIcon class="size-4" />
      <span class="sr-only">Settings</span>
    </Button>

    <Button variant="ghost" size="icon" class="rounded-full" onclick={onToggleTheme}>
      {#if isDarkMode}
        <SunIcon class="size-4" />
        <span class="sr-only">Switch to day mode</span>
      {:else}
        <MoonIcon class="size-4" />
        <span class="sr-only">Switch to night mode</span>
      {/if}
    </Button>

    <Button
      variant="ghost"
      size="icon"
      class="rounded-full"
      disabled={appState.isBusy}
      onclick={onPullCalendar}
    >
      <RefreshCwIcon class="size-4" />
      <span class="sr-only">Pull Calendar</span>
    </Button>

    <div class="bg-border h-6 w-px"></div>

    <TaskSearch
      data={dockTaskSearchData}
      selection={dockTaskSearchSelection}
      bind:searchState={appState.dockSearchState}
      ui={dockTaskSearchUi}
      disabled={appState.isBusy}
      {onClearSelection}
      onSearch={onSearchIssues}
      onSelectJira={onSelectIssue}
      {onSelectCustomTask}
    />

    <div class="bg-border h-6 w-px"></div>

    <Button variant="ghost" size="icon" class="rounded-full" onclick={onOpenTransitions}>
      <HistoryIcon class="size-4" />
      <span class="sr-only">Edit task transitions</span>
    </Button>

    <Button variant="ghost" size="icon" class="rounded-full" onclick={onOpenReports}>
      <BarChartIcon class="size-4" />
      <span class="sr-only">Reports</span>
    </Button>

    <Button variant="ghost" size="icon" class="rounded-full" onclick={onOpenWeeklyOverrides}>
      <Clock3Icon class="size-4" />
      <span class="sr-only">Weekly hours overrides</span>
    </Button>
  </div>
</div>
