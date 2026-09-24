import type { NoteMatch, SearchHit } from '@shared/types'
import { hybridSearch, matchNotes } from './db'
import { pageText, type PdfDoc } from './pdf'

export const RELATED_THRESHOLD = 0.7

/** "You've thought about this before": notes from *other* documents close to what's on this page. */
export async function relatedForPage(pdf: PdfDoc, page: number, documentId: string): Promise<NoteMatch[]> {
  const text = await pageText(pdf, page)
  if (text.length < 80) return []
  const [emb] = await window.buddy.embed([text.slice(0, 2000)])
  const hits = await matchNotes(emb, 4, documentId)
  return hits.filter((h) => h.similarity >= RELATED_THRESHOLD)
}

export async function search(query: string): Promise<SearchHit[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const [emb] = await window.buddy.embed([q])
  return hybridSearch(q, emb, 20)
}
