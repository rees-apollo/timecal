<script lang="ts">
  import type { CustomTaskCategory, JiraIssue, TaskSession } from '../../../shared/types'
  import { Button } from '$lib/components/ui/button'
  import TaskSearch from './TaskSearch.svelte'
  import CogIcon from '@lucide/svelte/icons/settings'
  import BarChartIcon from '@lucide/svelte/icons/bar-chart-2'
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
  import HistoryIcon from '@lucide/svelte/icons/history'
  import Clock3Icon from '@lucide/svelte/icons/clock-3'
  import SunIcon from '@lucide/svelte/icons/sun'
  import MoonIcon from '@lucide/svelte/icons/moon'

  type DockTaskSearchState = {
    jiraQuery: string
    activeTab: 'jira' | 'custom'
  }

  type DockTaskSearchData = {
    jiraResults: JiraIssue[]
    customTaskCategories: CustomTaskCategory[]
    sessions: TaskSession[]
    recentIssueKeys: string[]
  }

  type DockTaskSearchSelection = {
    primaryIssueKey: string
    currentKey: string
    currentCustomTaskCategory: string
  }

  type DockTaskSearchUi = {
    useSelectionTrigger: boolean
    triggerLabel: string
    triggerButtonClass: string
    popoverContentClass: string
  }

  let {
    isBusy,
    isDarkMode,
    dockTaskSearchData,
    dockTaskSearchSelection,
    dockTaskSearchState = $bindable(),
    dockTaskSearchUi,
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
    isBusy: boolean
    isDarkMode: boolean
    dockTaskSearchData: DockTaskSearchData
    dockTaskSearchSelection: DockTaskSearchSelection
    dockTaskSearchState: DockTaskSearchState
    dockTaskSearchUi: DockTaskSearchUi
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
      disabled={isBusy}
      onclick={onPullCalendar}
    >
      <RefreshCwIcon class="size-4" />
      <span class="sr-only">Pull Calendar</span>
    </Button>

    <div class="bg-border h-6 w-px"></div>

    <TaskSearch
      data={dockTaskSearchData}
      selection={dockTaskSearchSelection}
      bind:searchState={dockTaskSearchState}
      ui={dockTaskSearchUi}
      disabled={isBusy}
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
