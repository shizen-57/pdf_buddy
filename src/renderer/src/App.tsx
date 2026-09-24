import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/services/supabase'
import { anchorsNeedingDistill } from '@/services/db'
import { finaliseStaleSessions } from '@/services/sessions'
import { scheduleDistill, useApp } from '@/store/app'
import { Auth } from '@/components/Auth'
import { Library } from '@/components/Library'
import { Notebook } from '@/components/Notebook'
import { Viewer } from '@/components/Viewer'
import { BuddyPanel } from '@/components/BuddyPanel'
import { CommandPalette } from '@/components/CommandPalette'
import { Settings } from '@/components/Settings'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <Auth />
  return <Main key={session.user.id} />
}

function Main() {
  const { sidebar, notes, toast } = useApp()

  useEffect(() => {
    const st = useApp.getState()
    st.refreshDocs()
    st.refreshNotes()
    window.buddy.settings.get().then((s) => !s.hasKey && useApp.setState({ settingsOpen: true }))
    // Catch up on anything left unfinished by a quit/crash: journal entries and note distillation.
    finaliseStaleSessions().catch((e) => console.warn(e))
    anchorsNeedingDistill().then((as) => as.forEach((a, i) => scheduleDistill(a, 5_000 + i * 3_000))).catch(() => {})
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useApp.setState({ paletteOpen: !useApp.getState().paletteOpen })
      }
      if (e.key === 'Escape') useApp.setState({ paletteOpen: false, settingsOpen: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="h-full flex bg-[#faf8f5] text-stone-900">
      <nav className="w-[260px] shrink-0 border-r border-stone-200 flex flex-col min-h-0">
        <div className="h-12 flex items-center gap-2 px-3 border-b border-stone-200">
          <span className="font-serif text-lg">📖 Buddy</span>
          <button className="ml-auto btn-ghost text-xs" onClick={() => useApp.setState({ paletteOpen: true })} title="Recall anything (Ctrl/Cmd+K)">
            ⌕ <kbd className="kbd">⌘K</kbd>
          </button>
          <button className="btn-ghost" onClick={() => useApp.setState({ settingsOpen: true })} title="Settings">⚙</button>
        </div>
        <div className="flex p-2 gap-1 text-sm">
          {(['library', 'notebook'] as const).map((t) => (
            <button
              key={t}
              onClick={() => useApp.setState({ sidebar: t })}
              className={`flex-1 rounded-md py-1.5 capitalize ${sidebar === t ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-800'}`}
            >
              {t}{t === 'notebook' && notes.length ? ` · ${notes.length}` : ''}
            </button>
          ))}
        </div>
        {sidebar === 'library' ? <Library /> : <Notebook />}
      </nav>
      <Viewer />
      <BuddyPanel />
      <CommandPalette />
      <Settings />
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-full bg-stone-900 text-white text-sm px-4 py-2 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
