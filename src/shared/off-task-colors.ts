const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const toHex = (value: number): string => value.toString(16).padStart(2, '0')

const hslToHex = (h: number, s: number, l: number): string => {
  const sat = clamp(s, 0, 100) / 100
  const light = clamp(l, 0, 100) / 100
  const hue = ((h % 360) + 360) % 360

  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = light - c / 2

  let r = 0
  let g = 0
  let b = 0

  if (hue < 60) {
    r = c
    g = x
  } else if (hue < 120) {
    r = x
    g = c
  } else if (hue < 180) {
    g = c
    b = x
  } else if (hue < 240) {
    g = x
    b = c
  } else if (hue < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }

  const red = Math.round((r + m) * 255)
  const green = Math.round((g + m) * 255)
  const blue = Math.round((b + m) * 255)

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`
}

const hashString = (value: string): number => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

export const autoCustomTaskCategoryColor = (name: string, index = 0): string => {
  const seed = name.trim().toLowerCase() || `category-${index}`
  const hash = hashString(seed)
  const hue = hash % 360
  const saturation = 62 + (hash % 12)
  const lightness = 46 + (hash % 10)
  return hslToHex(hue, saturation, lightness)
}

export const autoOffTaskCategoryColor = autoCustomTaskCategoryColor
