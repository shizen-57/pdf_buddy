import { distillMessages, mergeMessages, relationMessages } from '@shared/prompts'
import { extractJson, parseDistilled, parseRelation, placeNote } from '@shared/distill'
import type { Anchor } from '@shared/types'
import { insertNote, linkNotes, listMessages, markDistilled, matchNotes, updateNote } from './db'
import { supabase } from './supabase'

const running = new Set<string>()

/**
 * Turn a pin's conversation into atomic notes. Near-duplicates are merged into the existing note
 * (so the notebook deepens instead of growing like a chat list); new notes get auto-linked.
 * Returns how many notes were created or updated.
 */
export async function distillAnchor(anchor: Anchor): Promise<number> {
  if (running.has(anchor.id)) return 0
  running.add(anchor.id)
  try {
    const thread = await listMessages(anchor.id)
    if (thread.length < 2) return 0
    const { data: doc } = await supabase.from('documents').select('title').eq('id', anchor.document_id).single()
    const raw = await window.buddy.llm.complete(distillMessages(doc?.title ?? 'Untitled', anchor.page, anchor.quote, thread), { json: true })
    const drafts = parseDistilled(raw)
    if (!drafts.length) {
      await markDistilled(anchor.id)
      return 0
    }
    const embs = await window.buddy.embed(drafts.map((d) => `${d.title}. ${d.body}`))
    let changed = 0
    for (let i = 0; i < drafts.length; i++) {
      const draft = drafts[i]
      const placement = placeNote(draft, await matchNotes(embs[i], 8))
      if (placement.action === 'merge') {
        const merged = extractJson(await window.buddy.llm.complete(mergeMessages(placement.into, draft), { json: true, maxTokens: 400 }))
        const title = merged?.title || placement.into.title
        const body = merged?.body || `${placement.into.body}\n\n${draft.body}`
        const [emb] = await window.buddy.embed([`${title}. ${body}`])
        await updateNote(placement.into.id, { title, body, embedding: emb })
      } else {
        const note = await insertNote({ ...draft, embedding: embs[i], document_id: anchor.document_id, source_anchor_id: anchor.id })
        await Promise.all(
          placement.linkTo.map(async (other) => {
            const rel = parseRelation(await window.buddy.llm.complete(relationMessages(draft, other), { json: true, maxTokens: 30 }).catch(() => ''))
            await linkNotes(note.id, other.id, rel, other.similarity)
          })
        )
      }
      changed++
    }
    await markDistilled(anchor.id)
    return changed
  } finally {
    running.delete(anchor.id)
  }
}
