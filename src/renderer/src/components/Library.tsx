import { useRef, useState } from 'react'
import { useApp } from '@/store/app'
import { importPdf } from '@/services/importer'
import { deleteDocument } from '@/services/db'
import { timeAgo } from './BuddyPanel'

export function Library() {
  const { docs, doc } = useApp()
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<string | null>(null)

  async function onFiles(files: FileList | null) {
    for (const f of Array.from(files ?? [])) {
      if (!f.name.toLowerCase().endsWith('.pdf')) continue
      try {
        setProgress(`${f.name}: starting…`)
        const d = await importPdf(f, (m) => setProgress(`${f.name}: ${m}`))
        await useApp.getState().refreshDocs()
        await useApp.getState().openDocument(d)
      } catch (e: any) {
        useApp.getState().notify(`Import failed: ${e.message}`)
      }
    }
    setProgress(null)
  }

  return (
    <div
      className="flex flex-col min-h-0 flex-1"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onFiles(e.dataTransfer.files)
      }}
    >
      <div className="p-3 border-b border-stone-200">
        <button className="btn-primary w-full" onClick={() => input.current?.click()} disabled={!!progress}>+ Add PDF</button>
        <input ref={input} type="file" accept="application/pdf" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        {progress && <p className="text-xs text-stone-500 mt-2 truncate">{progress}</p>}
      </div>
      <ul className="flex-1 overflow-auto p-2 space-y-1">
        {docs.map((d) => (
          <li key={d.id} className="group relative">
            <button
              onClick={() => useApp.getState().openDocument(d)}
              className={`w-full text-left rounded-lg px-3 py-2 hover:bg-white ${doc?.id === d.id ? 'bg-white shadow-sm' : ''}`}
            >
              <div className="font-serif text-sm text-stone-800 line-clamp-2">{d.title}</div>
              <div className="text-xs text-stone-400 mt-0.5">
                p. {d.last_page}/{d.page_count}{d.last_opened_at ? ` · ${timeAgo(d.last_opened_at)}` : ''}
              </div>
              <div className="h-0.5 bg-stone-200 rounded mt-1.5">
                <div className="h-0.5 bg-amber-500 rounded" style={{ width: `${(d.last_page / Math.max(1, d.page_count)) * 100}%` }} />
              </div>
            </button>
            <button
              className="absolute right-2 top-2 hidden group-hover:block text-stone-300 hover:text-red-600 text-xs"
              title="Remove from library"
              onClick={async () => {
                if (!confirm(`Remove “${d.title}”? Its pins and journal are deleted; notes are kept.`)) return
                if (doc?.id === d.id) await useApp.getState().closeDocument()
                await deleteDocument(d)
                useApp.getState().refreshDocs()
              }}
            >
              ✕
            </button>
          </li>
        ))}
        {!docs.length && !progress && <li className="p-4 text-xs text-stone-400">Drop PDFs here, or use “Add PDF”.</li>}
      </ul>
    </div>
  )
}
