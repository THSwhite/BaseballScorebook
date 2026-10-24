import { useEffect, useMemo, useState } from 'react'
import { fetchPlayers, errorMessage } from './teamsApi'

/**
 * 從球隊名單挑選球員（給 LineupEditor 使用）
 *
 * <PlayerPicker
 *   teamId={team.id}
 *   excludeIds={已排入先發的 player.id 陣列}
 *   onPick={(player) => ...}
 * />
 */
export default function PlayerPicker({ teamId, excludeIds = [], onPick }) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!teamId) {
      setPlayers([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    fetchPlayers(teamId)
      .then((data) => !cancelled && setPlayers(data))
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [teamId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return players
    return players.filter(
      (p) => p.name.toLowerCase().includes(q) || String(p.jersey_number ?? '') === q
    )
  }, [players, query])

  if (!teamId) return <p className="tm-muted">請先選擇球隊。</p>

  return (
    <div className="tm-picker">
      <input
        className="tm-picker-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜尋姓名或背號"
      />

      {error && <p className="tm-error">{error}</p>}
      {loading && <p className="tm-muted">載入中…</p>}
      {!loading && !error && players.length === 0 && (
        <p className="tm-muted">這支球隊還沒有球員，請先到「球隊管理」新增。</p>
      )}
      {!loading && players.length > 0 && filtered.length === 0 && (
        <p className="tm-muted">找不到符合的球員。</p>
      )}

      <ul className="tm-picker-list">
        {filtered.map((p) => {
          const used = excludeIds.includes(p.id)
          return (
            <li key={p.id}>
              <button
                type="button"
                className="tm-picker-item"
                disabled={used}
                onClick={() => onPick?.(p)}
              >
                <span className="tm-num">{p.jersey_number ?? '–'}</span>
                <span className="tm-picker-name">{p.name}</span>
                <span className="tm-muted">{used ? '已排入' : p.primary_position ?? ''}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}