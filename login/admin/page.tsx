'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, SubRequest, Coach, getMyCoach } from '@/lib/supabase'

export default function AdminPage() {
  const router = useRouter()
  const [coach, setCoach] = useState<Coach | null>(null)
  const [requests, setRequests] = useState<SubRequest[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const { data, error } = await supabase
      .from('sub_requests')
      .select('*, sub_responses(*)')
      .order('shift_date', { ascending: true })
    if (!error && data) setRequests(data as SubRequest[])
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const me = await getMyCoach()
      if (!me?.is_admin) { router.push('/'); return }
      setCoach(me)
      fetchData()
    })
  }, [fetchData, router])

  const handleDelete = async (id: string) => {
    if (!confirm('本当に削除しますか？')) return
    await supabase.from('sub_requests').delete().eq('id', id)
    fetchData()
  }

  if (loading && !coach) return <div>Loading...</div>

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>管理者ダッシュボード</h1>
      <button onClick={() => router.push('/')} style={{ marginBottom: 20 }}>← 戻る</button>
      
      {requests.map(req => (
        <div key={req.id} style={{ border: '1px solid #ccc', padding: 15, marginBottom: 10, borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <p style={{ fontWeight: 'bold' }}>{req.shift_date} - {req.coach_name}</p>
            <button onClick={() => handleDelete(req.id)} style={{ color: 'red' }}>削除</button>
          </div>
          <p style={{ fontSize: 13 }}>回答数: {req.sub_responses.length}件</p>
          <div style={{ fontSize: 12, marginTop: 5 }}>
            {req.sub_responses.map(r => <span key={r.id} style={{ marginRight: 5 }}>{r.user_name}({r.choice})</span>)}
          </div>
        </div>
      ))}
    </div>
  )
}
