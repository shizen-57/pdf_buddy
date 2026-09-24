import { chunkPages } from '@shared/chunk'
import { usefulTitle } from '@shared/title'
import type { DocumentRow } from '@shared/types'
import { cachePdf, openPdf, pageText } from './pdf'
import { must, supabase, vec } from './supabase'

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Import a PDF: dedupe by hash → upload → extract text per page → chunk → embed locally → store. */
export async function importPdf(file: File, onProgress: (msg: string) => void): Promise<DocumentRow> {
  const bytes = await file.arrayBuffer()
  const hash = await sha256(bytes)
  const existing = await supabase.from('documents').select('*').eq('file_hash', hash).maybeSingle()
  if (existing.data) return existing.data as DocumentRow

  const { data: auth } = await supabase.auth.getUser()
  const storagePath = `${auth.user!.id}/${hash}.pdf`
  onProgress('Uploading…')
  const up = await supabase.storage.from('pdfs').upload(storagePath, new Blob([bytes], { type: 'application/pdf' }), { upsert: true })
  if (up.error) throw new Error(up.error.message)
  await cachePdf(storagePath, bytes)

  const pdf = await openPdf(bytes)
  const pages = []
  for (let p = 1; p <= pdf.numPages; p++) {
    onProgress(`Reading page ${p}/${pdf.numPages}…`)
    pages.push({ page: p, text: await pageText(pdf, p) })
  }
  const meta = await pdf.getMetadata().catch(() => null)
  const title = usefulTitle((meta?.info as any)?.Title) ?? file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ')

  const doc = must<DocumentRow>(
    await supabase
      .from('documents')
      .insert({ title, file_hash: hash, storage_path: storagePath, page_count: pdf.numPages, last_opened_at: new Date().toISOString() })
      .select()
      .single()
  )

  const chunks = chunkPages(pages)
  for (let i = 0; i < chunks.length; i += 32) {
    onProgress(`Understanding… ${Math.min(i + 32, chunks.length)}/${chunks.length}`)
    const batch = chunks.slice(i, i + 32)
    const embs = await window.buddy.embed(batch.map((c) => c.text))
    must(await supabase.from('doc_chunks').insert(batch.map((c, j) => ({ document_id: doc.id, page: c.page, text: c.text, embedding: vec(embs[j]) }))))
  }
  if (!chunks.length) onProgress('No selectable text found (scanned PDF?). Pins still work.')
  return doc
}

