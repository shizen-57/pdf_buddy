import { useEffect, useState } from 'react'
import type { LlmSettings } from '@shared/types'
import { useApp } from '@/store/app'
import { supabase } from '@/services/supabase'

export function Settings() {
  const open = useApp((s) => s.settingsOpen)
  const [s, setS] = useState<LlmSettings | null>(null)
  const [key, setKey] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (open) window.buddy.settings.get().then(setS)
  }, [open])

  if (!open || !s) return null
  const close = () => useApp.setState({ settingsOpen: false })

  async function save() {
    setS(await window.buddy.settings.set({ baseURL: s!.baseURL, model: s!.model, ...(key ? { apiKey: key } : {}) }))
    setKey('')
    setStatus('Saved.')
  }

  async function test() {
    setStatus('Testing…')
    try {
      await save()
      const r = await window.buddy.llm.complete([{ role: 'user', content: 'Reply with the single word: ready' }], { maxTokens: 5 })
      setStatus(`✓ Connected. Model says: “${r.trim()}”`)
    } catch (e: any) {
      setStatus(`✕ ${e.message}`)
    }
  }

  async function fetchModels() {
    try {
      await save()
      setModels(await window.buddy.settings.listModels())
      setStatus(null)
    } catch (e: any) {
      setStatus(`✕ ${e.message}`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/30 grid place-items-center" onMouseDown={close}>
      <div className="w-[520px] rounded-xl bg-white shadow-2xl p-6 space-y-4 text-sm" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-xl">Settings</h2>
        <label className="block space-y-1">
          <span className="text-stone-600">SleepyAI API key {s.hasKey && <span className="text-emerald-600">(saved in your OS keychain)</span>}</span>
          <input className="input" type="password" placeholder={s.hasKey ? '•••••••• (leave blank to keep)' : 'sk-…'} value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-stone-600">API base URL (any OpenAI-compatible endpoint)</span>
          <input className="input" value={s.baseURL} onChange={(e) => setS({ ...s, baseURL: e.target.value })} />
        </label>
        <label className="block space-y-1">
          <span className="text-stone-600">Model</span>
          <div className="flex gap-2">
            <input className="input" list="models" value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} />
            <button className="btn-ghost border border-stone-300 whitespace-nowrap" onClick={fetchModels}>Fetch models</button>
          </div>
          <datalist id="models">{models.map((m) => <option key={m} value={m} />)}</datalist>
          {models.length > 0 && (
            <p className="text-xs text-stone-500">{models.length} models available. DeepSeek: {models.filter((m) => /deepseek/i.test(m)).join(', ') || 'none listed'}</p>
          )}
        </label>
        {status && <p className="text-xs text-stone-600">{status}</p>}
        <div className="flex items-center gap-2 pt-2">
          <button className="btn-primary" onClick={save}>Save</button>
          <button className="btn-ghost border border-stone-300" onClick={test}>Test connection</button>
          <button className="btn-ghost ml-auto text-stone-500" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    </div>
  )
}
