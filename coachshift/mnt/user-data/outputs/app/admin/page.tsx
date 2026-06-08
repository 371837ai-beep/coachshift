'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, SubRequest, Coach, getMyCoach } from '@/lib/supabase'

// ─── 定数 ────────────────────────────────────────────
const CHOICE_CONFIG = {
  ok:    { label: '可',   bg: '#16a34a', light: '#dcfce7', text: '#15803d' },
  maybe: { label: '△',   bg: '#d97706', light: '#fef3c7', text: '#b45309' },
  ng:    { label: '不可', bg: '#dc2626', light: '#fee2e2', text: '#b91c1c' },
} as const

const STATUS_CONFIG = {
  open:   { label: '募集中', color: '#0ea5e9', bg: '#e0f2fe' },
  filled: { label: '決定済', color: '#16a34a', bg: '#dcfce7' },
  closed: { label: '終了',   color: '#64748b', bg: '#f1f5f9' },
} as const

const formatDate = (d: string) => {
  const dt   = new Date(d + 'T00:00:00')
  const days = ['日','月','火','水','木','金','土']
  return `${dt.getMonth()+1}/${dt.getDate()}（${days[dt.getDay()]}）`
}

// ─── 管理者ダッシュボード ─────────────────────────────
export default function AdminPage() {
  const router = useRouter()
  const [coach,        setCoach]        = useState<Coach | null>(null)
  const [requests,     setRequests]     = useState<SubRequest[]>([])
  const [loading,      setLoading]      = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'all'|'open'|'filled'|'closed'>('all')
  const [expanded,     setExpanded]     = useState<string | null>(null)
  const [toast,        setToast]        = useState<{ type: 'ok'|'error'; text: string } | null>(null)
  const [deleting,     setDeleting]     = useState<string | null>(null)

  const showToast = (type: 'ok'|'error', text: string) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── データ取得 ───────────────────────────────────
  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase
      .from('sub_requests')
      .select('*, sub_responses(id, user_id, user_name, choice, created_at)')
      .order('shift_date', { ascending: true })
    if (error) { console.error(error); return }
    setRequests((data ?? []) as SubRequest[])
    setLoading(false)
  }, [])

  // ─── 認証＋管理者チェック ─────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }

      const me = await getMyCoach()
      if (!me) { router.push('/login'); return }

      // 管理者でなければメインに戻す
      if (!me.is_admin) { router.push('/'); return }

      setCoach(me)
      setAuthChecking(false)
      fetchAll()
    })

    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_requests'  }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_responses' }, fetchAll)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchAll, router])

  // ─── ステータス更新 ───────────────────────────────
  const updateStatus = async (id: string, status: 'open'|'filled'|'closed') => {
    const { error } = await supabase.from('sub_requests').update({ status }).eq('id', id)
    if (error) showToast('error', 'ステータス更新に失敗しました')
    else showToast('ok', `ステータスを「${STATUS_CONFIG[status].label}」に変更しました`)
  }

  // ─── 削除（確認ダイアログなし → インライン確認UI） ─
  const deleteRequest = async (id: string) => {
    if (deleting !== id) { setDeleting(id); return }   // 1回目：確認状態へ
    const { error } = await supabase.from('sub_requests').delete().eq('id', id)
    setDeleting(null)
    if (error) showToast('error', '削除に失敗しました')
    else { showToast('ok', '募集を削除しました'); setExpanded(null) }
  }

  // ─── 集計 ─────────────────────────────────────────
  const summary = {
    total:   requests.length,
    open:    requests.filter(r => r.status === 'open').length,
    filled:  requests.filter(r => r.status === 'filled').length,
    okTotal: requests.reduce((a, r) => a + r.sub_responses.filter(s => s.choice === 'ok').length, 0),
  }

  const filtered = filterStatus === 'all'
    ? requests
    : requests.filter(r => r.status === filterStatus)

  // ─── Loading / Auth ───────────────────────────────
  if (authChecking || loading) return (
    <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ width: 36, height: 36, border: '3px solid #0ea5e9', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <p style={{ color: '#475569', fontSize: 13 }}>認証確認中…</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', fontFamily: "'Noto Sans JP', sans-serif", paddingBottom: 80 }}>

      {/* ─── Toast ─── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'ok' ? '#16a34a' : '#dc2626',
          color: '#fff', padding: '12px 22px', borderRadius: 14,
          fontSize: 14, fontWeight: 600, zIndex: 9999,
          boxShadow: '0 8px 28px rgba(0,0,0,0.25)', whiteSpace: 'nowrap',
        }}>
          {toast.text}
        </div>
      )}

      {/* ─── Header ─── */}
      <div style={{ background: 'linear-gradient(135deg, #0d1117, #1e293b)', padding: '20px 20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 640, margin: '0 auto' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 4, fontWeight: 700 }}>ADMIN DASHBOARD</span>
              <span style={{ background: '#f59e0b', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>管理者</span>
            </div>
            <h1 style={{ color: '#f1f5f9', fontSize: 20, fontWeight: 800, margin: '4px 0 0' }}>管理ダッシュボード</h1>
            <p style={{ color: '#64748b', fontSize: 12, margin: '4px 0 0' }}>{coach?.name} コーチ</p>
          </div>
          <button onClick={() => router.push('/')} style={{
            padding: '8px 16px', border: 'none', borderRadius: 10,
            background: 'rgba(255,255,255,0.08)', color: '#94a3b8',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>← 戻る</button>
        </div>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 640, margin: '0 auto' }}>

        {/* ─── サマリーカード ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: '総募集',  value: summary.total,   color: '#0f172a' },
            { label: '募集中',  value: summary.open,    color: '#0ea5e9' },
            { label: '決定済',  value: summary.filled,  color: '#16a34a' },
            { label: '「可」数', value: summary.okTotal, color: '#8b5cf6' },
          ].map((s, i) => (
            <div key={i} style={{
              background: '#fff', borderRadius: 14, padding: '14px 8px',
              textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}>
              <p style={{ fontSize: 26, fontWeight: 800, color: s.color, margin: 0 }}>{s.value}</p>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '3px 0 0', fontWeight: 600 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* ─── フィルター ─── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {(['all', 'open', 'filled', 'closed'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{
              padding: '8px 16px', border: 'none', borderRadius: 20,
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
              whiteSpace: 'nowrap', transition: 'all 0.15s',
              background: filterStatus === s ? '#0f172a' : '#fff',
              color:      filterStatus === s ? '#fff' : '#64748b',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            }}>
              {s === 'all'
                ? `全て (${requests.length})`
                : `${STATUS_CONFIG[s].label} (${requests.filter(r => r.status === s).length})`
              }
            </button>
          ))}
        </div>

        {/* ─── リスト ─── */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
            該当する募集がありません
          </div>
        ) : filtered.map(req => {
          const counts     = { ok: 0, maybe: 0, ng: 0 }
          req.sub_responses.forEach(r => counts[r.choice]++)
          const isExpanded = expanded === req.id
          const st         = STATUS_CONFIG[req.status]
          const isDeleting = deleting === req.id

          return (
            <div key={req.id} style={{
              background: '#fff', borderRadius: 16, marginBottom: 12,
              overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}>
              {/* カードヘッダー（タップで展開） */}
              <div
                onClick={() => { setExpanded(isExpanded ? null : req.id); setDeleting(null) }}
                style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>
                      {formatDate(req.shift_date)}
                    </span>
                    <span style={{
                      background: st.bg, color: st.color,
                      padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    }}>
                      {st.label}
                    </span>
                  </div>
                  <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>{req.coach_name} コーチ</p>
                </div>

                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  {(['ok', 'maybe', 'ng'] as const).map(c => (
                    <div key={c} style={{
                      background: CHOICE_CONFIG[c].light, color: CHOICE_CONFIG[c].text,
                      borderRadius: 8, padding: '3px 9px', fontSize: 13, fontWeight: 700,
                    }}>
                      {CHOICE_CONFIG[c].label} {counts[c]}
                    </div>
                  ))}
                  <span style={{ color: '#94a3b8', fontSize: 16, marginLeft: 4 }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {/* 展開エリア */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 20px' }}>

                  {/* 回答者詳細 */}
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 10, letterSpacing: 1.5 }}>
                    回答詳細 ({req.sub_responses.length}件)
                  </p>
                  {req.sub_responses.length === 0
                    ? <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>まだ回答なし</p>
                    : (
                      <div style={{ marginBottom: 16 }}>
                        {req.sub_responses.map((res, i) => (
                          <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '9px 14px', borderRadius: 10, marginBottom: 6,
                            background: CHOICE_CONFIG[res.choice].light,
                          }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{res.user_name}</span>
                            <span style={{ color: CHOICE_CONFIG[res.choice].text, fontWeight: 800, fontSize: 13 }}>
                              {CHOICE_CONFIG[res.choice].label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  }

                  {/* ステータス変更 */}
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 8, letterSpacing: 1.5 }}>
                    ステータス変更
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    {(['open', 'filled', 'closed'] as const).map(s => (
                      <button key={s} onClick={() => updateStatus(req.id, s)} style={{
                        flex: 1, padding: '9px 0', border: 'none', borderRadius: 10,
                        cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
                        background: req.status === s ? STATUS_CONFIG[s].color : STATUS_CONFIG[s].bg,
                        color:      req.status === s ? '#fff' : STATUS_CONFIG[s].color,
                        transform:  req.status === s ? 'scale(1.03)' : 'scale(1)',
                      }}>
                        {STATUS_CONFIG[s].label}
                      </button>
                    ))}
                  </div>

                  {/* 削除（2ステップ確認） */}
                  <button
                    onClick={() => deleteRequest(req.id)}
                    style={{
                      width: '100%', padding: '11px', borderRadius: 10, cursor: 'pointer',
                      fontSize: 13, fontWeight: 700, transition: 'all 0.2s',
                      background: isDeleting ? '#dc2626' : 'transparent',
                      color:      isDeleting ? '#fff' : '#ef4444',
                      border: `1.5px solid ${isDeleting ? '#dc2626' : '#fecaca'}`,
                    }}
                  >
                    {isDeleting ? '⚠️ もう一度タップして削除を確定' : '🗑 この募集を削除'}
                  </button>
                  {isDeleting && (
                    <button onClick={() => setDeleting(null)} style={{
                      width: '100%', marginTop: 8, padding: '9px', border: '1px solid #e2e8f0',
                      borderRadius: 10, background: 'transparent', color: '#64748b',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}>
                      キャンセル
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
