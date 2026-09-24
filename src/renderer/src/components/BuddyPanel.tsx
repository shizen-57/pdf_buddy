import { useEffect, useRef, useState } from 'react'
import type { Message, NoteMatch, Session } from '@shared/types'
import { formatDuration, formatPageRanges, readPages, totalSeconds } from '@shared/sessions'
import { scheduleDistill, useApp } from '@/store/app'
import { createAnchor, deleteAnchor, listMessages, listSessions } from '@/services/db'
import { ask } from '@/services/ask'
import { relatedForPage } from '@/services/recall'
import { Markdown } from './Markdown'
import { NoteDetail } from './Notebook'
import { KindBadge } from './KindBadge'

export function BuddyPanel() {
  const { doc, focusedAnchorId, pending, selectedNoteId, threadKey } = useApp()
  return (
    <aside className="w-[400px] shrink-0 border-l border-stone-200 bg-stone-50 flex flex-col min-h-0">
      {selectedNoteId ? (
        <NoteDetail id={selectedNoteId} />
      ) : !doc ? (
        <Empty />
      ) : focusedAnchorId || pending ? (
        <Thread key={threadKey} />
      ) : (
        <PageCompanion />
      )}
    </aside>
  )
}

function Empty() {
  return (
    <div className="p-6 text-sm text-stone-500 space-y-3">
      <h2 className="font-serif text-lg text-stone-700">Your reading buddy</h2>
      <p>No chat history to scroll through. Instead there are three ways back to anything you've thought about:</p>
      <ul className="space-y-2">
        <li><b>Place</b>: questions stay pinned (✦) where you asked them.</li>
        <li><b>Meaning</b>: press <kbd className="kbd">Ctrl K</kbd> and describe what you remember.</li>
        <li><b>Time</b>: each document keeps a reading journal that picks up where you left off.</li>
      </ul>
    </div>
  )
}

/** Conversation attached to one place in the PDF. */
function Thread() {
  const { doc, pdf, anchors, focusedAnchorId, pending } = useApp()
  const anchor = anchors.find((a) => a.id === focusedAnchorId) ?? null
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  // Thread remounts per threadKey, so load once; a pending pin being saved mid-answer must not reload.
  useEffect(() => {
    if (anchor) listMessages(anchor.id).then(setMessages)
  }, [])

  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [messages, streaming])

  // A page-level ask hands its question over with the pending pin.
  const autoAsked = useRef(false)
  useEffect(() => {
    if (!anchor && pending?.question && !autoAsked.current) {
      autoAsked.current = true
      submit(pending.question)
    }
  }, [])

  const quote = anchor?.quote ?? pending?.quote ?? ''
  const page = anchor?.page ?? pending?.page ?? 1

  async function submit(q: string) {
    if (!doc || !pdf) return
    setError(null)
    const st = useApp.getState()
    let a = anchor
    if (!a) {
      a = await createAnchor({ document_id: doc.id, page, rects: pending?.rects ?? [], quote })
      useApp.setState({ anchors: [...st.anchors, a], focusedAnchorId: a.id, pending: null })
    }
    setMessages((m) => [...m, { anchor_id: a!.id, role: 'user', content: q }])
    setStreaming('')
    try {
      const { assistant } = await ask(doc, pdf, a, q, (t) => setStreaming((s) => (s ?? '') + t))
      setMessages((m) => [...m, assistant])
      scheduleDistill(a)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setStreaming(null)
    }
  }

  async function remove() {
    if (!anchor || !confirm('Delete this pin and its conversation? Notes already distilled from it are kept.')) return
    await deleteAnchor(anchor.id)
    useApp.setState({ anchors: useApp.getState().anchors.filter((x) => x.id !== anchor.id), focusedAnchorId: null })
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="p-4 border-b border-stone-200 bg-white">
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <button className="btn-ghost -ml-2" onClick={() => useApp.getState().focusAnchor(null)}>← Page {page}</button>
          <span className="ml-auto">{anchor ? new Date(anchor.created_at).toLocaleDateString() : 'new pin'}</span>
          {anchor && <button className="btn-ghost text-stone-400 hover:text-red-600" onClick={remove} title="Delete pin">✕</button>}
        </div>
        {quote ? (
          <blockquote className="mt-2 border-l-4 border-amber-300 pl-3 font-serif text-stone-700 text-sm line-clamp-5">{quote}</blockquote>
        ) : (
          <p className="mt-2 text-sm text-stone-500">About page {page}</p>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-4 text-sm">
        {messages.map((m, i) => <Bubble key={m.id ?? `l${i}`} m={m} />)}
        {streaming !== null && <Bubble m={{ anchor_id: '', role: 'assistant', content: streaming || '…' }} />}
        {error && <div className="text-red-600 text-xs bg-red-50 rounded p-2">{error}</div>}
        {!messages.length && streaming === null && (
          <div className="flex flex-wrap gap-2">
            {(quote ? ['Explain this simply', 'Why does this matter?', 'Give me an example', 'How does this connect to what I know?'] : ['Summarise this page', 'What are the key ideas here?', 'What should I focus on?']).map((s) => (
              <button key={s} className="chip" onClick={() => submit(s)}>{s}</button>
            ))}
          </div>
        )}
        <div ref={bottom} />
      </div>
      <Composer onSubmit={submit} disabled={streaming !== null} placeholder={quote ? 'Ask about this passage…' : `Ask about page ${page}…`} />
    </div>
  )
}

function Bubble({ m }: { m: Message }) {
  return m.role === 'user' ? (
    <div className="ml-10 rounded-2xl rounded-br-sm bg-stone-800 text-stone-50 px-3 py-2 whitespace-pre-wrap">{m.content}</div>
  ) : (
    <div className="text-stone-800"><Markdown text={m.content} /></div>
  )
}

function Composer({ onSubmit, disabled, placeholder }: { onSubmit: (q: string) => void; disabled?: boolean; placeholder: string }) {
  const [q, setQ] = useState('')
  return (
    <form
      className="p-3 border-t border-stone-200 bg-white"
      onSubmit={(e) => {
        e.preventDefault()
        if (!q.trim() || disabled) return
        onSubmit(q.trim())
        setQ('')
      }}
    >
      <textarea
        id="buddy-input"
        rows={2}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            e.currentTarget.form?.requestSubmit()
          }
        }}
        placeholder={placeholder}
        className="w-full resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
    </form>
  )
}

/** Shown when no pin is focused: where you are, what you've thought before, and page-level asks. */
function PageCompanion() {
  const { doc, pdf, page, anchors, sessionsVersion } = useApp()
  const [related, setRelated] = useState<NoteMatch[] | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [showJournal, setShowJournal] = useState(false)

  useEffect(() => {
    if (doc) listSessions(doc.id).then(setSessions).catch(() => {})
  }, [doc?.id, sessionsVersion])

  useEffect(() => {
    if (!pdf || !doc) return
    setRelated(null)
    const t = setTimeout(() => relatedForPage(pdf, page, doc.id).then(setRelated).catch(() => setRelated([])), 1200)
    return () => clearTimeout(t)
  }, [pdf, page, doc?.id])

  const past = sessions.filter((s) => s.ended_at && s.summary)
  const pins = anchors.filter((a) => a.page === page)

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-auto p-4 space-y-5 text-sm">
        {past[0] && <WelcomeBack s={past[0]} />}

        <section>
          <h3 className="section-title">You've thought about this before</h3>
          {related === null ? (
            <p className="text-stone-400 text-xs">Looking through your notebook…</p>
          ) : related.length === 0 ? (
            <p className="text-stone-400 text-xs">Nothing from your other reading connects to this page yet.</p>
          ) : (
            <ul className="space-y-2">
              {related.map((n) => (
                <li key={n.id}>
                  <button className="card w-full text-left" onClick={() => useApp.setState({ selectedNoteId: n.id })}>
                    <div className="flex items-center gap-2"><KindBadge kind={n.kind} /><span className="font-medium text-stone-800">{n.title}</span></div>
                    <p className="text-stone-600 mt-1 line-clamp-2">{n.body}</p>
                    <DocName id={n.document_id} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {pins.length > 0 && (
          <section>
            <h3 className="section-title">Pins on this page</h3>
            <ul className="space-y-1">
              {pins.map((a) => (
                <li key={a.id}>
                  <button className="w-full text-left rounded px-2 py-1 hover:bg-amber-50 text-stone-700 line-clamp-2" onClick={() => useApp.getState().focusAnchor(a.id)}>
                    ✦ {a.quote || 'Page question'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {past.length > 1 && (
          <section>
            <button className="section-title hover:text-stone-700" onClick={() => setShowJournal((v) => !v)}>
              Reading journal · {past.length} sessions {showJournal ? '▾' : '▸'}
            </button>
            {showJournal && (
              <ol className="relative border-l border-stone-300 ml-1 space-y-3">
                {past.map((s) => (
                  <li key={s.id} className="pl-4">
                    <div className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-stone-400 mt-1.5" />
                    <div className="text-xs text-stone-500">
                      {new Date(s.started_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {formatDuration(totalSeconds(s.pages))} · {formatPageRanges(readPages(s.pages))}
                    </div>
                    <p className="text-stone-700">{s.summary}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
      <PageAsk />
    </div>
  )
}

function PageAsk() {
  const page = useApp((s) => s.page)
  return (
    <Composer
      placeholder={`Ask about page ${page}… (or select text)`}
      onSubmit={(q) => useApp.getState().startPending({ page, rects: [], quote: '', question: q })}
    />
  )
}

function WelcomeBack({ s }: { s: Session }) {
  const ago = timeAgo(s.ended_at ?? s.started_at)
  return (
    <section className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2">
      <div className="text-xs uppercase tracking-wide text-amber-700">Welcome back · last read {ago}</div>
      <p className="text-stone-800 font-serif">{s.summary}</p>
      {s.open_questions.length > 0 && (
        <div>
          <div className="text-xs text-stone-500 mb-1">Still open:</div>
          <ul className="space-y-1">
            {s.open_questions.map((q) => <li key={q} className="text-stone-700">? {q}</li>)}
          </ul>
        </div>
      )}
      <button className="btn-primary" onClick={() => useApp.setState({ jump: { page: s.last_page, nonce: Date.now() } })}>
        Continue at page {s.last_page} →
      </button>
    </section>
  )
}

function DocName({ id }: { id: string | null }) {
  const title = useApp((s) => s.docs.find((d) => d.id === id)?.title)
  return title ? <div className="text-xs text-stone-400 mt-1">from “{title}”</div> : null
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}
