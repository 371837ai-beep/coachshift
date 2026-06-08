'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function MainPage() {
  return (
    <div style={{ padding: 20 }}>
      <h1>代理募集リスト</h1>
      <p>読み込み中...</p>
    </div>
  )
}
