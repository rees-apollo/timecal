<script lang="ts">
  import type {
    AppSnapshot,
    BuildWorklogDraftInput,
    TaskSession,
    WorkingHoursSchedule
  } from '../../../shared/types'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Tabs from '$lib/components/ui/tabs'
  import { Button } from '$lib/components/ui/button'
  import type { DateValue } from '@internationalized/date'
  import { buildDayTimeline, type IntervalKind } from '../../../shared/report-day-overview'
  import { formatDurationMs, formatMinutesAsHoursAndMinutes } from '../../../shared/duration-format'
  import { DEFAULT_SETTINGS } from '../../../shared/defaults'
  import type { TimesheetRow } from '../../../shared/report-timesheet'
  import { getWeekRangeLabel } from '../../../shared/report-week'
  import { buildTimesheetRows } from '../../../shared/report-timesheet'
  import { calculateSessionWorklogMinutesForRange } from '../../../shared/report-worklog'
  import ReportWeekOverridePanel from './reports/ReportWeekOverridePanel.svelte'
  import ReportWorklogsTab from './reports/ReportWorklogsTab.svelte'
  import ReportTimesheetTab from './reports/ReportTimesheetTab.svelte'
  import ReportDailyOverviewTab from './reports/ReportDailyOverviewTab.svelte'
  import {
    formatDayKeyFromDateValue,
    formatDayLabel,
    parseDayKeyOrToday
  } from '$lib/helpers/report-dialog/date-utils'
  import {
    getSelectedWeekEndExclusive,
    getSelectedWeekStart,
    REPORT_WEEKDAYS
  } from '$lib/helpers/report-dialog/week-utils'
  import {
    getWeekStartKey,
    sanitizeWorkingHoursSchedule,
    toLocalDateKey
  } from '../../../shared/working-hours'

  let {
    open = $bindable(false),
    snapshot = null,
    isBusy = false,
    openDraftDialog,
    saveWeeklyWorkingHours
  }: {
    open?: boolean
    snapshot?: AppSnapshot | null
    isBusy?: boolean
    openDraftDialog: (input?: string | BuildWorklogDraftInput) => Promise<void>
    saveWeeklyWorkingHours: (weekStartKey: string, schedule?: WorkingHoursSchedule) => Promise<void>
  } = $props()

  const sessions = $derived(snapshot?.state.sessions ?? [])
  const jiraSessions = $derived(
    sessions.filter((session) => (session.taskType ?? 'jira') === 'jira')
  )
  const defaultWorkingHours = $derived(
    sanitizeWorkingHoursSchedule(snapshot?.state.settings.workingHours)
  )
  const weeklyWorkingHoursOverrides = $derived(snapshot?.state.weeklyWorkingHoursOverrides ?? {})
  const calendarEvents = $derived(snapshot?.state.calendarEvents ?? [])
  const calendarLinks = $derived(snapshot?.state.calendarLinks ?? [])
  const manualCustomTaskEntries = $derived(snapshot?.state.manualCustomTaskEntries ?? [])
  const customTaskCategories = $derived(snapshot?.state.settings.customTaskCategories ?? [])
  const activeSessionId = $derived(
    snapshot?.activeSession?.id ?? snapshot?.state.activeSessionId ?? ''
  )
  const loggedWorklogs = $derived(snapshot?.state.loggedWorklogs ?? [])

  let dayKey = $state(toLocalDateKey(new Date()))
  let dayPickerOpen = $state(false)

  let dayPickerValue = $state<DateValue>(parseDayKeyOrToday(toLocalDateKey(new Date())))

  $effect(() => {
    const normalizedPickerValue = formatDayKeyFromDateValue(dayPickerValue)
    if (normalizedPickerValue !== dayKey) {
      dayKey = normalizedPickerValue
    }
  })

  $effect(() => {
    const normalizedPickerValue = formatDayKeyFromDateValue(dayPickerValue)
    if (dayKey === normalizedPickerValue) return
    dayPickerValue = parseDayKeyOrToday(dayKey)
  })

  const effectiveScheduleForDay = $derived.by(() => {
    const dayStart = new Date(`${dayKey}T00:00:00`)
    if (Number.isNaN(dayStart.getTime())) return defaultWorkingHours
    const weekStartKey = getWeekStartKey(dayStart)
    return sanitizeWorkingHoursSchedule(
      weeklyWorkingHoursOverrides[weekStartKey] ?? defaultWorkingHours
    )
  })

  const dayTimeline = $derived(
    buildDayTimeline({
      dayKey,
      sessions,
      calendarEvents,
      calendarLinks,
      customTaskCategories,
      activeSessionId,
      workingHours: effectiveScheduleForDay
    })
  )

  const kindBadgeClass = (kind: IntervalKind): string => {
    if (kind === 'active-task') return 'bg-emerald-100 text-emerald-800'
    if (kind === 'meeting') return 'bg-blue-100 text-blue-800'
    if (kind === 'lunch') return 'bg-amber-100 text-amber-800'
    return 'bg-muted text-muted-foreground'
  }

  let weekOffset = $state(0)
  let selectedTab = $state('worklogs')

  const selectedWeekStart = $derived(getSelectedWeekStart(weekOffset))

  const selectedWeekEnd = $derived(getSelectedWeekEndExclusive(selectedWeekStart))

  const selectedWeekKey = $derived(toLocalDateKey(selectedWeekStart))
  const effectiveWorkingHours = $derived(
    sanitizeWorkingHoursSchedule(
      weeklyWorkingHoursOverrides[selectedWeekKey] ?? defaultWorkingHours
    )
  )
  // eslint-disable-next-line svelte/prefer-writable-derived -- weekOverrideDraft is bound to a child component via bind: and must remain $state
  let weekOverrideDraft: WorkingHoursSchedule = $state(
    sanitizeWorkingHoursSchedule(DEFAULT_SETTINGS.workingHours)
  )

  $effect(() => {
    weekOverrideDraft = sanitizeWorkingHoursSchedule(
      weeklyWorkingHoursOverrides[selectedWeekKey] ?? defaultWorkingHours
    )
  })

  const weekdays = REPORT_WEEKDAYS

  const formatSessionDurationForReports = (session: TaskSession): string => {
    const minutes = calculateSessionWorklogMinutesForRange({
      session,
      rangeStart: selectedWeekStart,
      rangeEnd: selectedWeekEnd,
      calendarEvents,
      calendarLinks,
      workingHours: effectiveWorkingHours,
      loggedWorklogs
    })
    return `${formatMinutesAsHoursAndMinutes(minutes.remaining)} [logged ${formatMinutesAsHoursAndMinutes(minutes.logged)}]`
  }

  const selectedWeekLabel = $derived(getWeekRangeLabel(selectedWeekStart, selectedWeekEnd))

  const jiraSessionsForSelectedWeek = $derived(
    [...jiraSessions]
      .filter((session) => {
        const start = new Date(session.startIso)
        const end = new Date(session.endIso ?? new Date().toISOString())
        return end > selectedWeekStart && start < selectedWeekEnd
      })
      .sort((a, b) => new Date(b.startIso).getTime() - new Date(a.startIso).getTime())
  )

  const timesheetRows = $derived(
    buildTimesheetRows({
      selectedWeekStart,
      selectedWeekEnd,
      sessions,
      calendarEvents,
      calendarLinks,
      manualCustomTaskEntries,
      customTaskCategories,
      workingHours: effectiveWorkingHours
    })
  )
  const typedTimesheetRows = $derived(timesheetRows as TimesheetRow[])

  const totalMinutes = $derived(timesheetRows.reduce((acc, r) => acc + r.totalMinutes, 0))
  const totalOverheadMinutes = $derived(
    timesheetRows.reduce((acc, r) => acc + r.overheadMinutes, 0)
  )
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="flex max-h-[90vh] w-[min(96vw,56rem)] flex-col overflow-hidden sm:max-w-4xl"
  >
    <Tabs.Root bind:value={selectedTab} class="flex min-h-0 flex-1 flex-col">
      <Dialog.Header class="shrink-0">
        <div class="flex flex-wrap items-center justify-between gap-2 pr-7">
          <Dialog.Title>Reports</Dialog.Title>
          <Tabs.List>
            <Tabs.Trigger value="worklogs">Work Logs</Tabs.Trigger>
            <Tabs.Trigger value="timesheet">Timesheet</Tabs.Trigger>
            <Tabs.Trigger value="daily-overview">Daily Overview</Tabs.Trigger>
          </Tabs.List>
        </div>
        {#if selectedTab !== 'daily-overview'}
          <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div class="flex items-center gap-1">
              <Button variant="outline" size="sm" onclick={() => (weekOffset -= 1)}>Previous</Button
              >
              <span class="text-muted-foreground px-2 text-xs">{selectedWeekLabel}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={weekOffset === 0}
                onclick={() => (weekOffset += 1)}
              >
                Next
              </Button>
            </div>
            <ReportWeekOverridePanel
              {isBusy}
              {weekdays}
              bind:weekOverrideDraft
              resetWeekToDefault={() => saveWeeklyWorkingHours(selectedWeekKey)}
              saveWeekSchedule={() =>
                saveWeeklyWorkingHours(
                  selectedWeekKey,
                  sanitizeWorkingHoursSchedule(weekOverrideDraft)
                )}
            />
          </div>
        {/if}
      </Dialog.Header>

      <Tabs.Content value="worklogs" class="flex min-h-0 flex-1 flex-col">
        <ReportWorklogsTab
          {jiraSessionsForSelectedWeek}
          {isBusy}
          {selectedWeekStart}
          {selectedWeekEnd}
          {selectedWeekKey}
          {formatSessionDurationForReports}
          {openDraftDialog}
        />
      </Tabs.Content>

      <Tabs.Content value="timesheet" class="flex min-h-0 flex-1 flex-col">
        <ReportTimesheetTab
          timesheetRows={typedTimesheetRows}
          {totalMinutes}
          {totalOverheadMinutes}
        />
      </Tabs.Content>

      <Tabs.Content value="daily-overview" class="flex min-h-0 flex-1 flex-col">
        <ReportDailyOverviewTab
          bind:dayPickerOpen
          bind:dayPickerValue
          {dayKey}
          {dayTimeline}
          {formatDayLabel}
          formatDurationBetween={formatDurationMs}
          {kindBadgeClass}
        />
      </Tabs.Content>
    </Tabs.Root>
  </Dialog.Content>
</Dialog.Root>
