import { Fragment, type ReactNode } from 'react'

/** Minimal Markdown: paragraphs, bullet/numbered lists, **bold**, *italic*, `code`, headings. Enough for buddy replies. */
export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/)
  return (
    <div className="space-y-2 leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l)))
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}</li>)}
            </ul>
          )
        const h = b.match(/^#{1,4}\s+(.*)$/)
        if (h && lines.length === 1) return <p key={i} className="font-semibold">{inline(h[1])}</p>
        return (
          <p key={i}>
            {lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}
          </p>
        )
      })}
    </div>
  )
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const t = m[0]
    if (t.startsWith('**')) out.push(<strong key={m.index}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) out.push(<code key={m.index} className="px-1 rounded bg-stone-100 text-[0.9em]">{t.slice(1, -1)}</code>)
    else out.push(<em key={m.index}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}
