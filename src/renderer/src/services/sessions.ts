import { sessionSummaryMessages } from '@shared/prompts'
import { extractJson } from '@shared/distill'
import { IDLE_CLOSE_MS, formatPageRanges, readPages, startDwell, tick, totalSeconds, type DwellState } from '@shared/sessions'
import type { Session } from '@shared/types'
import { createSession, insertNote, pageChunks, touchDocument, unsummarisedSessions, updateSession } from './db'
import { supabase } from './supabase'

/**
 * Tracks one reading session: time per page, where you stopped. Closes after 10 min idle,
 * on document switch, or on quit. Summaries are generated from closed sessions — including
 * ones left open by a crash/quit, which are finalised on next launch.
 */
export class SessionTracker {
  private session: Session | null = null
  private dwell: DwellState | null = null
  private lastActivity = Date.now()
  private timer: ReturnType<typeof setInterval> | null = null
  private flushing = false
  /** 'idle' = closed after inactivity; any activity resumes a fresh session. 'closed' = document left. */
  private state: 'new' | 'starting' | 'active' | 'closing' | 'idle' | 'closed' = 'new'

  constructor(private documentId: string, private page: number, private onClosed?: () => void) {}

  async start() {
    if (this.state !== 'new' && this.state !== 'idle') return
    this.state = 'starting'
    this.lastActivity = Date.now()
    try {
      this.session = await createSession(this.documentId, this.page)
    } catch (e) {
      this.state = 'idle'
      throw e
    }
    this.dwell = startDwell(this.page, Date.now())
    this.timer = setInterval(() => this.onTick(), 15_000)
    this.state = 'active'
    touchDocument(this.documentId, { last_opened_at: new Date().toISOString() })
  }

  activity() {
    this.lastActivity = Date.now()
    if (this.state === 'idle') this.start().catch((e) => console.warn(e)) // back after a break: new session
  }

  setPage(page: number) {
    this.activity()
    if (!this.dwell || page === this.page) return
    this.dwell = tick(this.dwell, Date.now(), page)
    this.page = page
  }

  private async onTick() {
    if (!this.dwell || !this.session) return
    if (Date.now() - this.lastActivity > IDLE_CLOSE_MS) return this.close('idle')
    this.dwell = tick(this.dwell, Date.now())
    await this.flush()
  }

  private async flush() {
    if (!this.session || !this.dwell || this.flushing) return
    this.flushing = true
    try {
      await Promise.all([
        updateSession(this.session.id, { pages: this.dwell.pages, last_page: this.page, heartbeat_at: new Date().toISOString() }),
        touchDocument(this.documentId, { last_page: this.page })
      ])
    } finally {
      this.flushing = false
    }
  }

  async close(reason: 'idle' | 'closed' = 'closed') {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const s = this.session
    if (this.state !== 'active' || !s || !this.dwell) {
      if (reason === 'closed') this.state = 'closed'
      return
    }
    this.state = 'closing'
    this.dwell = tick(this.dwell, Date.now())
    await this.flush()
    this.session = null
    await updateSession(s.id, { ended_at: new Date().toISOString() })
    const pages = this.dwell.pages
    this.dwell = null
    this.state = reason
    await summariseSession({ ...s, pages, last_page: this.page })
    this.onClosed?.()
  }
}

/** Write the journal entry for a closed session; open questions also become question-notes. */
export async function summariseSession(s: Session): Promise<void> {
  const total = totalSeconds(s.pages)
  if (total < 45) {
    await updateSession(s.id, { summary: '', ended_at: s.ended_at ?? new Date().toISOString() })
    return
  }
  const read = readPages(s.pages)
  const { data: doc } = await supabase.from('documents').select('title').eq('id', s.document_id).single()
  const texts = read.length ? await pageChunks(s.document_id, read.slice(0, 12)) : []
  const { data: pins } = await supabase
    .from('anchors')
    .select('page, quote, messages(content, role, created_at)')
    .eq('document_id', s.document_id)
    .gte('created_at', s.started_at)
  const pinSummaries = (pins ?? []).map((p: any) => ({
    page: p.page,
    quote: p.quote,
    firstQuestion: p.messages?.find((m: any) => m.role === 'user')?.content ?? ''
  }))
  const raw = await window.buddy.llm.complete(
    sessionSummaryMessages(doc?.title ?? 'Untitled', formatPageRanges(read), dedupePages(texts), pinSummaries),
    { json: true, maxTokens: 500 }
  )
  const json = extractJson(raw) ?? {}
  const summary: string = typeof json.summary === 'string' ? json.summary : ''
  const questions: string[] = Array.isArray(json.open_questions) ? json.open_questions.filter((q: unknown) => typeof q === 'string').slice(0, 3) : []
  await updateSession(s.id, { summary, open_questions: questions, ended_at: s.ended_at ?? new Date().toISOString() })
  if (questions.length) {
    const embs = await window.buddy.embed(questions)
    await Promise.all(
      questions.map((q, i) =>
        insertNote({ kind: 'question', title: q.slice(0, 120), body: q, embedding: embs[i], document_id: s.document_id, source_anchor_id: null })
      )
    )
  }
}

function dedupePages(chunks: { page: number; text: string }[]) {
  const seen = new Set<number>()
  return chunks.filter((c) => !seen.has(c.page) && seen.add(c.page))
}

let finalising: Promise<void> | null = null

/** On launch: summarise sessions that were left open (app quit/crash) or never summarised. */
export function finaliseStaleSessions(): Promise<void> {
  // guard: effects can run twice (StrictMode, re-login) and a session must only be summarised once
  finalising ??= finalise().finally(() => (finalising = null))
  return finalising
}

async function finalise() {
  const stale = await unsummarisedSessions()
  const cutoff = Date.now() - IDLE_CLOSE_MS
  for (const s of stale) {
    // still open with a fresh heartbeat → being read right now (maybe on another device)
    if (!s.ended_at && new Date(s.heartbeat_at ?? s.started_at).getTime() > cutoff) continue
    await summariseSession(s).catch((e) => console.warn('session summary failed', e))
  }
}
