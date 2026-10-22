import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS = {
  scheduled: { label: '未開賽', className: 'bg-stone-200 text-stone-700' },
  live: { label: '進行中', className: 'bg-red-100 text-red-700' },
  finished: { label: '已結束', className: 'bg-emerald-100 text-emerald-800' },
}

/**
 * 比賽列表
 * @param {boolean} canManage  已登入的記錄員為 true：顯示「記錄」「先發」「刪除」
 * @param {(game: object) => void} onEditLineup  點「先發」時觸發
 */
export default function GameList({ canManage = false, onEditLineup }) {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('games')
      .select('*')
      .order('game_date', { ascending: false })
      .order('game_time', { ascending: false })
    if (fetchError) setError(`讀取失敗：${fetchError.message}`)
    else setGames(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // 比賽狀態或比分變動時自動更新列表
    const channel = supabase
      .channel('games-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  async function handleDelete(game) {
    if (!window.confirm(`確定刪除「${game.away_team} vs ${game.home_team}」？此動作無法復原。`)) return
    const { error: deleteError } = await supabase.from('games').delete().eq('id', game.id)
    if (deleteError) setError(`刪除失敗：${deleteError.message}`)
    else setGames((list) => list.filter((g) => g.id !== game.id))
  }

  if (loading) return <p className="py-8 text-center text-stone-500">載入比賽中…</p>
  if (error) return <p role="alert" className="py-8 text-center text-red-700">{error}</p>
  if (games.length === 0) {
    return (
      <p className="py-8 text-center text-stone-500">
        還沒有任何比賽。{canManage ? '建立第一場比賽開始記錄。' : '請稍後再回來看看。'}
      </p>
    )
  }

  return (
    <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
      {games.map((game) => {
        const status = STATUS[game.status] ?? STATUS.scheduled
        return (
          <li key={game.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
            <div className="min-w-0 flex-1">
              <Link to={`/game/${game.id}`} className="block text-lg font-semibold text-stone-900 hover:text-emerald-800">
                {game.away_team}
                <span className="mx-2 tabular-nums">{game.away_score}</span>
                <span className="text-stone-400">:</span>
                <span className="mx-2 tabular-nums">{game.home_score}</span>
                {game.home_team}
              </Link>
              <p className="mt-0.5 text-sm text-stone-500">
                {game.game_date}
                {game.game_time ? ` ${game.game_time.slice(0, 5)}` : ''}
                {game.location ? `　${game.location}` : ''}
              </p>
            </div>

            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
              {status.label}
            </span>

            {canManage && (
              <div className="flex gap-2 text-sm">
                <button type="button" onClick={() => onEditLineup?.(game)} className="rounded-md border border-stone-300 px-3 py-1.5 hover:bg-stone-50">
                  先發
                </button>
                <Link to={`/game/${game.id}/score`} className="rounded-md bg-emerald-800 px-3 py-1.5 text-white hover:bg-emerald-900">
                  記錄
                </Link>
                <button type="button" onClick={() => handleDelete(game)} className="rounded-md px-3 py-1.5 text-red-700 hover:bg-red-50">
                  刪除
                </button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
