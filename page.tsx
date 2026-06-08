'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, SubRequest, Coach, getMyCoach } from '@/lib/supabase'

// ─── 定数 ────────────────────────────────────────────
const CHOICE_CONFIG = {
  ok:    { label: '可',   bg: '#16a34a', light: '#dcfce7', text: '#15803d', emoji: '✅' },
  maybe: { label: '△',   bg: '#d97706', light: '#fef3c7', text: '#b45309', emoji: '🔶' },
  ng:    { label: '不可', bg: '#dc2626', light: '#fee2e2', text: '#b91c1c', emoji: '❌' },
} as const

const formatDate = (d: string) => {
  const dt   = new Date(d + 'T00:00:00')          // タイムゾーンずれ防止
  const days = ['日','月','火','水','木','金','土']
  return `${dt.getMonth()+1}/${dt.getDate()}（${days[dt.getDay()]}）`
}

// ─── メインページ ─────────────────────────────────────
export default function MainPage() {
  const router = useRouter()
  const [coach,      setCoach]      = useState<Coach | null>(null)
  const [requests,   setRequests]   = useState<SubRequest[]>([])
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<'list' | 'create'>('list')
  const [voting,     setVoting]     = useState<string | null>(null)    // 投票中のrequestId
  const [form,       setForm]       = useState({ shift_date: '', coach_name: '' })
  const [submitting, setSubmitting] = useState(false)
  const [toast,      setToast]      = useState<{ type: 'ok'|'error'; text: string } | null>(null)

  // ─── toast 表示ヘルパー ─────────────────────────────
  const showToast = (type: 'ok'|'error', text: string) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── データ取得 ─────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('sub_requests')
      .select('*, sub_responses(id, user_id, user_name, choice)')
      .eq('status', 'open')
      .order('shift_date', { ascending: true })
    if (error) { console.error(error); return }
    setRequests((data ?? []) as SubRequest[])
    setLoading(false)
  }, [])

  // ─── 初期化 ─────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }

      const me = await getMyCoach()
      if (!me) { router.push('/login'); return }
      setCoach(me)
      // 作成フォームのコーチ名を自動補完
      setForm(f => ({ ...f, coach_name: me.name }))
      fetchRequests()
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.push('/login')
    })

    const channel = supabase
      .channel('main-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_responses' }, fetchRequests)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_requests'  }, fetchRequests)
      .subscribe()

    return () => {
      subscription.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [fetchRequests, router])

  // ─── 投票（楽観的UI） ──────────────────────────────
  const handleVote = async (requestId: string, choice: 'ok'|'maybe'|'ng') => {
    if (!coach || voting) return
    setVoting(requestId)

    // ── 楽観的に即時反映 ──
    setRequests(prev => prev.map(req => {
      if (req.id !== requestId) return req
      const filtered = req.sub_responses.filter(r => r.user_id !== coach.id)
      return {
        ...req,
        sub_responses: [...filtered, {
          id: 'optimistic', request_id: requestId,
          user_id: coach.id, user_name: coach.name,
          choice, created_at: new Date().toISOString(),
        }],
      }
    }))

    const { error } = await supabase
      .from('sub_responses')
      .upsert(
        { request_id: requestId, user_id: coach.id, user_name: coach.name, choice },
        { onConflict: 'request_id,user_id' }
      )

    if (error) {
      showToast('error', '回答の送信に失敗しました')
      fetchRequests()   // ロールバック
    }
    setVoting(null)
  }

  // ─── 募集作成 ──────────────────────────────────────
  const handleCreate = async () => {
    if (!form.shift_date) { showToast('error', 'シフト日を選択してください'); return }
    if (!form.coach_name.trim()) { showToast('error', 'コーチ名を入力してください'); return }

    setSubmitting(true)
    const { error } = await supabase.from('sub_requests').insert({
      shift_date: form.shift_date,
      coach_name: form.coach_name.trim(),
      status:     'open',
      created_by: coach?.id ?? null,
    })
    setSubmitting(false)

    if (error) { showToast('error', '作成失敗: ' + error.message); return }
    showToast('ok', '📣 募集を作成しました！LINEに通知されます')
    setForm(f => ({ ...f, shift_date: '' }))  // コーチ名はそのまま保持
    setTab('list')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const myChoice = (req: SubRequest) =>
    req.sub_responses.find(r => r.user_id === coach?.id)?.choice ?? null

  // ─── Loading ────────────────────────────────────────
  if (loading || !coach) return (
    <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ width: 36, height: 36, border: '3px solid #0ea5e9', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <p style={{ color: '#475569', fontSize: 13 }}>読み込み中…</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "'Noto Sans JP', sans-serif", paddingBottom: 80 }}>

      {/* ─── Toast ─── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'ok' ? '#16a34a' : '#dc2626',
          color: '#fff', padding: '12px 22px', borderRadius: 14,
          fontSize: 14, fontWeight: 600, zIndex: 9999,
          boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
          whiteSpace: 'nowrap',
        }}>
          {toast.text}
        </div>
      )}

      {/* ─── Header ─── */}
      <div style={{
        background: 'linear-gradient(135deg, #0d1117 0%, #0f3460 100%)',
        padding: '20px 20px 0',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: '50%', background: 'rgba(14,165,233,0.08)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 18 }}>🎾</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 4, fontWeight: 700 }}>COACHSHIFT</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: 0 }}>
              こんにちは、<span style={{ color: '#7dd3fc', fontWeight: 700 }}>{coach.name}</span> コーチ
              {coach.is_admin && <span style={{ marginLeft: 8, background: '#f59e0b', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>管理者</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {coach.is_admin && (
              <button onClick={() => router.push('/admin')} style={hBtn('#0ea5e9')}>管理</button>
            )}
            <button onClick={handleLogout} style={hBtn('rgba(255,255,255,0.12)')}>ログアウト</button>
          </div>
        </div>

        {/* タブ */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 4 }}>
          {(['list', 'create'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '10px 0', border: 'none', borderRadius: 10, cursor: 'pointer',
              fontSize: 14, fontWeight: 700, transition: 'all 0.18s',
              background: tab === t ? '#0ea5e9' : 'transparent',
              color:      tab === t ? '#fff' : 'rgba(255,255,255,0.45)',
            }}>
              {t === 'list' ? `📋 募集一覧 (${requests.length})` : '➕ 募集作成'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 480, margin: '0 auto' }}>

        {/* ══ 募集一覧 ══════════════════════════════════ */}
        {tab === 'list' && (
          requests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '70px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>📭</div>
              <p style={{ fontSize: 15, margin: 0 }}>現在、募集中のシフトはありません</p>
              <button onClick={() => setTab('create')} style={{
                marginTop: 20, padding: '10px 24px', border: 'none', borderRadius: 10,
                background: '#0ea5e9', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14,
              }}>
                ➕ 募集を作成する
              </button>
            </div>
          ) : (
            requests.map(req => {
              const my     = myChoice(req)
              const counts = { ok: 0, maybe: 0, ng: 0 }
              req.sub_responses.forEach(r => counts[r.choice]++)
              const isVoting = voting === req.id

              return (
                <div key={req.id} style={{
                  background: '#fff', borderRadius: 18, padding: '18px',
                  marginBottom: 12,
                  boxShadow: my ? `0 0 0 2px ${CHOICE_CONFIG[my].bg}, 0 4px 16px rgba(0,0,0,0.08)` : '0 2px 12px rgba(0,0,0,0.06)',
                  transition: 'box-shadow 0.2s',
                  opacity: isVoting ? 0.7 : 1,
                }}>
                  {/* 上部：日付＋回答バッジ */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <p style={{ fontWeight: 800, fontSize: 18, margin: 0, color: '#0f172a', letterSpacing: 0.5 }}>
                        {formatDate(req.shift_date)}
                      </p>
                      <p style={{ color: '#64748b', fontSize: 13, margin: '3px 0 0' }}>
                        {req.coach_name} コーチ
                      </p>
                    </div>
                    {my ? (
                      <div style={{
                        background: CHOICE_CONFIG[my].light, color: CHOICE_CONFIG[my].text,
                        padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}>
                        {CHOICE_CONFIG[my].emoji} {CHOICE_CONFIG[my].label}
                      </div>
                    ) : (
                      <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>未回答</div>
                    )}
                  </div>

                  {/* 回答者タグ */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, minHeight: 24 }}>
                    {req.sub_responses.length === 0
                      ? <span style={{ color: '#cbd5e1', fontSize: 12 }}>まだ回答なし</span>
                      : req.sub_responses.map((res, i) => (
                          <span key={i} style={{
                            background: CHOICE_CONFIG[res.choice].light,
                            color:      CHOICE_CONFIG[res.choice].text,
                            padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                          }}>
                            {res.user_name}：{CHOICE_CONFIG[res.choice].label}
                          </span>
                        ))
                    }
                  </div>

                  {/* 集計バー */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
                    {(['ok', 'maybe', 'ng'] as const).map(c => (
                      <div key={c} style={{ textAlign: 'center', background: CHOICE_CONFIG[c].light, borderRadius: 10, padding: '6px 0' }}>
                        <p style={{ fontSize: 11, color: CHOICE_CONFIG[c].text, margin: 0, fontWeight: 600 }}>{CHOICE_CONFIG[c].label}</p>
                        <p style={{ fontSize: 22, fontWeight: 800, color: CHOICE_CONFIG[c].bg, margin: '1px 0 0' }}>{counts[c]}</p>
                      </div>
                    ))}
                  </div>

                  {/* 3択ボタン */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['ok', 'maybe', 'ng'] as const).map(c => (
                      <button
                        key={c}
                        onClick={() => handleVote(req.id, c)}
                        disabled={!!voting}
                        style={{
                          flex: 1, padding: '12px 0', border: 'none', borderRadius: 12,
                          cursor: voting ? 'not-allowed' : 'pointer',
                          fontSize: 15, fontWeight: 800,
                          background: my === c ? CHOICE_CONFIG[c].bg     : CHOICE_CONFIG[c].light,
                          color:      my === c ? '#fff'                   : CHOICE_CONFIG[c].text,
                          transform:  my === c ? 'scale(1.04)'            : 'scale(1)',
                          transition: 'all 0.15s',
                          boxShadow:  my === c ? `0 4px 12px ${CHOICE_CONFIG[c].bg}55` : 'none',
                        }}
                      >
                        {CHOICE_CONFIG[c].label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })
          )
        )}

        {/* ══ 募集作成 ════════════════════════════════════ */}
        {tab === 'create' && (
          <div style={{ background: '#fff', borderRadius: 18, padding: '24px 20px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '0 0 22px', letterSpacing: 0.5 }}>
              新しい代理募集
            </h2>

            <label style={lbl}>シフト日 <Req /></label>
            <input
              type="date"
              value={form.shift_date}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setForm(f => ({ ...f, shift_date: e.target.value }))}
              style={inp}
              onFocus={e => (e.target.style.borderColor = '#0ea5e9')}
              onBlur={e  => (e.target.style.borderColor = '#e2e8f0')}
            />

            <label style={{ ...lbl, marginTop: 16 }}>コーチ名 <Req /></label>
            <input
              type="text"
              placeholder="例：岩崎"
              value={form.coach_name}
              onChange={e => setForm(f => ({ ...f, coach_name: e.target.value }))}
              style={inp}
              onFocus={e => (e.target.style.borderColor = '#0ea5e9')}
              onBlur={e  => (e.target.style.borderColor = '#e2e8f0')}
            />
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '5px 0 0' }}>
              ※ ログインコーチ名を自動補完しています
            </p>

            <button
              onClick={handleCreate}
              disabled={submitting}
              style={{
                width: '100%', marginTop: 24, padding: '14px', border: 'none',
                borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer',
                background: submitting ? '#e2e8f0' : 'linear-gradient(135deg, #0ea5e9, #0369a1)',
                color: submitting ? '#94a3b8' : '#fff',
                boxShadow: submitting ? 'none' : '0 4px 18px rgba(14,165,233,0.35)',
                transition: 'all 0.2s',
              }}
            >
              {submitting ? '送信中…' : '📣 募集を作成する'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── スタイル小物 ─────────────────────────────────────
const hBtn = (bg: string): React.CSSProperties => ({
  padding: '7px 14px', border: 'none', borderRadius: 10,
  background: bg, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
})

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8,
}

const inp: React.CSSProperties = {
  width: '100%', padding: '12px 14px', boxSizing: 'border-box',
  border: '1.5px solid #e2e8f0', borderRadius: 10,
  fontSize: 15, color: '#0f172a', outline: 'none',
  transition: 'border-color 0.2s', background: '#fff',
}

const Req = () => <span style={{ color: '#e53935' }}>*</span>
