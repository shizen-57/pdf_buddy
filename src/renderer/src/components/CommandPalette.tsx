import { useEffect, useRef, useState } from 'react'
import type { SearchHit } from '@shared/types'
import { useApp } from '@/store/app'
import { search } from '@/services/recall'

const ICON = { note: '✦', pin: '📍', passage: '¶' }
const LABEL = { note: 'Note', pin: 'Pin', passage: 'In a PDF' }

/** Recall by meaning: describe what you remember, however vaguely. */
export function CommandPalette() {
  const open = useApp((s) => s.paletteOpen)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setSel(0)
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        setHits(await search(q))
        setSel(0)
      } catch (e: any) {
        useApp.getState().notify(e.message)
      } finally {
        setBusy(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, open])

  if (!open) return null
  const close = () => useApp.setState({ paletteOpen: false })

  async function choose(h: SearchHit) {
    close()
    const st = useApp.getState()
    if (h.kind === 'note') return useApp.setState({ selectedNoteId: h.id })
    if (h.document_id) await st.goTo(h.document_id, h.page ?? 1, h.kind === 'pin' ? h.id : null)
  }

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/30 flex items-start justify-center pt-[12vh]" onMouseDown={close}>
      <div className="w-[640px] max-w-[90vw] rounded-xl bg-white shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
            if (e.key === 'Enter' && hits[sel]) choose(hits[sel])
          }}
          placeholder="What do you remember? e.g. “that bit about entropy in the physics paper”"
          className="w-full px-5 py-4 text-base border-b border-stone-200 focus:outline-none"
        />
        <ul className="max-h-[55vh] overflow-auto">
          {hits.map((h, i) => (
            <li key={`${h.kind}-${h.id}`}>
              <button
                onMouseEnter={() => setSel(i)}
                onClick={() => choose(h)}
                className={`w-full text-left px-5 py-3 flex gap-3 ${i === sel ? 'bg-amber-50' : ''}`}
              >
                <span className="w-5 text-center text-stone-400">{ICON[h.kind]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-stone-800 truncate">{h.title}</span>
                  {h.snippet && <span className="block text-xs text-stone-500 line-clamp-2">{h.snippet}</span>}
                </span>
                <span className="text-[11px] text-stone-400 whitespace-nowrap">{LABEL[h.kind]}{h.page ? ` · p.${h.page}` : ''}</span>
              </button>
            </li>
          ))}
          {!hits.length && (
            <li className="px-5 py-6 text-sm text-stone-400">
              {busy ? 'Searching…' : q.trim().length < 2 ? 'Search your notes, pins and every PDF, by meaning or by words.' : 'Nothing found.'}
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
