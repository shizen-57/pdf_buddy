export const IDLE_CLOSE_MS = 10 * 60 * 1000
/** Gaps longer than this between ticks are treated as the user being away, not reading. */
export const MAX_TICK_GAP_MS = 2 * 60 * 1000

export interface DwellState { pages: Record<string, number>; lastTick: number | null; page: number }

export function startDwell(page: number, now: number): DwellState {
  return { pages: {}, lastTick: now, page }
}

/** Credit elapsed time to the page being viewed, ignoring long idle gaps. */
export function tick(state: DwellState, now: number, page = state.page): DwellState {
  const pages = { ...state.pages }
  if (state.lastTick != null) {
    const dt = now - state.lastTick
    if (dt > 0 && dt <= MAX_TICK_GAP_MS) {
      const key = String(state.page)
      pages[key] = (pages[key] ?? 0) + Math.round(dt / 1000)
    }
  }
  return { pages, lastTick: now, page }
}

export function mergeDwell(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v
  return out
}

export function totalSeconds(pages: Record<string, number>): number {
  return Object.values(pages).reduce((s, v) => s + v, 0)
}

/** Pages worth mentioning in a summary: the ones actually read (≥ 15s), in order. */
export function readPages(pages: Record<string, number>, minSeconds = 15): number[] {
  return Object.entries(pages)
    .filter(([, s]) => s >= minSeconds)
    .map(([p]) => Number(p))
    .sort((a, b) => a - b)
}

/** "pp. 3–7, 12" */
export function formatPageRanges(pages: number[]): string {
  if (!pages.length) return ''
  const parts: string[] = []
  let start = pages[0]
  let prev = pages[0]
  for (const p of [...pages.slice(1), Infinity]) {
    if (p === prev + 1) { prev = p; continue }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`)
    start = prev = p
  }
  return (pages.length > 1 ? 'pp. ' : 'p. ') + parts.join(', ')
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.round(seconds / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`
}
