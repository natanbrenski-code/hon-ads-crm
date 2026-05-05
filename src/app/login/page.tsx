'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Nieprawidłowy email lub hasło')
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg)'
    }}>
      <div style={{
        background: 'var(--surf)', borderRadius: 'var(--rl)',
        border: '.5px solid var(--brd)', padding: '40px',
        width: '380px', boxShadow: '0 8px 32px rgba(0,0,0,.08)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '24px', fontWeight: '600', marginBottom: '6px' }}>
            HON <span style={{ color: 'var(--acc)' }}>ads</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--tx2)' }}>System zarządzania projektami</div>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--tx2)', display: 'block', marginBottom: '5px' }}>
              Email
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="jan@honads.pl"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 'var(--r)',
                border: '.5px solid var(--brd2)', fontSize: '13px',
                background: 'var(--bg)', color: 'var(--tx)', outline: 'none'
              }}
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--tx2)', display: 'block', marginBottom: '5px' }}>
              Hasło
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required placeholder="••••••••"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 'var(--r)',
                border: '.5px solid var(--brd2)', fontSize: '13px',
                background: 'var(--bg)', color: 'var(--tx)', outline: 'none'
              }}
            />
          </div>
          {error && (
            <div style={{
              background: 'var(--red-bg)', color: 'var(--red)',
              padding: '8px 12px', borderRadius: 'var(--r)',
              fontSize: '12px', marginBottom: '14px'
            }}>{error}</div>
          )}
          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', padding: '10px',
              background: loading ? 'var(--brd2)' : 'var(--acc)',
              color: '#fff', border: 'none', borderRadius: 'var(--r)',
              fontSize: '13px', fontWeight: '500'
            }}
          >
            {loading ? 'Logowanie...' : 'Zaloguj się'}
          </button>
        </form>
      </div>
    </div>
  )
}
