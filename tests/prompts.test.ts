import { describe, expect, it } from 'vitest'
import { askMessages, distillMessages } from '@shared/prompts'

describe('prompts', () => {
  it('ask includes selection, past notes and thread in order', () => {
    const msgs = askMessages({
      docTitle: 'Thermo', page: 4, quote: 'entropy increases', pageText: 'page text',
      passages: [{ page: 9, text: 'second law' }],
      pastNotes: [{ id: 'n', kind: 'concept', title: 'Arrow of time', body: 'b', document_id: null, source_anchor_id: null, similarity: 0.8 }],
      thread: [{ anchor_id: 'a', role: 'user', content: 'q1' }, { anchor_id: 'a', role: 'assistant', content: 'a1' }],
      question: 'q2'
    })
    expect(msgs[0].role).toBe('system')
    expect(msgs[1].content).toContain('entropy increases')
    expect(msgs[1].content).toContain('(p. 9) second law')
    expect(msgs[1].content).toContain('Arrow of time')
    expect(msgs.slice(-3).map((m) => m.content)).toEqual(['q1', 'a1', 'q2'])
  })

  it('page-level ask says so', () => {
    const msgs = askMessages({ docTitle: 'D', page: 1, quote: '', pageText: '', passages: [], pastNotes: [], thread: [], question: 'q' })
    expect(msgs[1].content).toContain('page as a whole')
  })

  it('distill labels speakers', () => {
    const m = distillMessages('D', 2, '', [{ anchor_id: 'a', role: 'user', content: 'why?' }, { anchor_id: 'a', role: 'assistant', content: 'because' }])
    expect(m[1].content).toContain('READER: why?')
    expect(m[1].content).toContain('BUDDY: because')
  })
})
