import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnon)

// ─── 共通型定義 ───────────────────────────────────────
export interface Coach {
  id:         string
  name:       string
  is_admin:   boolean
  created_at: string
}

export interface SubRequest {
  id:           string
  shift_date:   string
  coach_name:   string
  status:       'open' | 'filled' | 'closed'
  created_by:   string | null
  created_at:   string
  sub_responses: SubResponse[]
}

export interface SubResponse {
  id:         string
  request_id: string
  user_id:    string
  user_name:  string
  choice:     'ok' | 'maybe' | 'ng'
  created_at: string
}

// ─── ヘルパー：ログイン中コーチ情報を取得 ─────────────
export async function getMyCoach(): Promise<Coach | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('coaches')
    .select('*')
    .eq('id', user.id)
    .single()
  return data ?? null
}
