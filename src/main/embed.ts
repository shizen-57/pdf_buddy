import { app } from 'electron'
import { join } from 'node:path'

// Local embeddings: DeepSeek has no embeddings endpoint, and local keeps reading private and free.
// bge-small-en-v1.5 → 384 dims (matches vector(384) in the schema). Downloaded once to userData/models.
const MODEL = 'Xenova/bge-small-en-v1.5'
let extractor: Promise<any> | null = null

function getExtractor(): Promise<any> {
  if (!extractor) {
    extractor = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers')
      env.cacheDir = join(app.getPath('userData'), 'models')
      return pipeline('feature-extraction', MODEL, { dtype: 'q8' })
    })()
    extractor.catch(() => (extractor = null))
  }
  return extractor
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (!texts.length) return []
  const ex = await getExtractor()
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += 16) {
    const batch = texts.slice(i, i + 16).map((t) => t.slice(0, 2000))
    const res = await ex(batch, { pooling: 'cls', normalize: true })
    out.push(...(res.tolist() as number[][]))
  }
  return out
}
