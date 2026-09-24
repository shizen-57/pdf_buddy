import type { NoteKind } from '@shared/types'

const STYLE: Record<NoteKind, string> = {
  concept: 'bg-sky-100 text-sky-800',
  definition: 'bg-violet-100 text-violet-800',
  insight: 'bg-emerald-100 text-emerald-800',
  question: 'bg-rose-100 text-rose-800'
}

export function KindBadge({ kind }: { kind: NoteKind }) {
  return <span className={`shrink-0 text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${STYLE[kind]}`}>{kind}</span>
}
