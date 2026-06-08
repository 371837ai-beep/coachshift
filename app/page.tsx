'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, SubRequest, Coach, getMyCoach } from '@/lib/supabase'

export default function MainPage() {
  const router = useRouter()
  const [coach, setCoach] = useState<Coach | null>(null)
  const [requests, setRequests] = useState<SubRequest[]>([])
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const me = await getMyCoach()
      if (!me) { router.push('/login'); return }
      setCoach(me)
      fetchRequests()
    })
    const channel = supabase
      .channel('main-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_responses' }, fetchRequests)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_requests' }, fetchRequests)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchRequests, router])

  if (loading) return <div>読み込み中...</div>
  return <div><h1>代理募集リスト</h1></div>
}
