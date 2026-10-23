import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../features/auth/AuthContext'
import ScoringPanel from '../features/scoring/ScoringPanel'

const gameKey = (id) => `scoring:game:${id}`

function readCachedGame(id) {
  try {
    return JSON.parse(localStorage.getItem(gameKey(id)) ?? 'null')
  } catch {
    return null
  }
}

export default function ScorePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [game, setGame] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: fetchError } = await supabase
        .from('games')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (cancelled) return

      if (data) {
        setGame(data)
        try {
          localStorage.setItem(gameKey(id), JSON.stringify(data))
        } catch {
          // 暫存失敗不影響使用
        }
      } else if (fetchError && !fetchError.code) {
        // 沒有錯誤代碼 = 離線：用上次存下來的比賽資料
        const cached = readCachedGame(id)
        if (cached) setGame(cached)
        else setError('目前離線，而且這台裝置還沒開過這場比賽。')
      } else {
        setError(fetchError ? `讀取失敗：${fetchError.message}` : '找不到這場比賽。')
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  const notOwner = game?.created_by && user && game.created_by !== user.id

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <p className="mb-4 text-sm">
        <Link to="/" className="text-emerald-800 hover:underline">← 回到比賽列表</Link>
      </p>

      {loading && <p className="py-10 text-center text-stone-500">載入比賽中…</p>}
      {error && <p role="alert" className="py-10 text-center text-red-700">{error}</p>}
      {notOwner && (
        <p role="alert" className="rounded-md bg-amber-50 px-4 py-3 text-amber-800">
          這場比賽不是你建立的，只有建立者可以記錄。
        </p>
      )}
      {game && !notOwner && <ScoringPanel key={game.id} game={game} />}
    </main>
  )
}