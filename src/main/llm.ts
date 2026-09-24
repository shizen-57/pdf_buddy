import OpenAI from 'openai'
import type { ChatMessage } from '@shared/types'
import { getApiKey, getSettings } from './settings'

// SleepyAI exposes an OpenAI-compatible gateway, so the official SDK works with a custom baseURL.
function client(): OpenAI {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No API key set. Open Settings and paste your SleepyAI key.')
  return new OpenAI({ apiKey, baseURL: getSettings().baseURL })
}

export async function complete(messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number } = {}): Promise<string> {
  const res = await client().chat.completions.create({
    model: getSettings().model,
    messages,
    max_tokens: opts.maxTokens ?? 1200,
    temperature: 0.3,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {})
  })
  return res.choices[0]?.message?.content ?? ''
}

export async function stream(messages: ChatMessage[], onDelta: (t: string) => void): Promise<string> {
  const s = await client().chat.completions.create({
    model: getSettings().model,
    messages,
    max_tokens: 1500,
    temperature: 0.5,
    stream: true
  })
  let full = ''
  for await (const chunk of s) {
    const t = chunk.choices[0]?.delta?.content
    if (t) {
      full += t
      onDelta(t)
    }
  }
  return full
}

export async function listModels(): Promise<string[]> {
  const res = await client().models.list()
  return res.data.map((m) => m.id).sort()
}
