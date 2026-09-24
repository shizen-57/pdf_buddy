import type { NoteKind, NoteMatch, Relation } from './types'

export const MERGE_THRESHOLD = 0.9
export const LINK_THRESHOLD = 0.75
export const MAX_LINKS = 5

const KINDS: NoteKind[] = ['concept', 'insight', 'question', 'definition']
const RELATIONS: Relation[] = ['related', 'contradicts', 'explains', 'example_of']

export interface DraftNote { kind: NoteKind; title: string; body: string }

/** Parse the distiller's JSON, tolerating code fences and junk; drops invalid notes. */
export function parseDistilled(raw: string): DraftNote[] {
  const json = extractJson(raw)
  if (!json || !Array.isArray(json.notes)) return []
  return json.notes
    .filter((n: any) => n && KINDS.includes(n.kind) && typeof n.title === 'string' && typeof n.body === 'string')
    .map((n: any) => ({ kind: n.kind, title: n.title.trim().slice(0, 120), body: n.body.trim() }))
    .filter((n: DraftNote) => n.title && n.body)
    .slice(0, 6)
}

export function parseRelation(raw: string): Relation {
  const json = extractJson(raw)
  const r = json?.relation
  return RELATIONS.includes(r) ? r : 'related'
}

export function extractJson(raw: string): any {
  const s = raw.replace(/```(?:json)?/gi, '').trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(s.slice(start, end + 1))
  } catch {
    return null
  }
}

export type Placement =
  | { action: 'merge'; into: NoteMatch }
  | { action: 'insert'; linkTo: NoteMatch[] }

/**
 * Decide what to do with a freshly distilled note given its nearest neighbours.
 * Near-duplicates of the same kind are merged (the notebook grows in depth, not length);
 * otherwise the note is inserted and linked to sufficiently similar notes.
 */
export function placeNote(draft: DraftNote, neighbours: NoteMatch[]): Placement {
  const sorted = [...neighbours].sort((a, b) => b.similarity - a.similarity)
  const dup = sorted.find((n) => n.similarity >= MERGE_THRESHOLD && n.kind === draft.kind)
  if (dup) return { action: 'merge', into: dup }
  return {
    action: 'insert',
    linkTo: sorted.filter((n) => n.similarity >= LINK_THRESHOLD).slice(0, MAX_LINKS)
  }
}
