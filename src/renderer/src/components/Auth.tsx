import { useState } from 'react'
import { supabase, supabaseConfigured } from '@/services/supabase'

export function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!supabaseConfigured)
    return (
      <Shell>
        <p className="text-sm text-stone-600">
          Supabase isn't configured. Copy <code>.env.example</code> to <code>.env</code>, fill in your project URL and anon key,
          run the migration in <code>supabase/migrations</code>, then restart.
        </p>
      </Shell>
    )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { error, data } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) setMsg(error.message)
    else if (mode === 'signup' && !data.session) setMsg('Check your email to confirm your account, then sign in.')
  }

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-3">
        <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        <button className="btn-primary w-full" disabled={busy}>{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        {msg && <p className="text-xs text-stone-600">{msg}</p>}
        <button type="button" className="btn-ghost w-full text-xs" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'No account? Create one' : 'Have an account? Sign in'}
        </button>
      </form>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full grid place-items-center bg-[#faf8f5]">
      <div className="w-[360px] space-y-6">
        <div className="text-center">
          <div className="text-4xl">📖</div>
          <h1 className="font-serif text-2xl mt-2">PDF Buddy</h1>
          <p className="text-sm text-stone-500 mt-1">A reading companion that remembers by place, meaning and time.</p>
        </div>
        {children}
      </div>
    </div>
  )
}
