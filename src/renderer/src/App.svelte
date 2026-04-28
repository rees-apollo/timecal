<script lang="ts">
  import { onMount } from 'svelte'
  import type {
    AppSettings,
    AppSnapshot,
    BuildWorklogDraftInput,
    CalendarEventClassification,
    JiraIssue,
    TaskTransitionInput,
    WorklogDraft
  } from '../../shared/types'
  import { DEFAULT_SETTINGS } from '../../shared/defaults'
  import { inferTaskType } from '../../shared/task-type'
  import { getWeekStartKey, sanitizeWorkingHoursSchedule } from '../../shared/working-hours'
  import MainCalendarView from './components/MainCalendarView.svelte'
  import AppDock from './components/AppDock.svelte'
  import ReportDialog from './components/ReportDialog.svelte'
  import SettingsPanel from './components/SettingsPanel.svelte'
  import WorklogDraftDialog from './components/WorklogDraftDialog.svelte'
  import TaskTransitionsDialog from './components/TaskTransitionsDialog.svelte'
  import * as Dialog from '$lib/components/ui/dialog'
  import { Toaster } from '$lib/components/ui/sonner'
  import { toast } from 'svelte-sonner'
  import { ModeWatcher, mode, setMode } from 'mode-watcher'

  let snapshot: AppSnapshot | null = $state(null)
  let settings: AppSettings = $state({ ...DEFAULT_SETTINGS })

  let isBusy = $state(false)

  let jiraResults: JiraIssue[] = $state([])
  let taskSelection = $state({
    selectedIssueKey: '',
    otherTicketMap: {} as Record<string, string>
  })
  let dockTaskSearchState = $state<{ jiraQuery: string; activeTab: 'jira' | 'custom' }>({
    jiraQuery: '',
    activeTab: 'jira'
  })

  let draftDialogOpen = $state(false)
  let draftComment = $state('')
  let worklogDraft: WorklogDraft | null = $state(null)

  let settingsDialogOpen = $state(false)
  let reportDialogOpen = $state(false)
  let transitionsDialogOpen = $state(false)
  let calendarWeekStartKey = $state(getWeekStartKey(new Date()))
  const isDarkMode = $derived(mode.current === 'dark')
  const weeklyWorkingHoursOverrides = $derived(snapshot?.state.weeklyWorkingHoursOverrides ?? {})
  const effectiveCalendarWorkingHours = $derived(
    sanitizeWorkingHoursSchedule(
      weeklyWorkingHoursOverrides[calendarWeekStartKey] ?? settings.workingHours
    )
  )

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
    taskSelection.selectedIssueKey = key
    await startOrSwitchTask()
  }

  async function handleSelectCustomTask(categoryName: string): Promise<void> {
    taskSelection.selectedIssueKey = categoryName
    await startOrSwitchTask()
  }

  async function handleClearActiveTask(): Promise<void> {
    taskSelection.selectedIssueKey = ''
    if (snapshot?.activeSession) await stopTask()
  }

  const toggleThemeMode = (): void => {
    setMode(isDarkMode ? 'light' : 'dark')
  }

  const handleCalendarDisplayedWeekChange = (weekStartKey: string): void => {
    calendarWeekStartKey = weekStartKey
  }

  const applySnapshot = (next: AppSnapshot): void => {
    snapshot = next
    settings = { ...next.state.settings }
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
      jiraResults = await window.api.searchIssues({
        query: dockTaskSearchState.jiraQuery,
        maxResults: 25
      })
      if (jiraResults.length > 0 && !taskSelection.selectedIssueKey) {
        taskSelection.selectedIssueKey = jiraResults[0].key
      }
      toast.success(`Loaded ${jiraResults.length} Jira issues.`)
    })
  }

  const startOrSwitchTask = async (): Promise<void> => {
    const trimmedKey = taskSelection.selectedIssueKey.trim()
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
        otherTicketKey:
          safeClassification === 'other-ticket' ? taskSelection.otherTicketMap[eventId] : undefined,
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

  const openDraftDialog = async (input?: string | BuildWorklogDraftInput): Promise<void> => {
    await runAction(async () => {
      const request = typeof input === 'string' ? { sessionId: input } : input
      worklogDraft = await window.api.buildWorklogDraft(request)
      draftComment = worklogDraft.comment
      reportDialogOpen = false
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

  const getImportedSeriesKey = (eventId: string): string | undefined => {
    const match = eventId.match(/^(imp_[^_]+)_/)
    return match ? match[1] : undefined
  }

  const getClassification = (eventId: string): CalendarEventClassification => {
    const exact = snapshot?.state.calendarLinks.find((item) => item.eventId === eventId)
    if (exact?.classification) return exact.classification

    const seriesKey = getImportedSeriesKey(eventId)
    if (!seriesKey) return 'unclassified'

    const series = snapshot?.state.calendarLinks.find((item) => item.eventId === seriesKey)
    return series?.classification ?? 'unclassified'
  }

  const getCustomTaskCategory = (eventId: string): string | undefined => {
    const exact = snapshot?.state.calendarLinks.find((item) => item.eventId === eventId)
    if (exact?.customTaskCategory) return exact.customTaskCategory

    const seriesKey = getImportedSeriesKey(eventId)
    if (!seriesKey) return undefined

    const series = snapshot?.state.calendarLinks.find((item) => item.eventId === seriesKey)
    return series?.customTaskCategory
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

  const mainCalendarContext = $derived({
    snapshot,
    settings,
    jiraResults,
    sessions: snapshot?.state.sessions ?? [],
    workingHours: effectiveCalendarWorkingHours
  })

  const mainCalendarActions = {
    classifyEvent,
    createPlanningEvent,
    updatePlanningEvent,
    deletePlanningEvent
  }

  const mainCalendarSelectors = {
    getClassification,
    getCustomTaskCategory,
    getEventColor
  }

  const dockTaskSearchData = $derived({
    jiraResults,
    customTaskCategories: settings.customTaskCategories,
    sessions: snapshot?.state.sessions ?? [],
    recentIssueKeys: snapshot?.state.recentIssueKeys ?? []
  })

  const dockTaskSearchSelection = $derived({
    primaryIssueKey: activeIssueKey,
    currentKey: activeIssueKey,
    currentCustomTaskCategory: ''
  })

  const dockTaskSearchUi = $derived.by(() => ({
    useSelectionTrigger: true,
    triggerLabel: activeIssueLabel,
    triggerButtonClass: 'h-8 w-[220px] justify-between rounded-full text-sm',
    popoverContentClass: 'w-[320px] p-3'
  }))
</script>

<ModeWatcher />
<div class="relative h-screen overflow-hidden w-screen">
  <Toaster position="top-right" />

  <!-- Full-screen calendar -->
  <div class="h-screen w-screen">
    <MainCalendarView
      context={mainCalendarContext}
      bind:selection={taskSelection}
      actions={mainCalendarActions}
      selectors={mainCalendarSelectors}
      onDisplayedWeekStartChange={handleCalendarDisplayedWeekChange}
    />
  </div>

  <AppDock
    {isBusy}
    {isDarkMode}
    {dockTaskSearchData}
    {dockTaskSearchSelection}
    bind:dockTaskSearchState
    {dockTaskSearchUi}
    onOpenSettings={() => (settingsDialogOpen = true)}
    onToggleTheme={toggleThemeMode}
    onPullCalendar={pullCalendar}
    onClearSelection={handleClearActiveTask}
    onSearchIssues={searchIssues}
    onSelectIssue={handleSelectIssue}
    onSelectCustomTask={handleSelectCustomTask}
    onOpenTransitions={() => (transitionsDialogOpen = true)}
    onOpenReports={() => (reportDialogOpen = true)}
  />
</div>

<!-- Settings dialog -->
<Dialog.Root bind:open={settingsDialogOpen}>
  <Dialog.Content
    class="flex h-[min(90vh,46rem)] w-[min(96vw,64rem)] flex-col overflow-hidden sm:max-w-5xl p-0"
  >
    <Dialog.Header class="absolute top-0 left-0 right-0"></Dialog.Header>
    <div class="min-h-0 flex-1 overflow-hidden">
      <SettingsPanel bind:settings {isBusy} {saveSettings} />
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
<WorklogDraftDialog bind:draftDialogOpen bind:draftComment {worklogDraft} {isBusy} {pushWorklog} />

<TaskTransitionsDialog
  bind:open={transitionsDialogOpen}
  sessions={snapshot?.state.sessions ?? []}
  {jiraResults}
  customTaskCategories={settings.customTaskCategories}
  workingHours={settings.workingHours}
  {weeklyWorkingHoursOverrides}
  {isBusy}
  onSave={saveTaskTransitions}
/>
