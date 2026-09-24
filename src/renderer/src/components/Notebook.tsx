import { useEffect, useMemo, useState } from 'react'
import type { Note, NoteKind } from '@shared/types'
import { useApp } from '@/store/app'
import { deleteNote, getAnchor, noteLinks, updateNote } from '@/services/db'
import { KindBadge } from './KindBadge'

const KINDS: (NoteKind | 'all')[] = ['all', 'concept', 'insight', 'definition', 'question']
const REL_LABEL: Record<string, [string, string]> = {
  related: ['related to', 'related to'],
  explains: ['explains', 'explained by'],
  example_of: ['example of', 'has example'],
  contradicts: ['contradicts', 'contradicted by']
}

/** The notebook is the distilled residue of every conversation: browse ideas, not transcripts. */
export function Notebook() {
  const { notes, docs, selectedNoteId } = useApp()
  const [kind, setKind] = useState<NoteKind | 'all'>('all')
  const [filter, setFilter] = useState('')
  const [docFilter, setDocFilter] = useState<string>('')

  const shown = useMemo(() => {
    const f = filter.toLowerCase()
    return notes.filter(
      (n) =>
        (kind === 'all' || n.kind === kind) &&
        (!docFilter || n.document_id === docFilter) &&
        (!f || n.title.toLowerCase().includes(f) || n.body.toLowerCase().includes(f))
    )
  }, [notes, kind, filter, docFilter])

  const openQuestions = notes.filter((n) => n.kind === 'question' && n.status === 'open').length

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="p-3 space-y-2 border-b border-stone-200">
        <input className="input" placeholder="Filter notes…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`chip text-xs ${kind === k ? '!bg-stone-800 !text-white' : ''}`}>
              {k}{k === 'question' && openQuestions ? ` · ${openQuestions}` : ''}
            </button>
          ))}
        </div>
        <select className="input text-xs" value={docFilter} onChange={(e) => setDocFilter(e.target.value)}>
          <option value="">All documents</option>
          {docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select>
      </div>
      <ul className="flex-1 overflow-auto p-2 space-y-1">
        {shown.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => useApp.setState({ selectedNoteId: n.id })}
              className={`w-full text-left rounded-lg px-3 py-2 hover:bg-white ${selectedNoteId === n.id ? 'bg-white shadow-sm' : ''}`}
            >
              <div className="flex items-center gap-2">
                <KindBadge kind={n.kind} />
                <span className={`text-sm font-medium truncate ${n.status === 'resolved' ? 'line-through text-stone-400' : 'text-stone-800'}`}>{n.title}</span>
              </div>
              <p className="text-xs text-stone-500 line-clamp-2 mt-0.5">{n.body}</p>
            </button>
          </li>
        ))}
        {!shown.length && (
          <li className="p-4 text-xs text-stone-400">
            {notes.length ? 'No notes match.' : 'Notes appear here automatically after you talk with your buddy about a passage.'}
          </li>
        )}
      </ul>
    </div>
  )
}

export function NoteDetail({ id }: { id: string }) {
  const { notes, docs } = useApp()
  const note = notes.find((n) => n.id === id)
  const [links, setLinks] = useState<{ other: string; relation: string; outgoing: boolean }[]>([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ title: '', body: '' })

  useEffect(() => {
    noteLinks(id).then(setLinks).catch(() => setLinks([]))
    if (!note) useApp.getState().refreshNotes()
  }, [id])

  if (!note) return <div className="p-6 text-sm text-stone-400">Loading note…</div>
  const doc = docs.find((d) => d.id === note.document_id)
  const close = () => useApp.setState({ selectedNoteId: null })

  async function goToSource() {
    close()
    if (note!.source_anchor_id) {
      const a = await getAnchor(note!.source_anchor_id).catch(() => null)
      if (a) return useApp.getState().goTo(a.document_id, a.page, a.id)
    }
    if (note!.document_id) useApp.getState().goTo(note!.document_id, docs.find((d) => d.id === note!.document_id)?.last_page ?? 1)
  }

  async function save(patch: Partial<Note>) {
    let embedding: number[] | undefined
    if (patch.title !== undefined || patch.body !== undefined) {
      ;[embedding] = await window.buddy.embed([`${patch.title ?? note!.title}. ${patch.body ?? note!.body}`])
    }
    await updateNote(note!.id, { ...patch, embedding } as any)
    await useApp.getState().refreshNotes()
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="p-4 border-b border-stone-200 bg-white flex items-center gap-2">
        <button className="btn-ghost -ml-2 text-xs" onClick={close}>← Back</button>
        <KindBadge kind={note.kind} />
        <span className="ml-auto text-xs text-stone-400">updated {new Date(note.updated_at).toLocaleDateString()}</span>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-4 text-sm">
        {editing ? (
          <div className="space-y-2">
            <input className="input font-medium" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <textarea className="input h-40" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            <div className="flex gap-2">
              <button className="btn-primary" onClick={async () => { await save(draft); setEditing(false) }}>Save</button>
              <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div onDoubleClick={() => { setDraft({ title: note.title, body: note.body }); setEditing(true) }}>
            <h2 className="font-serif text-xl text-stone-800">{note.title}</h2>
            <p className="mt-2 text-stone-700 leading-relaxed whitespace-pre-wrap">{note.body}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(note.document_id || note.source_anchor_id) && (
            <button className="chip" onClick={goToSource}>↗ {doc ? `Open in “${doc.title}”` : 'Go to source'}</button>
          )}
          {note.kind === 'question' && (
            <button className="chip" onClick={() => save({ status: note.status === 'open' ? 'resolved' : 'open' })}>
              {note.status === 'open' ? '✓ Mark resolved' : '↺ Reopen'}
            </button>
          )}
          {!editing && <button className="chip" onClick={() => { setDraft({ title: note.title, body: note.body }); setEditing(true) }}>Edit</button>}
          <button
            className="chip hover:!bg-red-50 hover:!text-red-700"
            onClick={async () => {
              if (!confirm('Delete this note?')) return
              await deleteNote(note.id)
              close()
              useApp.getState().refreshNotes()
            }}
          >
            Delete
          </button>
        </div>

        <section>
          <h3 className="section-title">Connections</h3>
          {links.length === 0 ? (
            <p className="text-xs text-stone-400">No connections yet. They form automatically as you read related material.</p>
          ) : (
            <ul className="space-y-1">
              {links.map((l) => {
                const other = notes.find((n) => n.id === l.other)
                if (!other) return null
                const label = (REL_LABEL[l.relation] ?? REL_LABEL.related)[l.outgoing ? 0 : 1]
                const otherDoc = docs.find((d) => d.id === other.document_id)
                return (
                  <li key={l.other}>
                    <button className="card w-full text-left" onClick={() => useApp.setState({ selectedNoteId: other.id })}>
                      <div className="text-[11px] text-stone-400">{label}</div>
                      <div className="flex items-center gap-2"><KindBadge kind={other.kind} /><span className="font-medium">{other.title}</span></div>
                      {otherDoc && otherDoc.id !== note.document_id && <div className="text-xs text-stone-400 mt-1">from “{otherDoc.title}”</div>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
