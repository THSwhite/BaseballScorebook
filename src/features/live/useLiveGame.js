import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { replay } from '../../utils/plateAppearance'
import { buildBoxScore, buildFeed, teamTotals } from '../../utils/gameSummary'

const POLL_MS = 8000 // 即時推送失效時的保底輪詢間隔
const GENERIC_LINEUP_SIZE = 9

function toLineups(rows) {
  const out = { away: [], home: [] }
  for (const r of rows ?? []) {
    out[r.team_side]?.push({
      order: r.batting_order,
      name: r.player_name ?? '',
      number: r.jersey_number ?? null,
      playerId: r.player_id ?? null,
      position: r.position,
    })
  }
  return out
}

/**
 * 訪客看轉播：讀取比賽、先發、打席，並即時更新
 * 更新方式：Supabase Realtime 推送為主，輪詢當保底（網路或推送出問題時仍會更新）
 */
export function useLiveGame(gameId) {
  const [game, setGame] = useState(null)
  const [lineups, setLineups] = useState({ away: [], home: [] })
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)

  const eventsRef = useRef([])
  const connectedRef = useRef(false)

  const loadGame = useCallback(async () => {
    const { data, error: err } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle()
    if (err) return err.code ? setError(`讀取失敗：${err.message}`) : undefined // 沒有代碼 = 斷線，保留舊畫面
    if (!data) return setError('找不到這場比賽。')
    setGame(data)
    setUpdatedAt(Date.now())
  }, [gameId])

  const loadEvents = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('plate_appearances')
      .select('*')
      .eq('game_id', gameId)
      .order('seq')
    if (err) return err.code ? setError(`讀取失敗：${err.message}`) : undefined
    eventsRef.current = data
    setEvents(data)
    setUpdatedAt(Date.now())
  }, [gameId])

  const loadLineups = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('lineups')
      .select('*')
      .eq('game_id', gameId)
      .order('batting_order')
    // 讀不到先發名單（例如沒有開放訪客讀取）不影響轉播，只是少了名單
    if (!err) setLineups(toLineups(data))
  }, [gameId])

  const refresh = useCallback(() => Promise.all([loadGame(), loadEvents()]), [loadGame, loadEvents])

  // 初次載入
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([loadGame(), loadEvents(), loadLineups()]).finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [gameId, loadGame, loadEvents, loadLineups])

  // 即時推送 + 保底輪詢
  useEffect(() => {
    let timer = null
    const scheduleRefresh = () => {
      clearTimeout(timer)
      timer = setTimeout(refresh, 250) // 合併短時間內的多個通知
    }

    const channel = supabase
      .channel(`live-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plate_appearances' }, (payload) => {
        // 刪除通知只帶主鍵，所以不能用 game_id 過濾，改在這裡判斷是不是這場比賽的資料
        if (payload.eventType === 'INSERT' && payload.new.game_id === gameId) scheduleRefresh()
        if (payload.eventType === 'DELETE' && eventsRef.current.some((e) => e.id === payload.old?.id)) scheduleRefresh()
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => setGame((g) => (g ? { ...g, ...payload.new } : g))
      )
      .subscribe((status) => {
        const ok = status === 'SUBSCRIBED'
        connectedRef.current = ok
        setConnected(ok)
      })

    let tick = 0
    const poll = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      // 推送正常時只偶爾對一下資料；推送中斷時每個週期都更新
      if (connectedRef.current && ++tick % 4 !== 0) return
      refresh()
    }, POLL_MS)

    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', refresh)

    return () => {
      clearTimeout(timer)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', refresh)
      supabase.removeChannel(channel)
    }
  }, [gameId, refresh])

  const ctx = useMemo(
    () => ({
      innings: game?.innings ?? 9,
      lineupSize: {
        away: lineups.away.length || GENERIC_LINEUP_SIZE,
        home: lineups.home.length || GENERIC_LINEUP_SIZE,
      },
    }),
    [game?.innings, lineups]
  )

  const state = useMemo(() => replay(events, ctx), [events, ctx])
  const groups = useMemo(() => buildFeed(events), [events])
  const totals = useMemo(() => teamTotals(events), [events])
  const boxScore = useMemo(() => buildBoxScore(events, lineups), [events, lineups])

  return { loading, error, game, lineups, events, state, groups, totals, boxScore, connected, updatedAt, refresh }
}