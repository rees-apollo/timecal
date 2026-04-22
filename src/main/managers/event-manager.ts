import type {
  AddManualCustomTaskInput,
  AppSnapshot,
  CreatePlanningEventInput,
  DeletePlanningEventInput,
  SetCalendarClassificationInput,
  UpdatePlanningEventInput
} from '../../shared/types'
import type { IpcMain } from 'electron'
import { outlookClient } from './api-clients/outlook-client'
import { StateStore } from './state-manager'

const DEFAULT_OFF_TASK_SUBJECT = 'Off-task block'

const sanitizePlannedMinutes = (value: number | null | undefined): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const rounded = Math.floor(value)
  return rounded > 0 ? rounded : undefined
}

const isOffTaskSource = (source: string | undefined): boolean =>
  source === 'off-task' || source === 'planning'

const getImportedSeriesKey = (eventId: string): string | undefined => {
  const match = eventId.match(/^(imp_[^_]+)_/)
  return match ? match[1] : undefined
}

const getRollingWindow = (includeHistoric: boolean): { startIso: string; endIso: string } => {
  const now = new Date()
  const start = new Date(now)
  if (includeHistoric) {
    start.setDate(start.getDate() - 90)
  }
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setDate(end.getDate() + 30)
  end.setHours(23, 59, 59, 999)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

interface EventManagerOptions {
  stateStore: StateStore
  withStateUpdate: (updater: () => void) => AppSnapshot
}

export class EventManager {
  private readonly stateStore: StateStore

  private readonly withStateUpdate: (updater: () => void) => AppSnapshot

  constructor(options: EventManagerOptions) {
    this.stateStore = options.stateStore
    this.withStateUpdate = options.withStateUpdate
  }

  registerIpcHandlers(ipcMain: IpcMain): void {
    ipcMain.handle('calendar:pull', async () => this.performCalendarPull(true, true))

    ipcMain.handle('calendar:planning:create', async (_, input: CreatePlanningEventInput) => {
      return this.createPlanningEvent(input)
    })

    ipcMain.handle('calendar:planning:update', async (_, input: UpdatePlanningEventInput) => {
      return this.updatePlanningEvent(input)
    })

    ipcMain.handle('calendar:planning:delete', async (_, input: DeletePlanningEventInput) => {
      return this.deletePlanningEvent(input)
    })

    ipcMain.handle('calendar:classify', async (_, input: SetCalendarClassificationInput) => {
      return this.classifyCalendarEvent(input)
    })

    ipcMain.handle('customTask:addManual', async (_, input: AddManualCustomTaskInput) => {
      return this.addManualCustomTask(input)
    })
  }

  async performCalendarPull(full: boolean, includeHistoric = false): Promise<AppSnapshot> {
    const { startIso, endIso } = getRollingWindow(includeHistoric)
    const state = this.stateStore.get()
    const hasImportedCache = state.calendarEvents.some((e) => !isOffTaskSource(e.source))

    const lastPulled = state.calendarLastPulledIso ? new Date(state.calendarLastPulledIso) : null
    const lastPulledIsValid = lastPulled !== null && !Number.isNaN(lastPulled.getTime())
    const lastPulledInFuture =
      lastPulledIsValid && lastPulled!.getTime() > Date.now() + 5 * 60 * 1000

    const shouldForceFull =
      full ||
      // On startup, if there is no imported cache yet, pull full history window once.
      (includeHistoric && !hasImportedCache) ||
      // Protect against clock skew / corrupted timestamps that would make incremental filters too strict.
      lastPulledInFuture

    let incoming = await outlookClient.getCalendarEvents({
      startIso,
      endIso,
      modifiedSinceIso: shouldForceFull ? undefined : (state.calendarLastPulledIso ?? undefined)
    })

    // If startup incremental unexpectedly returns nothing and we have no cache to display,
    // immediately retry as full so first load still populates.
    if (!full && includeHistoric && !hasImportedCache && incoming.length === 0) {
      incoming = await outlookClient.getCalendarEvents({
        startIso,
        endIso,
        modifiedSinceIso: undefined
      })
    }

    const pulledAt = new Date().toISOString()

    return this.withStateUpdate(() => {
      const s = this.stateStore.get()
      const offTaskEvents = s.calendarEvents.filter((e) => isOffTaskSource(e.source))

      const useFullMerge = full || shouldForceFull

      if (useFullMerge) {
        s.calendarEvents = [...offTaskEvents, ...incoming]
        s.calendarCacheStartIso = startIso
      } else {
        const MAX_HISTORY_MS = 120 * 24 * 60 * 60 * 1000
        const cutoff = Date.now() - MAX_HISTORY_MS
        const incomingIds = new Set(incoming.map((e) => e.id))
        const kept = s.calendarEvents.filter(
          (e) =>
            !isOffTaskSource(e.source) &&
            !incomingIds.has(e.id) &&
            new Date(e.startIso).getTime() >= cutoff
        )
        s.calendarEvents = [...offTaskEvents, ...kept, ...incoming]
        if (!s.calendarCacheStartIso) s.calendarCacheStartIso = startIso
      }
      s.calendarLastPulledIso = pulledAt
    })
  }

  createPlanningEvent(input: CreatePlanningEventInput): AppSnapshot {
    return this.withStateUpdate(() => {
      this.stateStore.get().calendarEvents.push({
        id: crypto.randomUUID(),
        subject: input.subject ?? DEFAULT_OFF_TASK_SUBJECT,
        startIso: input.startIso,
        endIso: input.endIso,
        source: 'off-task',
        plannedMinutes: sanitizePlannedMinutes(input.plannedMinutes)
      })
    })
  }

  updatePlanningEvent(input: UpdatePlanningEventInput): AppSnapshot {
    return this.withStateUpdate(() => {
      const event = this.stateStore.get().calendarEvents.find((e) => e.id === input.id)
      if (event) {
        event.startIso = input.startIso
        event.endIso = input.endIso
        if (input.subject !== undefined) event.subject = input.subject
        if (input.plannedMinutes !== undefined) {
          event.plannedMinutes = sanitizePlannedMinutes(input.plannedMinutes)
        }
      }
    })
  }

  deletePlanningEvent(input: DeletePlanningEventInput): AppSnapshot {
    return this.withStateUpdate(() => {
      const state = this.stateStore.get()
      state.calendarEvents = state.calendarEvents.filter((e) => e.id !== input.id)
      state.calendarLinks = state.calendarLinks.filter((l) => l.eventId !== input.id)
    })
  }

  classifyCalendarEvent(input: SetCalendarClassificationInput): AppSnapshot {
    return this.withStateUpdate(() => {
      const state = this.stateStore.get()
      const calendarEvent = state.calendarEvents.find((item) => item.id === input.eventId)
      const linkEventId =
        calendarEvent?.source === 'imported'
          ? (getImportedSeriesKey(input.eventId) ?? input.eventId)
          : input.eventId
      const existing = state.calendarLinks.find((item) => item.eventId === linkEventId)
      const nextCustomTaskCategory =
        input.classification === 'custom-task' ? input.customTaskCategory : undefined

      if (calendarEvent && isOffTaskSource(calendarEvent.source)) {
        if (input.classification === 'ignored') return
        if (input.classification === 'custom-task' && nextCustomTaskCategory) {
          calendarEvent.subject = nextCustomTaskCategory
        } else if (input.classification !== 'custom-task') {
          calendarEvent.subject = DEFAULT_OFF_TASK_SUBJECT
        }
      }

      if (existing) {
        existing.classification = input.classification
        existing.otherTicketKey = input.otherTicketKey
        existing.customTaskCategory = nextCustomTaskCategory
      } else {
        state.calendarLinks.push({
          eventId: linkEventId,
          classification: input.classification,
          otherTicketKey: input.otherTicketKey,
          customTaskCategory: nextCustomTaskCategory
        })
      }
    })
  }

  addManualCustomTask(input: AddManualCustomTaskInput): AppSnapshot {
    return this.withStateUpdate(() => {
      this.stateStore.get().manualCustomTaskEntries.push({
        id: crypto.randomUUID(),
        date: input.date,
        minutes: input.minutes,
        category: input.category,
        notes: input.notes
      })
    })
  }
}
