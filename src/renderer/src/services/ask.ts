import { askMessages } from '@shared/prompts'
import type { Anchor, DocumentRow, Message } from '@shared/types'
import { addMessage, listMessages, matchChunks, matchNotes } from './db'
import { pageText, type PdfDoc } from './pdf'

/** Ask the buddy at an anchor. Grounded in the page, related passages, and the reader's own past notes. */
export async function ask(
  doc: DocumentRow,
  pdf: PdfDoc,
  anchor: Anchor,
  question: string,
  onDelta: (t: string) => void
): Promise<{ user: Message; assistant: Message }> {
  const thread = await listMessages(anchor.id)
  const user = await addMessage({ anchor_id: anchor.id, role: 'user', content: question })

  const [text, [qEmb]] = await Promise.all([pageText(pdf, anchor.page), window.buddy.embed([`${anchor.quote}\n${question}`])])
  const [passages, pastNotes] = await Promise.all([
    matchChunks(qEmb, doc.id, 6).then((cs) => cs.filter((c) => c.page !== anchor.page && c.similarity > 0.55).slice(0, 4)),
    matchNotes(qEmb, 4).then((ns) => ns.filter((n) => n.similarity > 0.7))
  ])

  const answer = await window.buddy.llm.stream(
    askMessages({ docTitle: doc.title, page: anchor.page, quote: anchor.quote, pageText: text, passages, pastNotes, thread, question }),
    onDelta
  )
  const assistant = await addMessage({ anchor_id: anchor.id, role: 'assistant', content: answer })
  return { user, assistant }
}
