import { useEffect, useMemo, useState } from 'react'
import { fetchPlayers, errorMessage } from './teamsApi'
import { POSITION_NAMES } from '../../utils/baseballRules'
import { errorClass, inputClass, mutedClass } from '../../components/styles'

/**
 * 從球隊名單挑選球員（先發名單、換人都會用到）
 *
 * <PlayerPicker
 *   teamId={team.id}
 *   excludeIds={已排入先發的 player.id 陣列}
 *   onPick={(player) => ...}
 * />
 */
export default function PlayerPicker({ teamId, excludeIds = [], onPick }) {
  // 記下這份名單是哪一隊的：teamId 換了但還沒讀完，就是「載入中」
  const [loaded, setLoaded] = useState({ teamId: null, players: [], error: '' })
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    fetchPlayers(teamId)
      .then((players) => !cancelled && setLoaded({ teamId, players, error: '' }))
      .catch((err) => !cancelled && setLoaded({ teamId, players: [], error: errorMessage(err) }))
    return () => {
      cancelled = true
    }
  }, [teamId])

  const loading = !!teamId && loaded.teamId !== teamId
  const players = useMemo(() => (loading ? [] : loaded.players), [loading, loaded.players])
  const error = loading ? '' : loaded.error

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return players
    return players.filter(
      (p) => p.name.toLowerCase().includes(q) || String(p.jersey_number ?? '') === q
    )
  }, [players, query])

  if (!teamId) return <p className={mutedClass}>請先選擇球隊。</p>

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜尋姓名或背號"
        aria-label="搜尋球員"
        className={inputClass}
      />

      {error && <p role="alert" className={errorClass}>{error}</p>}
      {loading && <p className={mutedClass}>載入中…</p>}
      {!loading && !error && players.length === 0 && (
        <p className={mutedClass}>這支球隊還沒有球員，請先到「球隊管理」新增。</p>
      )}
      {!loading && players.length > 0 && filtered.length === 0 && (
        <p className={mutedClass}>找不到符合的球員。</p>
      )}

      <ul className="grid max-h-80 gap-1 overflow-y-auto">
        {filtered.map((p) => {
          const used = excludeIds.includes(p.id)
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={used}
                onClick={() => onPick?.(p)}
                className="flex min-h-12 w-full items-center gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-left text-stone-900 hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white"
              >
                <span className="w-10 tabular-nums text-stone-500">{p.jersey_number ?? '–'}</span>
                <span className="flex-1">{p.name}</span>
                <span className={mutedClass}>
                  {used ? '已排入' : (POSITION_NAMES[p.primary_position] ?? p.primary_position ?? '')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
