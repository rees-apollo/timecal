import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { CalendarEvent } from '../../../shared/types'
import { OUTLOOK_SCAN_RESULT_MARKER } from './outlook-worker'

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

const OUTLOOK_SCAN_TIMEOUT_MS = 120_000

const runScanInChildProcess = async (input: PullInput): Promise<CalendarEvent[]> => {
  const payload = Buffer.from(JSON.stringify(input), 'utf8').toString('base64')
  const workerScriptPath = fileURLToPath(new URL('./outlook-worker.js', import.meta.url))

  return new Promise<CalendarEvent[]>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const child = spawn(process.execPath, [workerScriptPath, payload], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error('Outlook scan timed out.'))
    }, OUTLOOK_SCAN_TIMEOUT_MS)

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)

      const markerIndex = stdout.lastIndexOf(OUTLOOK_SCAN_RESULT_MARKER)
      if (markerIndex < 0) {
        const details = stderr.trim() || stdout.trim()
        reject(
          new Error(
            `Outlook scan process exited without a result marker (code ${code ?? 'unknown'}). ${details}`
          )
        )
        return
      }

      const logText = stdout.slice(0, markerIndex).trim()
      if (logText.length > 0) {
        for (const line of logText.split(/\r?\n/)) {
          const trimmed = line.trim()
          if (trimmed.length > 0) console.log(trimmed)
        }
      }
      if (stderr.trim().length > 0) {
        for (const line of stderr.trim().split(/\r?\n/)) {
          const trimmed = line.trim()
          if (trimmed.length > 0) console.error(`[Outlook worker][stderr] ${trimmed}`)
        }
      }

      const resultText = stdout.slice(markerIndex + OUTLOOK_SCAN_RESULT_MARKER.length).trim()
      try {
        const parsed = JSON.parse(resultText) as PullProcessResult
        if (!parsed.ok) {
          reject(new Error(parsed.error))
          return
        }
        console.log(`[Outlook worker] Final result received: ${parsed.events.length} events`)
        resolve(parsed.events)
      } catch (error) {
        reject(
          new Error(
            `Failed to parse Outlook scan result: ${error instanceof Error ? error.message : String(error)}`
          )
        )
      }
    })
  })
}

export class OutlookClient {
  async getCalendarEvents(input: PullInput): Promise<CalendarEvent[]> {
    if (process.platform !== 'win32') {
      throw new Error('Outlook COM integration is supported on Windows only.')
    }

    const start = new Date(input.startIso)
    const end = new Date(input.endIso)
    const modifiedSince = input.modifiedSinceIso ? new Date(input.modifiedSinceIso) : undefined
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('Invalid calendar pull range provided.')
    }
    if (modifiedSince && Number.isNaN(modifiedSince.getTime())) {
      throw new Error('Invalid modified-since value provided.')
    }

    try {
      return await runScanInChildProcess(input)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to read Outlook calendar via winax COM: ${msg}`)
    }
  }
}

export const outlookClient = new OutlookClient()
