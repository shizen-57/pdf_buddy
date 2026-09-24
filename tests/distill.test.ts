import { describe, expect, it } from 'vitest'
import { LINK_THRESHOLD, MAX_LINKS, parseDistilled, parseRelation, placeNote } from '@shared/distill'
import type { NoteMatch } from '@shared/types'

const match = (id: string, similarity: number, kind: NoteMatch['kind'] = 'concept'): NoteMatch => ({
  id, similarity, kind, title: id, body: id, document_id: null, source_anchor_id: null
})

describe('parseDistilled', () => {
  it('parses fenced JSON and drops invalid notes', () => {
    const raw = '```json\n{"notes":[{"kind":"concept","title":" Entropy ","body":"Disorder measure."},{"kind":"banana","title":"x","body":"y"},{"kind":"insight","title":"","body":"no title"}]}\n```'
    expect(parseDistilled(raw)).toEqual([{ kind: 'concept', title: 'Entropy', body: 'Disorder measure.' }])
  })
  it('returns [] for garbage or empty', () => {
    expect(parseDistilled('sorry, I cannot')).toEqual([])
    expect(parseDistilled('{"notes":[]}')).toEqual([])
    expect(parseDistilled('{"notes": "nope"}')).toEqual([])
  })
  it('caps the number of notes', () => {
    const notes = Array.from({ length: 10 }, (_, i) => ({ kind: 'concept', title: `t${i}`, body: 'b' }))
    expect(parseDistilled(JSON.stringify({ notes }))).toHaveLength(6)
  })
})

describe('parseRelation', () => {
  it('accepts known relations and falls back to related', () => {
    expect(parseRelation('{"relation":"explains"}')).toBe('explains')
    expect(parseRelation('{"relation":"loves"}')).toBe('related')
    expect(parseRelation('nonsense')).toBe('related')
  })
})

describe('placeNote', () => {
  const draft = { kind: 'concept' as const, title: 'Entropy', body: '...' }

  it('merges into a near-duplicate of the same kind', () => {
    const p = placeNote(draft, [match('a', 0.8), match('dup', 0.93)])
    expect(p).toEqual({ action: 'merge', into: expect.objectContaining({ id: 'dup' }) })
  })

  it('does not merge across kinds (a question is not the concept)', () => {
    const p = placeNote(draft, [match('q', 0.95, 'question')])
    expect(p.action).toBe('insert')
    if (p.action === 'insert') expect(p.linkTo.map((n) => n.id)).toEqual(['q'])
  })

  it('links only to notes above threshold, best first, capped', () => {
    const ns = [match('low', LINK_THRESHOLD - 0.01), ...Array.from({ length: 8 }, (_, i) => match(`n${i}`, 0.76 + i * 0.01))]
    const p = placeNote(draft, ns)
    expect(p.action).toBe('insert')
    if (p.action === 'insert') {
      expect(p.linkTo).toHaveLength(MAX_LINKS)
      expect(p.linkTo[0].id).toBe('n7')
      expect(p.linkTo.some((n) => n.id === 'low')).toBe(false)
    }
  })

  it('inserts unlinked when nothing is similar', () => {
    expect(placeNote(draft, [])).toEqual({ action: 'insert', linkTo: [] })
  })
})
