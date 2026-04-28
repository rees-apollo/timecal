import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { CalendarEvent } from '../../../shared/types'

const nodeRequire = createRequire(import.meta.url)

type PullInput = {
  startIso: string
  endIso: string
  modifiedSinceIso?: string
}

type PullProcessResult =
  | {
      ok: true
      events: CalendarEvent[]
      scanned: number
    }
  | {
      ok: false
      error: string
    }

export const OUTLOOK_SCAN_RESULT_MARKER = '__OUTLOOK_SCAN_RESULT__'

const toOutlookFilterDate = (value: Date): string => {
  const year = value.getFullYear()
  const month = value.getMonth() + 1
  const day = value.getDate()
  const minute = String(value.getMinutes()).padStart(2, '0')
  const hours24 = value.getHours()
  const meridiem = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  return `${month}/${day}/${year} ${hours12}:${minute} ${meridiem}`
}

const buildFilter = (start: Date, end: Date, modifiedSince?: Date): string => {
  const startFilter = toOutlookFilterDate(start)
  const endFilter = toOutlookFilterDate(end)
  if (!modifiedSince) {
    return `[Start] >= '${startFilter}' AND [Start] < '${endFilter}'`
  }
  const modifiedFilter = toOutlookFilterDate(modifiedSince)
  return `[Start] >= '${startFilter}' AND [Start] < '${endFilter}' AND [LastModificationTime] >= '${modifiedFilter}'`
}

const toDate = (value: unknown, field: string): Date => {
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  if (value && typeof value === 'object' && 'valueOf' in value) {
    const raw = (value as { valueOf: () => unknown }).valueOf()
    if (raw instanceof Date || typeof raw === 'string' || typeof raw === 'number') {
      const parsed = new Date(raw)
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
  }
  throw new Error(`Outlook returned invalid ${field} value`)
}

const toStringValue = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback

const isCancelledMeeting = (item: { Subject: unknown; MeetingStatus?: unknown }): boolean => {
  const status = typeof item.MeetingStatus === 'number' ? item.MeetingStatus : null
  if (status === 5) return true

  const subject = typeof item.Subject === 'string' ? item.Subject.trim() : ''
  return /^cancel(?:ed|led)\s*:/i.test(subject)
}

const toSafeImportedEventId = (legacyId: string, startIso: string): string => {
  const hash = createHash('sha1').update(String(legacyId)).digest('hex').slice(0, 16)
  const startMs = Date.parse(startIso)
  const suffix = Number.isFinite(startMs)
    ? String(startMs)
    : String(startIso).replace(/[^0-9]/g, '')
  return `imp_${hash}_${suffix}`
}

const writeResult = (result: PullProcessResult, exitCode: number): never => {
  process.stdout.write(OUTLOOK_SCAN_RESULT_MARKER + JSON.stringify(result))
  process.exit(exitCode)
}

const run = (): void => {
  try {
    const payloadArg = process.argv[2]
    if (!payloadArg) {
      writeResult({ ok: false, error: 'Missing scan payload.' }, 1)
    }

    const input = JSON.parse(Buffer.from(payloadArg, 'base64').toString('utf8')) as PullInput
    const start = new Date(input.startIso)
    const end = new Date(input.endIso)
    const modifiedSince = input.modifiedSinceIso ? new Date(input.modifiedSinceIso) : undefined

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('Invalid calendar pull range provided.')
    }
    if (modifiedSince && Number.isNaN(modifiedSince.getTime())) {
      throw new Error('Invalid modified-since value provided.')
    }

    const filter = buildFilter(start, end, modifiedSince)
    console.log('[Outlook worker] Starting scan', {
      startIso: input.startIso,
      endIso: input.endIso,
      modifiedSinceIso: input.modifiedSinceIso ?? null
    })
    console.log('[Outlook worker] Using filter', filter)

    const winax = nodeRequire('winax') as {
      Object: new (progId: string) => {
        GetNamespace: (name: string) => {
          GetDefaultFolder: (id: number) => {
            Items: {
              IncludeRecurrences: boolean
              Sort: (field: string) => void
              Find: (clause: string) => CalendarItem | null
              FindNext: () => CalendarItem | null
            }
          }
        }
      }
    }
    type CalendarItem = {
      EntryID: unknown
      Subject: unknown
      Start: unknown
      End: unknown
      StartUTC?: unknown
      EndUTC?: unknown
      MeetingStatus?: unknown
    }

    const outlook = new winax.Object('Outlook.Application')
    const mapi = outlook.GetNamespace('MAPI')
    const calendar = mapi.GetDefaultFolder(9)
    const items = calendar.Items

    items.IncludeRecurrences = true
    items.Sort('[Start]')

    const events: CalendarEvent[] = []
    let scanned = 0
    let item = items.Find(filter)

    while (item !== null && item !== undefined) {
      scanned += 1
      if (scanned % 500 === 0) {
        console.log('[Outlook worker] Progress', { scanned, accepted: events.length })
      }
      try {
        if (isCancelledMeeting(item)) {
          item = items.FindNext()
          continue
        }

        // Prefer explicit UTC timestamps from Outlook when available to avoid
        // any ambiguous local-time coercion through COM interop.
        const startDate = toDate(item.StartUTC ?? item.Start, 'Start')
        const endDate = toDate(item.EndUTC ?? item.End, 'End')
        const startIso = startDate.toISOString()
        const endIso = endDate.toISOString()
        const baseId = toStringValue(item.EntryID, startIso)
        events.push({
          id: toSafeImportedEventId(baseId, startIso),
          subject: toStringValue(item.Subject, '(No subject)'),
          startIso,
          endIso,
          source: 'imported'
        })
      } catch {
        // Skip malformed or inaccessible items and continue.
      }
      item = items.FindNext()
    }

    console.log('[Outlook worker] Completed scan', { scanned, accepted: events.length })
    writeResult({ ok: true, events, scanned }, 0)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeResult({ ok: false, error: message }, 1)
  }
}

// Only execute when this file is invoked directly as a child process with a payload
// argument. This prevents the worker from running when electron-vite launches it as
// part of the main process bundle during dev or build.
const workerFilePath = fileURLToPath(import.meta.url)
const mainArg = process.argv[1]
const isDirectInvocation =
  mainArg !== undefined &&
  (mainArg === workerFilePath ||
    mainArg.replace(/\\/g, '/') === workerFilePath.replace(/\\/g, '/'))
if (isDirectInvocation && process.argv[2] !== undefined) {
  run()
}
