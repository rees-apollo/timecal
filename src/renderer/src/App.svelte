<script lang="ts">
  import { onMount } from 'svelte'
  import type {
    AppSettings,
    AppSnapshot,
    CalendarEventClassification,
    JiraIssue,
    TaskTransitionInput,
    WorklogDraft
  } from '../../shared/types'
  import { DEFAULT_SETTINGS } from '../../shared/defaults'
  import MainCalendarView from './components/MainCalendarView.svelte'
  import ReportDialog from './components/ReportDialog.svelte'
  import SettingsPanel from './components/SettingsPanel.svelte'
  import TaskSearch from './components/TaskSearch.svelte'
  import WorklogDraftDialog from './components/WorklogDraftDialog.svelte'
  import TaskTransitionsDialog from './components/TaskTransitionsDialog.svelte'
  import * as Dialog from '$lib/components/ui/dialog'
  import { Button } from '$lib/components/ui/button'
  import CogIcon from '@lucide/svelte/icons/settings'
  import BarChartIcon from '@lucide/svelte/icons/bar-chart-2'
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
  import HistoryIcon from '@lucide/svelte/icons/history'
  import SunIcon from '@lucide/svelte/icons/sun'
  import MoonIcon from '@lucide/svelte/icons/moon'
  import { Toaster } from '$lib/components/ui/sonner'
  import { toast } from 'svelte-sonner'
  import { ModeWatcher, mode, setMode } from 'mode-watcher'

  const JIRA_ISSUE_KEY_REGEX = /^[A-Z][A-Z0-9]+-\d+$/

  const inferTaskType = (issueKey: string): 'jira' | 'custom' =>
    JIRA_ISSUE_KEY_REGEX.test(issueKey.trim().toUpperCase()) ? 'jira' : 'custom'

  let snapshot: AppSnapshot | null = $state(null)
  let settings: AppSettings = $state({ ...DEFAULT_SETTINGS })

  let isBusy = $state(false)

  let jiraQuery = $state('')
  let jiraResults: JiraIssue[] = $state([])
  let selectedIssueKey = $state('')

  let otherTicketMap: Record<string, string> = $state({})

  let manualDate = $state(toDateInput(new Date()))
  let manualMinutes = $state(30)
  let manualCategory = $state('')
  let manualNotes = $state('')

  let draftDialogOpen = $state(false)
  let draftComment = $state('')
  let worklogDraft: WorklogDraft | null = $state(null)

  let settingsDialogOpen = $state(false)
  let reportDialogOpen = $state(false)
  let transitionsDialogOpen = $state(false)
  let taskSearchTab = $state<'jira' | 'custom'>('jira')
  const isDarkMode = $derived(mode.current === 'dark')

  const activeIssueKey = $derived(snapshot?.activeSession?.jiraIssueKey ?? '')
  const activeIssueLabel = $derived.by(() => {
    if (!activeIssueKey) return 'No active task'
    const match = jiraResults.find((i) => i.key === activeIssueKey)
    if (match) return `${match.key}: ${match.summary}`
    const fromSession = snapshot?.state.sessions
      .slice()
      .reverse()
      .find((session) => session.jiraIssueKey === activeIssueKey)
    return fromSession
      ? `${fromSession.jiraIssueKey}: ${fromSession.jiraIssueSummary}`
      : activeIssueKey
  })

  async function handleSelectIssue(key: string): Promise<void> {
    selectedIssueKey = key
    await startOrSwitchTask()
  }

  async function handleSelectCustomTask(categoryName: string): Promise<void> {
    selectedIssueKey = categoryName
    await startOrSwitchTask()
  }

  async function handleClearActiveTask(): Promise<void> {
    selectedIssueKey = ''
    if (snapshot?.activeSession) await stopTask()
  }

  const toggleThemeMode = (): void => {
    setMode(isDarkMode ? 'light' : 'dark')
  }

  const applySnapshot = (next: AppSnapshot): void => {
    snapshot = next
    settings = { ...next.state.settings }
    if (!manualCategory && next.state.settings.customTaskCategories.length > 0) {
      manualCategory = next.state.settings.customTaskCategories[0].name
    }
  }

  const runAction = async (action: () => Promise<void>, successMessage?: string): Promise<void> => {
    isBusy = true
    try {
      await action()
      if (successMessage) toast(successMessage)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      isBusy = false
    }
  }

  const loadSnapshot = async (): Promise<void> => {
    const next = await window.api.getSnapshot()
    applySnapshot(next)
  }

  const saveSettings = async (): Promise<void> => {
    await runAction(async () => {
      const next = await window.api.saveSettings($state.snapshot(settings))
      applySnapshot(next)
    }, 'Settings saved.')
  }

  const saveWeeklyWorkingHours = async (
    weekStartKey: string,
    schedule?: AppSettings['workingHours']
  ): Promise<void> => {
    await runAction(
      async () => {
        const next = await window.api.setWeeklyWorkingHours({ weekStartKey, schedule })
        applySnapshot(next)
      },
      schedule ? 'Saved week-specific hours.' : 'Reverted this week to default hours.'
    )
  }

  const searchIssues = async (): Promise<void> => {
    await runAction(async () => {
      jiraResults = await window.api.searchIssues({ query: jiraQuery, maxResults: 25 })
      if (jiraResults.length > 0 && !selectedIssueKey) {
        selectedIssueKey = jiraResults[0].key
      }
    }, `Loaded ${jiraResults.length} Jira issues.`)
  }

  const startOrSwitchTask = async (): Promise<void> => {
    const trimmedKey = selectedIssueKey.trim()
    if (!trimmedKey) {
      toast.error('Select or enter a task first.')
      return
    }

    const issue = jiraResults.find((item) => item.key === trimmedKey)
    const customCategory = settings.customTaskCategories.find((c) => c.name === trimmedKey)
    const taskInput = issue
      ? {
          issueKey: issue.key,
          summary: issue.summary,
          bookingCode: issue.bookingCode,
          taskType: 'jira' as const
        }
      : customCategory
        ? {
            issueKey: trimmedKey,
            summary: trimmedKey,
            bookingCode: customCategory.bookingCode || undefined,
            taskType: 'custom' as const
          }
        : {
            issueKey: trimmedKey,
            summary: trimmedKey,
            bookingCode: undefined,
            taskType: inferTaskType(trimmedKey)
          }

    await runAction(
      async () => {
        const next = snapshot?.activeSession
          ? await window.api.switchTask(taskInput)
          : await window.api.startTask(taskInput)
        applySnapshot(next)
      },
      snapshot?.activeSession ? 'Switched primary task.' : 'Started primary task.'
    )
  }

  const stopTask = async (): Promise<void> => {
    await runAction(async () => {
      const next = await window.api.stopActiveTask()
      applySnapshot(next)
    }, 'Stopped active task.')
  }

  const pullCalendar = async (): Promise<void> => {
    await runAction(async () => {
      const next = await window.api.pullCalendar()
      applySnapshot(next)
    }, 'Outlook calendar loaded.')
  }

  const saveTaskTransitions = async (transitions: TaskTransitionInput[]): Promise<void> => {
    await runAction(async () => {
      const next = await window.api.updateTaskTransitions({ transitions })
      applySnapshot(next)
      transitionsDialogOpen = false
    }, 'Task transition history updated.')
  }

  const classifyEvent = async (
    eventId: string,
    classification: string,
    options?: { customTaskCategory?: string }
  ): Promise<void> => {
    const safeClassification = classification as CalendarEventClassification
    await runAction(async () => {
      const next = await window.api.classifyCalendarEvent({
        eventId,
        classification: safeClassification,
        otherTicketKey: safeClassification === 'other-ticket' ? otherTicketMap[eventId] : undefined,
        customTaskCategory:
          safeClassification === 'custom-task' ? options?.customTaskCategory : undefined
      })
      applySnapshot(next)
    })
  }

  const createPlanningEvent = async (
    startIso: string,
    endIso: string,
    plannedMinutes?: number
  ): Promise<void> => {
    await runAction(async () => {
      const next = await window.api.createPlanningEvent({ startIso, endIso, plannedMinutes })
      applySnapshot(next)
    })
  }

  const updatePlanningEvent = async (
    id: string,
    startIso: string,
    endIso: string,
    plannedMinutes?: number | null
  ): Promise<void> => {
    await runAction(async () => {
      const next = await window.api.updatePlanningEvent({
        id,
        startIso,
        endIso,
        plannedMinutes
      })
      applySnapshot(next)
    })
  }

  const deletePlanningEvent = async (id: string): Promise<void> => {
    await runAction(async () => {
      const next = await window.api.deletePlanningEvent({ id })
      applySnapshot(next)
    })
  }

  const saveOtherTicket = async (eventId: string): Promise<void> => {
    const link = snapshot?.state.calendarLinks.find((item) => item.eventId === eventId)
    if (!link || link.classification !== 'other-ticket') return

    await runAction(async () => {
      const next = await window.api.classifyCalendarEvent({
        eventId,
        classification: 'other-ticket',
        otherTicketKey: otherTicketMap[eventId]
      })
      applySnapshot(next)
    }, 'Saved linked ticket.')
  }

  const addManualCustomTask = async (): Promise<void> => {
    if (manualMinutes <= 0) {
      toast.error('Minutes must be greater than zero.')
      return
    }

    await runAction(async () => {
      const next = await window.api.addManualCustomTask({
        date: manualDate,
        minutes: manualMinutes,
        category: manualCategory,
        notes: manualNotes
      })
      applySnapshot(next)
      manualNotes = ''
    }, 'Manual custom task time added.')
  }

  const openDraftDialog = async (sessionId?: string): Promise<void> => {
    await runAction(async () => {
      worklogDraft = await window.api.buildWorklogDraft(sessionId)
      draftComment = worklogDraft.comment
      draftDialogOpen = true
    })
  }

  const pushWorklog = async (): Promise<void> => {
    if (!worklogDraft) return

    await runAction(async () => {
      await window.api.pushWorklog({ ...worklogDraft, comment: draftComment })
      draftDialogOpen = false
    }, 'Worklog pushed to Jira.')
  }

  const getClassification = (eventId: string): CalendarEventClassification => {
    const link = snapshot?.state.calendarLinks.find((item) => item.eventId === eventId)
    return link?.classification ?? 'unclassified'
  }

  const getCustomTaskCategory = (eventId: string): string | undefined => {
    const link = snapshot?.state.calendarLinks.find((item) => item.eventId === eventId)
    return link?.customTaskCategory
  }

  const getEventColor = (eventId: string): string => {
    const classification = getClassification(eventId)
    if (classification === 'primary-task') return '#0f766e'
    if (classification === 'other-ticket') return '#1d4ed8'
    if (classification === 'custom-task') {
      const category = getCustomTaskCategory(eventId)
      const configuredColor = settings.customTaskCategories.find(
        (item) => item.name === category
      )?.color
      return configuredColor || '#d97706'
    }

    const event = snapshot?.state.calendarEvents.find((item) => item.id === eventId)
    if (event?.source === 'off-task' || event?.source === 'planning') return '#4338ca'
    return '#64748b'
  }

  const formatMinutes = (seconds: number): string => `${Math.max(0, Math.round(seconds / 60))}m`

  function toDateInput(date: Date): string {
    return date.toISOString().slice(0, 10)
  }

  onMount(() => {
    let unsub: (() => void) | undefined
    void runAction(async () => {
      await loadSnapshot()
      unsub = window.api.onStateChanged((next) => applySnapshot(next))
    })

    return () => {
      unsub?.()
    }
  })
</script>

<ModeWatcher />
<div class="relative h-screen overflow-hidden w-screen">
  <Toaster position="top-right" />

  <!-- Full-screen calendar -->
  <div class="h-screen w-screen">
    <MainCalendarView
      {snapshot}
      {settings}
      {jiraResults}
      bind:selectedIssueKey
      bind:otherTicketMap
      {classifyEvent}
      {createPlanningEvent}
      {updatePlanningEvent}
      {deletePlanningEvent}
      sessions={snapshot?.state.sessions ?? []}
      workingHours={settings.workingHours}
      {getClassification}
      {getCustomTaskCategory}
      {getEventColor}
    />
  </div>

  <!-- Floating bottom dock -->
  <div class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
    <div
      class="bg-background/95 supports-[backdrop-filter]:bg-background/80 flex items-center gap-2 rounded-full border px-4 py-2 shadow-lg backdrop-blur text-muted-foreground"
    >
      <!-- Settings -->
      <Button
        variant="ghost"
        size="icon"
        class="rounded-full"
        onclick={() => (settingsDialogOpen = true)}
      >
        <CogIcon class="size-4" />
        <span class="sr-only">Settings</span>
      </Button>

      <Button variant="ghost" size="icon" class="rounded-full" onclick={toggleThemeMode}>
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
        onclick={pullCalendar}
      >
        <RefreshCwIcon class="size-4" />
        <span class="sr-only">Pull Calendar</span>
      </Button>

      <div class="bg-border h-6 w-px"></div>

      <!-- Primary task combobox with integrated search -->
      <TaskSearch
        useSelectionTrigger={true}
        triggerLabel={activeIssueLabel}
        bind:jiraQuery
        {jiraResults}
        customTaskCategories={settings.customTaskCategories}
        sessions={snapshot?.state.sessions ?? []}
        recentIssueKeys={snapshot?.state.recentIssueKeys ?? []}
        primaryIssueKey={activeIssueKey}
        currentKey={activeIssueKey}
        bind:activeTab={taskSearchTab}
        disabled={isBusy}
        onClearSelection={handleClearActiveTask}
        onSearch={searchIssues}
        onSelectJira={handleSelectIssue}
        onSelectCustomTask={handleSelectCustomTask}
      />

      <div class="bg-border h-6 w-px"></div>

      <Button
        variant="ghost"
        size="icon"
        class="rounded-full"
        onclick={() => (transitionsDialogOpen = true)}
      >
        <HistoryIcon class="size-4" />
        <span class="sr-only">Edit task transitions</span>
      </Button>

      <!-- Reports -->
      <Button
        variant="ghost"
        size="icon"
        class="rounded-full"
        onclick={() => (reportDialogOpen = true)}
      >
        <BarChartIcon class="size-4" />
        <span class="sr-only">Reports</span>
      </Button>
    </div>
  </div>
</div>

<!-- Settings dialog -->
<Dialog.Root bind:open={settingsDialogOpen}>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
    <Dialog.Header>
      <Dialog.Title>Settings</Dialog.Title>
    </Dialog.Header>
    <div class="pt-2">
      <SettingsPanel bind:settings {isBusy} {saveSettings} {pullCalendar} {snapshot} />
    </div>
  </Dialog.Content>
</Dialog.Root>

<!-- Report dialog -->
<ReportDialog
  bind:open={reportDialogOpen}
  {snapshot}
  {isBusy}
  {openDraftDialog}
  {saveWeeklyWorkingHours}
/>

<!-- Worklog draft dialog -->
<WorklogDraftDialog
  bind:draftDialogOpen
  bind:draftComment
  {worklogDraft}
  {isBusy}
  {pushWorklog}
  {formatMinutes}
/>

<TaskTransitionsDialog
  bind:open={transitionsDialogOpen}
  sessions={snapshot?.state.sessions ?? []}
  {jiraResults}
  customTaskCategories={settings.customTaskCategories}
  {isBusy}
  onSave={saveTaskTransitions}
/>
