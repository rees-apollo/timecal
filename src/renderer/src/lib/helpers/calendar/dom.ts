import type { AnchorRect } from './types'

export const resolveAnchorRect = (eventId: string, clickEvent: UIEvent): AnchorRect | null => {
  const target = clickEvent.target as HTMLElement | null
  const clickedElement = target?.closest('[data-event-id]') as HTMLElement | null
  const fallbackElement = document.querySelector(
    `[data-event-id="${eventId}"]`
  ) as HTMLElement | null
  const eventElement = clickedElement ?? fallbackElement

  if (!eventElement) return null

  const rect = eventElement.getBoundingClientRect()
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  }
}
