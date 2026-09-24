export interface PageText { page: number; text: string }
export interface Chunk { page: number; text: string }

/** ~4 chars per token; 800 tokens ≈ 3200 chars. Chunks never span pages so citations stay exact. */
export function chunkPages(pages: PageText[], maxChars = 3200, overlap = 300): Chunk[] {
  const out: Chunk[] = []
  for (const { page, text } of pages) {
    const clean = text.replace(/\s+/g, ' ').trim()
    if (clean.length < 20) continue
    let start = 0
    while (start < clean.length) {
      let end = Math.min(start + maxChars, clean.length)
      if (end < clean.length) {
        const cut = clean.lastIndexOf('. ', end)
        if (cut > start + maxChars / 2) end = cut + 1
      }
      out.push({ page, text: clean.slice(start, end).trim() })
      if (end >= clean.length) break
      start = Math.max(end - overlap, start + 1)
    }
  }
  return out
}
