import { describe, expect, it } from 'vitest'
import { MAX_TICK_GAP_MS, formatDuration, formatPageRanges, mergeDwell, readPages, startDwell, tick, totalSeconds } from '@shared/sessions'

describe('dwell tracking', () => {
  it('credits time to the page being viewed before a page change', () => {
    let s = startDwell(3, 0)
    s = tick(s, 20_000) // 20s on p3
    s = tick(s, 50_000, 4) // 30s more on p3, now on p4
    s = tick(s, 60_000) // 10s on p4
    expect(s.pages).toEqual({ '3': 50, '4': 10 })
    expect(s.page).toBe(4)
    expect(totalSeconds(s.pages)).toBe(60)
  })

  it('ignores long idle gaps', () => {
    let s = startDwell(1, 0)
    s = tick(s, MAX_TICK_GAP_MS + 1)
    expect(s.pages).toEqual({})
    s = tick(s, MAX_TICK_GAP_MS + 1 + 15_000)
    expect(s.pages).toEqual({ '1': 15 })
  })

  it('merges dwell maps', () => {
    expect(mergeDwell({ '1': 10 }, { '1': 5, '2': 3 })).toEqual({ '1': 15, '2': 3 })
  })
})

describe('formatting', () => {
  it('picks pages actually read and formats ranges', () => {
    const pages = readPages({ '1': 40, '2': 30, '3': 5, '4': 60, '7': 20, '8': 16 })
    expect(pages).toEqual([1, 2, 4, 7, 8])
    expect(formatPageRanges(pages)).toBe('pp. 1–2, 4, 7–8')
    expect(formatPageRanges([5])).toBe('p. 5')
    expect(formatPageRanges([])).toBe('')
  })
  it('formats durations', () => {
    expect(formatDuration(42)).toBe('42s')
    expect(formatDuration(600)).toBe('10 min')
    expect(formatDuration(3900)).toBe('1h 5m')
  })
})
