import { describe, expect, it } from 'vitest'
import { usefulTitle } from '@shared/title'

describe('usefulTitle', () => {
  it('rejects junk metadata titles', () => {
    for (const t of ['about:blank', 'Untitled', 'Microsoft Word - thesis_v3.docx', 'paper.pdf', 'main.tex', 'ab', '', '  ', 'https://x.org/a', 'Document1', null, 42])
      expect(usefulTitle(t)).toBeNull()
  })
  it('keeps real titles', () => {
    expect(usefulTitle('  Attention Is All You Need ')).toBe('Attention Is All You Need')
    expect(usefulTitle('Documentary Film Theory')).toBe('Documentary Film Theory')
  })
})
