import type { ChatMessage, Message, NoteMatch } from './types'

const BUDDY = `You are a reading buddy sitting next to someone reading a PDF — not a chatbot.
Be brief and concrete (usually 2–6 sentences). Explain in plain words, give an intuition or example when it helps,
and cite pages like (p. 12) when you use the document. If the reader has thought about something related before
(given under "Reader's past notes"), connect to it explicitly: "This is the same idea as your note on …".
If the document doesn't say, say so, then answer from general knowledge and mark it as such.
Use Markdown sparingly. Never pad with pleasantries.`

export interface AskContext {
  docTitle: string
  page: number
  quote: string
  pageText: string
  passages: { page: number; text: string }[]
  pastNotes: NoteMatch[]
  thread: Message[]
  question: string
}

export function askMessages(c: AskContext): ChatMessage[] {
  const parts = [
    `Document: "${c.docTitle}". The reader is on page ${c.page}.`,
    c.quote ? `They selected:\n"""${c.quote}"""` : `They are asking about the page as a whole.`,
    `Current page text:\n"""${c.pageText.slice(0, 6000)}"""`
  ]
  if (c.passages.length)
    parts.push(
      'Other relevant passages from this document:\n' +
        c.passages.map((p) => `(p. ${p.page}) ${p.text.slice(0, 1200)}`).join('\n---\n')
    )
  if (c.pastNotes.length)
    parts.push(
      "Reader's past notes (from their notebook, possibly other documents):\n" +
        c.pastNotes.map((n) => `- [${n.kind}] ${n.title}: ${n.body}`).join('\n')
    )
  return [
    { role: 'system', content: BUDDY },
    { role: 'user', content: parts.join('\n\n') },
    { role: 'assistant', content: 'Got it — I have the context.' },
    ...c.thread.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    { role: 'user', content: c.question }
  ]
}

export function distillMessages(docTitle: string, page: number, quote: string, thread: Message[]): ChatMessage[] {
  const convo = thread.map((m) => `${m.role === 'user' ? 'READER' : 'BUDDY'}: ${m.content}`).join('\n\n')
  return [
    {
      role: 'system',
      content: `You turn a reading conversation into durable, atomic notes for the reader's personal knowledge base.
Output ONLY JSON: {"notes":[{"kind":"concept|insight|question|definition","title":"...","body":"..."}]}
Rules:
- 1 to 4 notes. Each note holds exactly ONE idea and must make sense on its own, months later, without the conversation.
- title: short noun phrase (max 8 words), like a flashcard front. body: 1–3 sentences, in the reader's frame of reference.
- concept = an idea explained; definition = a term and its meaning; insight = something the reader realised or connected;
  question = something still unresolved or worth revisiting (only if genuinely open).
- Do not record chit-chat or restate the conversation. If nothing durable was learned, return {"notes":[]}.`
    },
    {
      role: 'user',
      content: `Document: "${docTitle}", page ${page}.\n${quote ? `Selected text: """${quote}"""\n` : ''}\nConversation:\n${convo}`
    }
  ]
}

export function mergeMessages(existing: { title: string; body: string }, incoming: { title: string; body: string }): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `Merge two notes about the same idea into one richer note. Keep it atomic and concise (max 4 sentences).
Output ONLY JSON: {"title":"...","body":"..."}`
    },
    {
      role: 'user',
      content: `Existing note:\n${existing.title}: ${existing.body}\n\nNew note:\n${incoming.title}: ${incoming.body}`
    }
  ]
}

export function relationMessages(a: { title: string; body: string }, b: { title: string; body: string }): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `Classify how note A relates to note B. Output ONLY JSON: {"relation":"related|contradicts|explains|example_of"}
explains = A explains B; example_of = A is an example of B; contradicts = they conflict; otherwise related.`
    },
    { role: 'user', content: `A: ${a.title}: ${a.body}\n\nB: ${b.title}: ${b.body}` }
  ]
}

export function sessionSummaryMessages(
  docTitle: string,
  pagesRead: string,
  pageTexts: { page: number; text: string }[],
  pins: { page: number; quote: string; firstQuestion: string }[]
): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You write a reader's journal entry for one reading session, so they can pick up later without re-reading.
Output ONLY JSON: {"summary":"...","open_questions":["..."]}
summary: 2–4 sentences, second person ("You worked through …"), naming the key ideas covered and where things stood.
open_questions: 0–3 things the reader seemed unsure about or hadn't reached yet. Empty array if none.`
    },
    {
      role: 'user',
      content: [
        `Document: "${docTitle}". Read: ${pagesRead || 'briefly skimmed'}.`,
        pins.length ? 'Questions they asked:\n' + pins.map((p) => `- p.${p.page}: ${p.firstQuestion}`).join('\n') : '',
        'Excerpts of pages read:\n' + pageTexts.map((p) => `(p. ${p.page}) ${p.text.slice(0, 700)}`).join('\n')
      ]
        .filter(Boolean)
        .join('\n\n')
    }
  ]
}
