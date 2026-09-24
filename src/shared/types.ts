export type NoteKind = 'concept' | 'insight' | 'question' | 'definition'
export type Relation = 'related' | 'contradicts' | 'explains' | 'example_of'

export interface Rect { x: number; y: number; w: number; h: number } // normalised 0..1 of page

export interface DocumentRow {
  id: string
  title: string
  file_hash: string
  storage_path: string
  page_count: number
  last_page: number
  last_opened_at: string | null
  created_at: string
}

export interface Anchor {
  id: string
  document_id: string
  page: number
  rects: Rect[]
  quote: string
  distilled_at: string | null
  created_at: string
}

export interface Message {
  id?: number
  anchor_id: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

export interface Note {
  id: string
  kind: NoteKind
  title: string
  body: string
  status: 'open' | 'resolved'
  document_id: string | null
  source_anchor_id: string | null
  created_at: string
  updated_at: string
}

export interface NoteMatch {
  id: string
  kind: NoteKind
  title: string
  body: string
  document_id: string | null
  source_anchor_id: string | null
  similarity: number
}

export interface SearchHit {
  kind: 'note' | 'passage' | 'pin'
  id: string
  document_id: string | null
  page: number | null
  title: string
  snippet: string | null
  score: number
}

export interface Session {
  id: string
  document_id: string
  started_at: string
  ended_at: string | null
  heartbeat_at?: string
  pages: Record<string, number>
  last_page: number
  summary: string | null
  open_questions: string[]
}

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface LlmSettings { baseURL: string; model: string; hasKey: boolean }

/** API exposed by the preload script on window.buddy */
export interface BuddyApi {
  settings: {
    get(): Promise<LlmSettings>
    set(s: { baseURL?: string; model?: string; apiKey?: string }): Promise<LlmSettings>
    listModels(): Promise<string[]>
  }
  llm: {
    complete(messages: ChatMessage[], opts?: { json?: boolean; maxTokens?: number }): Promise<string>
    stream(messages: ChatMessage[], onDelta: (text: string) => void): Promise<string>
  }
  embed(texts: string[]): Promise<number[][]>
}
