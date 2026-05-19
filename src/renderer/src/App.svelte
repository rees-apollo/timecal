<script lang="ts">
  import { onMount } from 'svelte'
  import type {
    AppSettings,
    AppSnapshot,
    BuildWorklogDraftInput,
    CalendarEventClassification,
    TaskTransitionInput,
    WorklogDraft
  } from '../../shared/types'
  import { inferTaskType } from '../../shared/task-type'
  import { WorkingSchedule } from '../../shared/working-schedule'
  import MainCalendarView from './components/MainCalendarView.svelte'
  import AppDock from './components/AppDock.svelte'
  import ReportDialog from './components/ReportDialog.svelte'
  import WeeklyWorkingHoursDialog from './components/WeeklyWorkingHoursDialog.svelte'
  import SettingsPanel from './components/SettingsPanel.svelte'
  import WorklogDraftDialog from './components/WorklogDraftDialog.svelte'
  import TaskTransitionsDialog from './components/TaskTransitionsDialog.svelte'
  import * as Dialog from '$lib/components/ui/dialog'
  import { Toaster } from '$lib/components/ui/sonner'
  import { toast } from 'svelte-sonner'
  import { ModeWatcher, mode, setMode } from 'mode-watcher'
  import { appState } from '$lib/stores/app-state.svelte'

  let taskSelection = $state({
    selectedIssueKey: '',
    otherTicketMap: {} as Record<string, string>
  })
  let draftDialogOpen = $state(false)
  let draftComment = $state('')
  let worklogDraft: WorklogDraft | null = $state(null)

  let settingsDialogOpen = $state(false)
  let reportDialogOpen = $state(false)
  let weeklyWorkingHoursDialogOpen = $state(false)
  let transitionsDialogOpen = $state(false)
  let calendarWeekStartKey = $state(WorkingSchedule.getWeekStartKey(new Date()))

  const weeklyWorkingHoursOverrides = $derived(
    appState.snapshot?.state.weeklyWorkingHoursOverrides ?? {}
  )
  const effectiveCalendarWorkingHours = $derived(
    WorkingSchedule.sanitize(
      weeklyWorkingHoursOverrides[calendarWeekStartKey] ?? appState.settings.workingHours
    )
  )

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
    if (appState.snapshot?.activeSession) await stopTask()
  }

  const toggleThemeMode = (): void => {
    setMode(mode.current === 'dark' ? 'light' : 'dark')
  }

  const handleCalendarDisplayedWeekChange = (weekStartKey: string): void => {
    calendarWeekStartKey = weekStartKey
  }

  const applySnapshot = (next: AppSnapshot): void => {
    appState.snapshot = next
    appState.settings = { ...next.state.settings }
  }

  const runAction = async (action: () => Promise<void>, successMessage?: string): Promise<void> => {
    appState.isBusy = true
    try {
      await action()
      if (successMessage) toast(successMessage)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      appState.isBusy = false
    }
  }

  const loadSnapshot = async (): Promise<void> => {
    const next = await window.api.getSnapshot()
    applySnapshot(next)
  }

  const saveSettings = async (): Promise<void> => {
    await runAction(async () => {
      const next = await window.api.saveSettings($state.snapshot(appState.settings))
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
      appState.jiraResults = await window.api.searchIssues({
        query: appState.dockSearchState.jiraQuery,
        maxResults: 25
      })
      if (appState.jiraResults.length > 0 && !taskSelection.selectedIssueKey) {
        taskSelection.selectedIssueKey = appState.jiraResults[0].key
      }
      toast.success(`Loaded ${appState.jiraResults.length} Jira issues.`)
    })
  }

  const startOrSwitchTask = async (): Promise<void> => {
    const trimmedKey = taskSelection.selectedIssueKey.trim()
    if (!trimmedKey) {
      toast.error('Select or enter a task first.')
      return
    }

    const issue = appState.jiraResults.find((item) => item.key === trimmedKey)
    const customCategory = appState.settings.customTaskCategories.find((c) => c.name === trimmedKey)
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
        const next = appState.snapshot?.activeSession
          ? await window.api.switchTask(taskInput)
          : await window.api.startTask(taskInput)
        applySnapshot(next)
      },
      appState.snapshot?.activeSession ? 'Switched primary task.' : 'Started primary task.'
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
    const exact = appState.snapshot?.state.calendarLinks.find((item) => item.eventId === eventId)
    if (exact?.classification) return exact.classification

    const seriesKey = getImportedSeriesKey(eventId)
    if (!seriesKey) return 'unclassified'

    const series = appState.snapshot?.state.calendarLinks.find((item) => item.eventId === seriesKey)
    return series?.classification ?? 'unclassified'
  }

  const getCustomTaskCategory = (eventId: string): string | undefined => {
    const exact = appState.snapshot?.state.calendarLinks.find((item) => item.eventId === eventId)
    if (exact?.customTaskCategory) return exact.customTaskCategory

    const seriesKey = getImportedSeriesKey(eventId)
    if (!seriesKey) return undefined

    const series = appState.snapshot?.state.calendarLinks.find((item) => item.eventId === seriesKey)
    return series?.customTaskCategory
  }

  const getEventColor = (eventId: string): string => {
    const classification = getClassification(eventId)
    if (classification === 'primary-task') return '#0f766e'
    if (classification === 'other-ticket') return '#1d4ed8'
    if (classification === 'custom-task') {
      const category = getCustomTaskCategory(eventId)
      const configuredColor = appState.settings.customTaskCategories.find(
        (item) => item.name === category
      )?.color
      return configuredColor || '#d97706'
    }

    const event = appState.snapshot?.state.calendarEvents.find((item) => item.id === eventId)
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
</script>

<ModeWatcher />
<div class="relative h-screen overflow-hidden w-screen">
  <Toaster position="top-right" />

  <!-- Full-screen calendar -->
  <div class="h-screen w-screen">
    <MainCalendarView
      workingHours={effectiveCalendarWorkingHours}
      bind:selection={taskSelection}
      actions={mainCalendarActions}
      selectors={mainCalendarSelectors}
      onDisplayedWeekStartChange={handleCalendarDisplayedWeekChange}
    />
  </div>

  <AppDock
    onOpenSettings={() => (settingsDialogOpen = true)}
    onToggleTheme={toggleThemeMode}
    onPullCalendar={pullCalendar}
    onClearSelection={handleClearActiveTask}
    onSearchIssues={searchIssues}
    onSelectIssue={handleSelectIssue}
    onSelectCustomTask={handleSelectCustomTask}
    onOpenTransitions={() => (transitionsDialogOpen = true)}
    onOpenReports={() => (reportDialogOpen = true)}
    onOpenWeeklyOverrides={() => (weeklyWorkingHoursDialogOpen = true)}
  />
</div>

<!-- Settings dialog -->
<Dialog.Root bind:open={settingsDialogOpen}>
  <Dialog.Content
    class="flex h-[min(90vh,46rem)] w-[min(96vw,64rem)] flex-col overflow-hidden sm:max-w-5xl p-0"
  >
    <Dialog.Header class="absolute top-0 left-0 right-0"></Dialog.Header>
    <div class="min-h-0 flex-1 overflow-hidden">
      <SettingsPanel bind:settings={appState.settings} isBusy={appState.isBusy} {saveSettings} />
    </div>
  </Dialog.Content>
</Dialog.Root>

<!-- Report dialog -->
<ReportDialog bind:open={reportDialogOpen} {openDraftDialog} />

<WeeklyWorkingHoursDialog bind:open={weeklyWorkingHoursDialogOpen} {saveWeeklyWorkingHours} />

<!-- Worklog draft dialog -->
<WorklogDraftDialog bind:draftDialogOpen bind:draftComment {worklogDraft} {pushWorklog} />

<TaskTransitionsDialog bind:open={transitionsDialogOpen} onSave={saveTaskTransitions} />
