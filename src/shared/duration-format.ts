export const formatMinutesAsHoursAndMinutes = (totalMinutes: number): string => {
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

export const formatDurationMs = (startMs: number, endMs: number): string => {
  const totalMinutes = Math.max(0, Math.round((endMs - startMs) / 60_000))
  return formatMinutesAsHoursAndMinutes(totalMinutes)
}
