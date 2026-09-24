import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { LlmSettings } from '@shared/types'

export const DEFAULTS = { baseURL: 'https://www.sleepyai.org/api/v1', model: 'deepseek-v4' }

interface Stored { baseURL: string; model: string; encKey?: string }

const file = () => join(app.getPath('userData'), 'settings.json')

function load(): Stored {
  try {
    if (existsSync(file())) return { ...DEFAULTS, ...JSON.parse(readFileSync(file(), 'utf8')) }
  } catch {}
  return { ...DEFAULTS }
}

export function getSettings(): LlmSettings {
  const s = load()
  return { baseURL: s.baseURL, model: s.model, hasKey: !!s.encKey }
}

/** The API key is encrypted with the OS keychain (safeStorage) and never leaves this machine. */
export function getApiKey(): string | null {
  const s = load()
  if (!s.encKey) return null
  const buf = Buffer.from(s.encKey, 'base64')
  return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8')
}

export function setSettings(patch: { baseURL?: string; model?: string; apiKey?: string }): LlmSettings {
  const s = load()
  if (patch.baseURL) s.baseURL = patch.baseURL.trim().replace(/\/+$/, '')
  if (patch.model) s.model = patch.model.trim()
  if (patch.apiKey !== undefined) {
    const key = patch.apiKey.trim()
    s.encKey = key
      ? (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : Buffer.from(key, 'utf8')).toString('base64')
      : undefined
  }
  writeFileSync(file(), JSON.stringify(s, null, 2))
  return getSettings()
}
