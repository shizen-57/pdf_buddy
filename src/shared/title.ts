/** PDF metadata titles are often junk ("about:blank", "Microsoft Word - x.docx", "untitled"). */
export function usefulTitle(t: unknown): string | null {
  if (typeof t !== 'string') return null
  const s = t.trim()
  if (s.length < 3 || /^(about:|untitled|document\d*$|microsoft (word|powerpoint)|slide \d)|\.(docx?|pptx?|tex|dvi|pdf)$|^https?:/i.test(s)) return null
  return s
}
