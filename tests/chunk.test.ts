import { describe, expect, it } from 'vitest'
import { chunkPages } from '@shared/chunk'

describe('chunkPages', () => {
  it('keeps chunks within a page and skips near-empty pages', () => {
    const out = chunkPages([
      { page: 1, text: 'Short intro sentence about entropy and heat.' },
      { page: 2, text: '   ' },
      { page: 3, text: 'Another page.   With   spacing that should collapse.' }
    ])
    expect(out.map((c) => c.page)).toEqual([1, 3])
    expect(out[1].text).toBe('Another page. With spacing that should collapse.')
  })

  it('splits long pages on sentence boundaries with overlap', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog. '
    const text = sentence.repeat(200) // ~9000 chars
    const out = chunkPages([{ page: 7, text }], 3200, 300)
    expect(out.length).toBeGreaterThanOrEqual(3)
    for (const c of out) {
      expect(c.page).toBe(7)
      expect(c.text.length).toBeLessThanOrEqual(3200)
    }
    expect(out[0].text.endsWith('.')).toBe(true)
    // overlap: the start of chunk 2 appears at the end of chunk 1
    expect(out[0].text.includes(out[1].text.slice(0, 40))).toBe(true)
  })

  it('terminates on text without sentence breaks', () => {
    const out = chunkPages([{ page: 1, text: 'x'.repeat(10_000) }], 3200, 300)
    expect(out.length).toBe(4)
  })
})
