// Legacy build: ships polyfills for the very new JS built-ins pdf.js v6 uses (Math.sumPrecise,
// Map#getOrInsertComputed…), so rendering doesn't depend on the exact Chromium inside Electron.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { DocumentRow } from '@shared/types'
import { supabase } from './supabase'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDoc = pdfjs.PDFDocumentProxy
export { pdfjs }

const CACHE = 'pdf-buddy-files'

/** Fetch a PDF's bytes, preferring the local cache over Supabase Storage. */
export async function loadPdfBytes(doc: DocumentRow): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE)
  const key = `/pdf/${doc.storage_path}`
  const hit = await cache.match(key)
  if (hit) return hit.arrayBuffer()
  const { data, error } = await supabase.storage.from('pdfs').download(doc.storage_path)
  if (error || !data) throw new Error(error?.message ?? 'Could not download PDF')
  const buf = await data.arrayBuffer()
  await cache.put(key, new Response(buf.slice(0), { headers: { 'content-type': 'application/pdf' } }))
  return buf
}

export async function cachePdf(storagePath: string, bytes: ArrayBuffer) {
  const cache = await caches.open(CACHE)
  await cache.put(`/pdf/${storagePath}`, new Response(bytes.slice(0), { headers: { 'content-type': 'application/pdf' } }))
}

export const openPdf = (bytes: ArrayBuffer): Promise<PdfDoc> => pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise

export async function pageText(pdf: PdfDoc, pageNumber: number): Promise<string> {
  const page = await pdf.getPage(pageNumber)
  const content = await page.getTextContent()
  return content.items.map((i: any) => ('str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : '')).join('').replace(/[ \t]+/g, ' ').trim()
}
