import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Anchor, Rect } from '@shared/types'
import { activity, useApp } from '@/store/app'
import { pdfjs, type PdfDoc } from '@/services/pdf'

const GAP = 16

export function Viewer() {
  const { pdf, doc, page, jump, anchors, focusedAnchorId, pending, loadingDoc } = useApp()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [base, setBase] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(800)
  const [popover, setPopover] = useState<{ x: number; y: number; sel: { page: number; rects: Rect[]; quote: string } } | null>(null)

  // Fit-to-width scale, from page 1 dimensions.
  useEffect(() => {
    if (!pdf) return setBase(null)
    pdf.getPage(1).then((p) => {
      const v = p.getViewport({ scale: 1 })
      setBase({ w: v.width, h: v.height })
    })
  }, [pdf])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = base ? Math.min((width - 96) / base.w, 1.6) * zoom : 1

  // Jump to page (and to the focused pin's highlight when there is one).
  useEffect(() => {
    if (!jump || !base || !scrollRef.current) return
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-page="${jump.page}"]`)
    if (!el) return
    const a = anchors.find((x) => x.id === focusedAnchorId && x.page === jump.page)
    const y = a?.rects[0] ? a.rects[0].y * el.offsetHeight - 120 : 0
    scrollRef.current.scrollTo({ top: el.offsetTop + Math.max(0, y) - GAP })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, base, scale])

  function onScroll() {
    activity()
    setPopover(null)
    const sc = scrollRef.current
    if (!sc) return
    const mid = sc.scrollTop + sc.clientHeight * 0.35
    for (const el of sc.querySelectorAll<HTMLElement>('[data-page]')) {
      if (el.offsetTop <= mid && el.offsetTop + el.offsetHeight >= mid) {
        useApp.getState().setPage(Number(el.dataset.page))
        break
      }
    }
  }

  function onMouseUp() {
    activity()
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const pageEl = (range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement
    )?.closest<HTMLElement>('[data-page]')
    const quote = sel.toString().replace(/\s+/g, ' ').trim()
    if (!pageEl || quote.length < 2) return
    const box = pageEl.getBoundingClientRect()
    const rects = mergeLineRects(
      [...range.getClientRects()]
        .filter((r) => r.width > 1 && r.height > 1)
        .map((r) => ({ x: (r.left - box.left) / box.width, y: (r.top - box.top) / box.height, w: r.width / box.width, h: r.height / box.height }))
    )
    const last = range.getBoundingClientRect()
    const host = scrollRef.current!.getBoundingClientRect()
    setPopover({
      x: last.left + last.width / 2 - host.left,
      y: last.bottom - host.top + scrollRef.current!.scrollTop + 6,
      sel: { page: Number(pageEl.dataset.page), rects, quote: quote.slice(0, 2000) }
    })
  }

  if (!doc)
    return (
      <div className="flex-1 grid place-items-center text-stone-400">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">📖</div>
          <p className="font-serif text-lg text-stone-600">Open a PDF from your library.</p>
          <p className="text-sm mt-2">Select any passage to ask about it. Every question stays pinned where you asked it, and what you learn becomes notes that follow you across books.</p>
        </div>
      </div>
    )

  return (
    <div className="flex-1 relative min-w-0 flex flex-col bg-stone-200/60">
      <div className="h-10 shrink-0 flex items-center gap-2 px-4 border-b border-stone-300/60 bg-stone-50 text-sm">
        <span className="font-serif truncate text-stone-700">{doc.title}</span>
        <span className="ml-auto text-stone-500 tabular-nums">
          {page} / {pdf?.numPages ?? '…'}
        </span>
        <button className="btn-ghost" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>−</button>
        <span className="w-10 text-center text-stone-500 tabular-nums">{Math.round(zoom * 100)}%</span>
        <button className="btn-ghost" onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}>+</button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto relative" onScroll={onScroll} onMouseUp={onMouseUp} onMouseMove={activity}>
        {loadingDoc && <div className="p-10 text-center text-stone-500">Opening…</div>}
        {pdf && base && (
          <div className="flex flex-col items-center" style={{ gap: GAP, padding: `${GAP}px 48px` }}>
            {Array.from({ length: pdf.numPages }, (_, i) => (
              <PageView
                key={`${pdf.fingerprints[0]}-${i + 1}`}
                pdf={pdf}
                pageNumber={i + 1}
                scale={scale}
                fallback={base}
                anchors={anchors.filter((a) => a.page === i + 1)}
                focusedId={focusedAnchorId}
                pending={pending?.page === i + 1 ? pending.rects : null}
                root={scrollRef}
              />
            ))}
          </div>
        )}
        {popover && (
          <button
            className="absolute z-20 -translate-x-1/2 rounded-full bg-stone-900 text-white text-sm px-3 py-1.5 shadow-lg hover:bg-amber-700"
            style={{ left: popover.x, top: popover.y }}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={() => {
              useApp.getState().startPending(popover.sel)
              window.getSelection()?.removeAllRanges()
              setPopover(null)
              setTimeout(() => document.getElementById('buddy-input')?.focus(), 0)
            }}
          >
            ✦ Ask buddy
          </button>
        )}
      </div>
    </div>
  )
}

function PageView(props: {
  pdf: PdfDoc
  pageNumber: number
  scale: number
  fallback: { w: number; h: number }
  anchors: Anchor[]
  focusedId: string | null
  pending: Rect[] | null
  root: React.RefObject<HTMLDivElement | null>
}) {
  const { pdf, pageNumber, scale, fallback, anchors, focusedId, pending, root } = props
  const ref = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { root: root.current, rootMargin: '600px 0px' })
    if (ref.current) io.observe(ref.current)
    return () => io.disconnect()
  }, [root])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let task: { cancel(): void } | null = null
    let text: { cancel(): void } | null = null
    ;(async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const vp = page.getViewport({ scale })
      setSize({ w: vp.width, h: vp.height })
      const canvas = canvasRef.current!
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(vp.width * dpr)
      canvas.height = Math.floor(vp.height * dpr)
      const render = page.render({ canvas, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
      task = render
      await render.promise.catch(() => {})
      if (cancelled || !textRef.current) return
      textRef.current.replaceChildren()
      const tl = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textRef.current, viewport: vp })
      text = tl
      await tl.render().catch(() => {})
    })()
    return () => {
      cancelled = true
      task?.cancel()
      text?.cancel()
    }
  }, [visible, pdf, pageNumber, scale])

  const w = size?.w ?? fallback.w * scale
  const h = size?.h ?? fallback.h * scale

  return (
    <div
      ref={ref}
      data-page={pageNumber}
      className="relative bg-white shadow-md shrink-0"
      style={{ width: w, height: h, ['--scale-factor' as any]: scale, ['--total-scale-factor' as any]: scale, ['--scale-round-x' as any]: '1px', ['--scale-round-y' as any]: '1px' }}
    >
      <canvas ref={canvasRef} style={{ width: w, height: h }} className="absolute inset-0" />
      {/* highlights sit under the text layer so text stays selectable */}
      <div className="absolute inset-0 pointer-events-none">
        {anchors.flatMap((a) =>
          a.rects.map((r, i) => (
            <div
              key={`${a.id}-${i}`}
              className={`absolute rounded-sm mix-blend-multiply ${a.id === focusedId ? 'bg-amber-300/70' : 'bg-amber-200/50'}`}
              style={pct(r)}
            />
          ))
        )}
        {pending?.map((r, i) => <div key={`p${i}`} className="absolute rounded-sm bg-sky-300/50 mix-blend-multiply" style={pct(r)} />)}
      </div>
      <div ref={textRef} className="textLayer" />
      {/* margin pins: the way back to past conversations is the place you had them */}
      {anchors.map((a, i) => (
        <button
          key={a.id}
          title={a.quote || 'Page note'}
          onClick={() => useApp.getState().focusAnchor(a.id)}
          className={`absolute -right-8 w-6 h-6 rounded-full text-[11px] font-semibold grid place-items-center shadow transition
            ${a.id === focusedId ? 'bg-amber-600 text-white scale-110' : 'bg-amber-100 text-amber-800 hover:bg-amber-300'}`}
          style={{ top: `calc(${(a.rects[0]?.y ?? 0.02) * 100}% + ${spread(anchors, i)}px)` }}
        >
          {a.rects.length ? '✦' : '¶'}
        </button>
      ))}
      <div className="absolute -left-9 top-1 text-[10px] text-stone-400 tabular-nums">{pageNumber}</div>
    </div>
  )
}

const pct = (r: Rect) => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` })

/** Nudge pins that would overlap on the same line. */
function spread(anchors: Anchor[], i: number) {
  const y = anchors[i].rects[0]?.y ?? 0.02
  return anchors.slice(0, i).filter((a) => Math.abs((a.rects[0]?.y ?? 0.02) - y) < 0.02).length * 26
}

/** Combine the many per-span rects of a selection into one rect per line. */
function mergeLineRects(rects: Rect[]): Rect[] {
  const lines: Rect[] = []
  for (const r of rects.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l.y - r.y) < r.h * 0.5)
    if (line) {
      const x2 = Math.max(line.x + line.w, r.x + r.w)
      const y2 = Math.max(line.y + line.h, r.y + r.h)
      line.x = Math.min(line.x, r.x)
      line.y = Math.min(line.y, r.y)
      line.w = x2 - line.x
      line.h = y2 - line.y
    } else lines.push({ ...r })
  }
  return lines
}
