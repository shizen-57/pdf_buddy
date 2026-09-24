import type { Anchor, DocumentRow, Message, Note, NoteMatch, Rect, SearchHit, Session } from '@shared/types'
import { must, supabase, vec } from './supabase'

export const listDocuments = async () =>
  must<DocumentRow[]>(await supabase.from('documents').select('*').order('last_opened_at', { ascending: false, nullsFirst: false }))

export const touchDocument = async (id: string, patch: Partial<Pick<DocumentRow, 'last_page' | 'last_opened_at'>>) =>
  must(await supabase.from('documents').update(patch).eq('id', id))

export const deleteDocument = async (doc: DocumentRow) => {
  await supabase.storage.from('pdfs').remove([doc.storage_path])
  must(await supabase.from('documents').delete().eq('id', doc.id))
}

export const listAnchors = async (documentId: string) =>
  must<Anchor[]>(await supabase.from('anchors').select('*').eq('document_id', documentId).order('created_at'))

export const getAnchor = async (id: string) =>
  must<Anchor>(await supabase.from('anchors').select('*').eq('id', id).single())

export const createAnchor = async (a: { document_id: string; page: number; rects: Rect[]; quote: string }) =>
  must<Anchor>(await supabase.from('anchors').insert(a).select().single())

export const deleteAnchor = async (id: string) => must(await supabase.from('anchors').delete().eq('id', id))

export const markDistilled = async (id: string) =>
  must(await supabase.from('anchors').update({ distilled_at: new Date().toISOString() }).eq('id', id))

export const listMessages = async (anchorId: string) =>
  must<Message[]>(await supabase.from('messages').select('*').eq('anchor_id', anchorId).order('created_at').order('id'))

export const addMessage = async (m: Message) => must<Message>(await supabase.from('messages').insert(m).select().single())

/** Anchors whose conversation moved on since they were last distilled (catch-up after crashes/quits). */
export async function anchorsNeedingDistill(): Promise<Anchor[]> {
  const anchors = must<(Anchor & { messages: { created_at: string }[] })[]>(
    await supabase.from('anchors').select('*, messages(created_at)').order('created_at', { ascending: false }).limit(200)
  )
  return anchors.filter((a) => {
    const last = a.messages.reduce((m, x) => (x.created_at > m ? x.created_at : m), '')
    return a.messages.length >= 2 && (!a.distilled_at || last > a.distilled_at)
  })
}

export const listNotes = async () =>
  must<Note[]>(await supabase.from('notes').select('id,kind,title,body,status,document_id,source_anchor_id,created_at,updated_at').order('updated_at', { ascending: false }))

export const insertNote = async (n: Omit<Note, 'id' | 'created_at' | 'updated_at' | 'status'> & { embedding: number[] }) =>
  must<Note>(
    await supabase
      .from('notes')
      .insert({ ...n, embedding: vec(n.embedding) })
      .select('id,kind,title,body,status,document_id,source_anchor_id,created_at,updated_at')
      .single()
  )

export const updateNote = async (id: string, patch: { title?: string; body?: string; status?: string; embedding?: number[] }) =>
  must(
    await supabase
      .from('notes')
      .update({ ...patch, ...(patch.embedding ? { embedding: vec(patch.embedding) } : {}), updated_at: new Date().toISOString() })
      .eq('id', id)
  )

export const deleteNote = async (id: string) => must(await supabase.from('notes').delete().eq('id', id))

export const linkNotes = async (from: string, to: string, relation: string, score: number) =>
  must(await supabase.from('note_links').upsert({ from_note: from, to_note: to, relation, score }))

export async function noteLinks(noteId: string) {
  const rows = must<{ from_note: string; to_note: string; relation: string; score: number }[]>(
    await supabase.from('note_links').select('*').or(`from_note.eq.${noteId},to_note.eq.${noteId}`)
  )
  return rows.map((r) => ({ other: r.from_note === noteId ? r.to_note : r.from_note, relation: r.relation, outgoing: r.from_note === noteId, score: r.score }))
}

export const allLinks = async () =>
  must<{ from_note: string; to_note: string; relation: string }[]>(await supabase.from('note_links').select('from_note,to_note,relation'))

export const matchNotes = async (embedding: number[], count = 5, excludeDoc: string | null = null) =>
  must<NoteMatch[]>(await supabase.rpc('match_notes', { query_embedding: vec(embedding), match_count: count, exclude_doc: excludeDoc }))

export const matchChunks = async (embedding: number[], doc: string, count = 5) =>
  must<{ page: number; text: string; similarity: number }[]>(
    await supabase.rpc('match_chunks', { query_embedding: vec(embedding), doc, match_count: count })
  )

export const hybridSearch = async (text: string, embedding: number[], count = 20) =>
  must<SearchHit[]>(await supabase.rpc('hybrid_search', { query_text: text, query_embedding: vec(embedding), match_count: count }))

export const pageChunks = async (documentId: string, pages: number[]) =>
  must<{ page: number; text: string }[]>(
    await supabase.from('doc_chunks').select('page,text').eq('document_id', documentId).in('page', pages).order('page')
  )

export const listSessions = async (documentId: string) =>
  must<Session[]>(await supabase.from('sessions').select('*').eq('document_id', documentId).order('started_at', { ascending: false }).limit(50))

export const createSession = async (documentId: string, page: number) =>
  must<Session>(await supabase.from('sessions').insert({ document_id: documentId, last_page: page }).select().single())

export const updateSession = async (id: string, patch: Partial<Session>) =>
  must(await supabase.from('sessions').update(patch).eq('id', id))

export const unsummarisedSessions = async () =>
  must<Session[]>(await supabase.from('sessions').select('*').is('summary', null).order('started_at'))
