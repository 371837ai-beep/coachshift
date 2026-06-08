'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } }
      })
      if (error) setError(error.message)
      else alert('確認メールを送信しました。確認後ログインしてください。')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else router.push('/')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', fontFamily: 'sans-serif' }}>
      <div style={{ background: '#161b22', padding: 32, borderRadius: 12, width: '100%', maxWidth: 360, boxSizing: 'border-box', border: '1px solid #30363d' }}>
        <h2 style={{ color: '#c9d1d9', textAlign: 'center', margin: '0 0 24px' }}>{isSignUp ? 'コーチ新規登録' : 'コーチログイン'}</h2>
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isSignUp && (
            <input type="text" placeholder="名前" value={name} onChange={e => setName(e.target.value)} required style={inpStyle} />
          )}
          <input type="email" placeholder="メールアドレス" value={email} onChange={e => setEmail(e.target.value)} required style={inpStyle} />
          <input type="password" placeholder="パスワード" value={password} onChange={e => setPassword(e.target.value)} required style={inpStyle} />
          {error && <p style={{ color: '#f85149', fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ background: '#238636', color: '#fff', border: 'none', padding: 12, borderRadius: 6, fontWeight: 'bold', cursor: 'pointer' }}>
            {loading ? '処理中…' : isSignUp ? '登録する' : 'ログイン'}
          </button>
        </form>
        <p onClick={() => setIsSignUp(!isSignUp)} style={{ color: '#58a6ff', textAlign: 'center', fontSize: 13, marginTop: 20, cursor: 'pointer' }}>
          {isSignUp ? 'すでにアカウントをお持ちの方はこちら' : '新しく登録する方はこちら'}
        </p>
      </div>
    </div>
  )
}

const inpStyle = { background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, padding: 12, color: '#c9d1d9', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }
