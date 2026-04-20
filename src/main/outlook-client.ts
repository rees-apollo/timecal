import { execFile } from 'child_process'
import { promisify } from 'util'
import type { CalendarEvent } from '../shared/types'

const execFileAsync = promisify(execFile)

/**
 * Builds a PowerShell script that queries the local Outlook calendar via COM
 * automation. No tokens or network access required — reads directly from the
 * locally-cached mailbox.
 */
const buildScript = (startIso: string, endIso: string, modifiedSinceIso?: string): string => `
$ErrorActionPreference = 'Stop'

$startUtc = [datetime]::Parse('${startIso}', $null, [System.Globalization.DateTimeStyles]::RoundtripKind)
$endUtc   = [datetime]::Parse('${endIso}',   $null, [System.Globalization.DateTimeStyles]::RoundtripKind)
$start    = $startUtc.ToLocalTime()
$end      = $endUtc.ToLocalTime()

$outlook  = New-Object -ComObject Outlook.Application
$mapi     = $outlook.GetNamespace('MAPI')
$calendar = $mapi.GetDefaultFolder(9)

$items = $calendar.Items
$items.IncludeRecurrences = $true
$items.Sort('[Start]')

$fmt = 'g'
${
  modifiedSinceIso
    ? `$modSince = [datetime]::Parse('${modifiedSinceIso}', $null, [System.Globalization.DateTimeStyles]::RoundtripKind).ToLocalTime()
$filter = "[Start] >= '{0}' AND [Start] < '{1}' AND [LastModificationTime] >= '{2}'" -f $start.ToString($fmt), $end.ToString($fmt), $modSince.ToString($fmt)`
    : `$filter = "[Start] >= '{0}' AND [Start] < '{1}'" -f $start.ToString($fmt), $end.ToString($fmt)`
}
$restricted = $items.Restrict($filter)

$results = [System.Collections.Generic.List[object]]::new()
foreach ($item in $restricted) {
    try {
        $results.Add([PSCustomObject]@{
            id       = $item.EntryID
            subject  = if ($item.Subject) { $item.Subject } else { '(No subject)' }
            startIso = ([datetime]$item.Start).ToUniversalTime().ToString('o')
            endIso   = ([datetime]$item.End).ToUniversalTime().ToString('o')
        })
    } catch { }
}

if ($results.Count -eq 0) {
    Write-Output '[]'
} else {
    @($results) | ConvertTo-Json -Compress
}
`

type RawEvent = { id: string; subject: string; startIso: string; endIso: string }

export class OutlookClient {
  async getCalendarEvents(input: {
    startIso: string
    endIso: string
    modifiedSinceIso?: string
  }): Promise<CalendarEvent[]> {
    const script = buildScript(input.startIso, input.endIso, input.modifiedSinceIso)
    // PowerShell -EncodedCommand expects a UTF-16LE base64 string
    const encoded = Buffer.from(script, 'utf16le').toString('base64')

    let stdout: string
    try {
      ;({ stdout } = await execFileAsync('powershell.exe', [
        '-NonInteractive',
        '-NoProfile',
        '-EncodedCommand',
        encoded
      ]))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to read Outlook calendar via COM: ${msg}`)
    }

    const raw = JSON.parse(stdout.trim() || '[]') as RawEvent | RawEvent[]
    // ConvertTo-Json (PowerShell 5.1) returns a plain object for single-item lists
    const items: RawEvent[] = Array.isArray(raw) ? raw : [raw]
    return items.map((item) => ({
      id: item.id,
      subject: item.subject ?? '(No subject)',
      startIso: item.startIso,
      endIso: item.endIso,
      source: 'imported' as const
    }))
  }
}
