import { create } from 'zustand'
import type { Anchor, DocumentRow, Note, Rect } from '@shared/types'
import { listAnchors, listDocuments, listNotes } from '@/services/db'
import { loadPdfBytes, openPdf, type PdfDoc } from '@/services/pdf'
import { SessionTracker } from '@/services/sessions'
import { distillAnchor } from '@/services/distill'

export interface PendingSelection { page: number; rects: Rect[]; quote: string; question?: string }

interface AppState {
  docs: DocumentRow[]
  doc: DocumentRow | null
  pdf: PdfDoc | null
  loadingDoc: boolean
  page: number
  jump: { page: number; nonce: number } | null
  anchors: Anchor[]
  focusedAnchorId: string | null
  pending: PendingSelection | null
  /** Identity of the open thread; survives a pending pin becoming a saved one mid-answer. */
  threadKey: string
  notes: Note[]
  selectedNoteId: string | null
  sidebar: 'library' | 'notebook'
  paletteOpen: boolean
  settingsOpen: boolean
  toast: string | null
  sessionsVersion: number

  refreshDocs(): Promise<void>
  refreshNotes(): Promise<void>
  refreshAnchors(): Promise<void>
  openDocument(doc: DocumentRow, page?: number, anchorId?: string | null): Promise<void>
  closeDocument(): Promise<void>
  goTo(documentId: string, page: number, anchorId?: string | null): Promise<void>
  setPage(page: number): void
  focusAnchor(id: string | null): void
  startPending(p: PendingSelection): void
  set(p: Partial<AppState>): void
  notify(msg: string): void
}

let tracker: SessionTracker | null = null
export const activity = () => tracker?.activity()

export const useApp = create<AppState>((set, get) => ({
  docs: [],
  doc: null,
  pdf: null,
  loadingDoc: false,
  page: 1,
  jump: null,
  anchors: [],
  focusedAnchorId: null,
  pending: null,
  threadKey: '',
  notes: [],
  selectedNoteId: null,
  sidebar: 'library',
  paletteOpen: false,
  settingsOpen: false,
  toast: null,
  sessionsVersion: 0,

  set: (p) => set(p),

  notify(msg) {
    set({ toast: msg })
    setTimeout(() => get().toast === msg && set({ toast: null }), 4000)
  },

  async refreshDocs() {
    set({ docs: await listDocuments() })
  },
  async refreshNotes() {
    set({ notes: await listNotes() })
  },
  async refreshAnchors() {
    const d = get().doc
    if (d) set({ anchors: await listAnchors(d.id) })
  },

  async openDocument(doc, page, anchorId = null) {
    const cur = get().doc
    if (cur?.id === doc.id && get().pdf) {
      if (page) set({ jump: { page, nonce: Date.now() } })
      get().focusAnchor(anchorId)
      return
    }
    await get().closeDocument()
    set({ doc, pdf: null, loadingDoc: true, anchors: [], focusedAnchorId: null, pending: null })
    try {
      const pdf = await openPdf(await loadPdfBytes(doc))
      const start = Math.min(page ?? doc.last_page ?? 1, pdf.numPages)
      set({ pdf, page: start, jump: { page: start, nonce: Date.now() }, anchors: await listAnchors(doc.id), focusedAnchorId: anchorId, threadKey: anchorId ?? '' })
      tracker = new SessionTracker(doc.id, start, () => set({ sessionsVersion: get().sessionsVersion + 1 }))
      await tracker.start()
    } catch (e: any) {
      get().notify(`Could not open PDF: ${e.message}`)
      set({ doc: null })
    } finally {
      set({ loadingDoc: false })
    }
  },

  async closeDocument() {
    get().focusAnchor(null)
    const t = tracker
    tracker = null
    await t?.close().catch((e) => console.warn(e))
    get().pdf?.loadingTask.destroy()
    set({ doc: null, pdf: null, anchors: [] })
  },

  async goTo(documentId, page, anchorId = null) {
    let doc = get().docs.find((d) => d.id === documentId)
    if (!doc) {
      await get().refreshDocs()
      doc = get().docs.find((d) => d.id === documentId)
    }
    if (doc) await get().openDocument(doc, page, anchorId)
  },

  setPage(page) {
    if (page === get().page) return
    set({ page })
    tracker?.setPage(page)
  },

  startPending(p) {
    get().focusAnchor(null)
    set({ pending: p, threadKey: `pending-${Date.now()}`, selectedNoteId: null })
  },

  /** Leaving a pin is the natural "this exchange settled" moment → distil it into notes. */
  focusAnchor(id) {
    const prev = get().focusedAnchorId
    set({ focusedAnchorId: id, threadKey: id ?? '', pending: id ? null : get().pending, selectedNoteId: id ? null : get().selectedNoteId })
    if (prev && prev !== id) {
      const a = get().anchors.find((x) => x.id === prev)
      if (a) scheduleDistill(a, 0)
    }
  }
}))

const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** Distil after the exchange settles: on leaving the pin, or after 90s idle on it. */
export function scheduleDistill(anchor: Anchor, delayMs = 90_000) {
  clearTimeout(timers.get(anchor.id))
  timers.set(
    anchor.id,
    setTimeout(async () => {
      timers.delete(anchor.id)
      try {
        const n = await distillAnchor(anchor)
        if (n > 0) {
          useApp.getState().notify(`✦ ${n} note${n > 1 ? 's' : ''} added to your notebook`)
          useApp.getState().refreshNotes()
        }
      } catch (e: any) {
        console.warn('distill failed', e)
      }
    }, delayMs)
  )
}

window.addEventListener('beforeunload', () => {
  tracker?.close()
})
