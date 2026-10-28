import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  allowsFielding,
  evaluatePlateAppearance,
  fieldingString,
  replay,
  validateDetails,
} from '../../utils/plateAppearance'
import { describePlateAppearance } from '../../utils/formatters'
import { isPA } from '../../utils/gameSummary'
import * as queue from './offlineQueue'

const TABLE = 'plate_appearances'
const GENERIC_LINEUP_SIZE = 9 // 沒設定先發名單時，用 9 棒輪轉
const NOTE_MAX = 200 // 備註最多幾個字

const eventsKey = (id) => `scoring:events:${id}`
const lineupsKey = (id) => `scoring:lineups:${id}`

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 儲存空間不足：略過，不影響線上記錄
  }
}

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

// 伺服器資料 + 還沒送出的新增 − 還沒送出的刪除
function mergeWithQueue(serverRows, gameId) {
  const ops = queue.getQueue()
  const deleted = new Set(ops.filter((o) => o.type === 'delete').map((o) => o.id))
  const pendingRows = ops
    .filter((o) => o.type === 'insert' && o.row.game_id === gameId)
    .map((o) => o.row)
  const byId = new Map()
  for (const row of [...serverRows, ...pendingRows]) {
    if (!deleted.has(row.id)) byId.set(row.id, row)
  }
  return [...byId.values()].sort((a, b) => a.seq - b.seq)
}

const gamePatch = (state, eventCount) => ({
  away_score: state.score.away,
  home_score: state.score.home,
  status: state.over ? 'finished' : eventCount === 0 ? 'scheduled' : 'live',
})

/**
 * 逐打席記錄的狀態中心
 * 回傳：目前局面、目前打者、record / undo、同步狀態…
 */
export function useScoringGame(game) {
  const [events, setEvents] = useState(() => readJson(eventsKey(game.id), []))
  const [lineups, setLineups] = useState(() => readJson(lineupsKey(game.id), { away: [], home: [] }))
  const [loading, setLoading] = useState(() => readJson(lineupsKey(game.id), null) === null)
  const [error, setError] = useState('')
  const [manualFinished, setManualFinished] = useState(game.status === 'finished')

  const [pending, setPending] = useState(queue.pendingCount())
  const [failed, setFailed] = useState(queue.getFailed())
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const touched = useRef(false) // 使用者已經操作過：不要讓遲到的讀取結果蓋掉畫面

  // 同步狀態
  useEffect(() => {
    const refresh = () => {
      setPending(queue.pendingCount())
      setFailed(queue.getFailed())
    }
    const unsubscribe = queue.subscribe(refresh)
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    const stopSync = queue.startAutoSync()
    return () => {
      unsubscribe()
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      stopSync()
    }
  }, [])

  // 載入先發名單與已有的打席
  useEffect(() => {
    let cancelled = false
    async function load() {
      const [lineupRes, eventRes] = await Promise.all([
        supabase.from('lineups').select('*').eq('game_id', game.id).order('batting_order'),
        supabase.from(TABLE).select('*').eq('game_id', game.id).order('seq'),
      ])
      if (cancelled) return
      if (!lineupRes.error) {
        const next = toLineups(lineupRes.data)
        setLineups(next)
        writeJson(lineupsKey(game.id), next)
      }
      if (!eventRes.error) {
        if (!touched.current) setEvents(mergeWithQueue(eventRes.data, game.id))
      } else if (eventRes.error.code) {
        // 有錯誤代碼 = 不是斷線（例如資料表還沒建立）
        setError(`讀取記錄失敗：${eventRes.error.message}`)
      }
      // 沒有錯誤代碼 = 離線，沿用本機暫存
      setLoading(false)
    }
    load().catch(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [game.id])

  // 本機暫存，離線重新整理也能接續
  useEffect(() => {
    writeJson(eventsKey(game.id), events)
  }, [events, game.id])

  const ctx = useMemo(
    () => ({
      innings: game.innings ?? 9,
      initialSetSize: game.set_size ?? 1, // 建立比賽時選的 1set / 2set；中途更改記在紀錄裡
      lineupSize: {
        away: lineups.away.length || GENERIC_LINEUP_SIZE,
        home: lineups.home.length || GENERIC_LINEUP_SIZE,
      },
    }),
    [game.innings, game.set_size, lineups]
  )

  const state = useMemo(() => replay(events, ctx), [events, ctx])
  const paCount = useMemo(() => events.filter(isPA).length, [events]) // 備註與 set 更改不算打席
  const finished = state.over || manualFinished

  const side = state.half === 'top' ? 'away' : 'home'
  const order = state.nextBatter[side]
  const currentBatter = lineups[side][order - 1] ?? { order, name: '', number: null, playerId: null }

  /** 預覽／驗證一個打席（不寫入） */
  const evaluate = useCallback(
    (result, movements, batterTo, extras = {}) =>
      evaluatePlateAppearance(state, { result, batter: currentBatter, movements, batterTo, ...extras }, ctx),
    [state, currentBatter, ctx]
  )

  const record = useCallback(
    ({
      result,
      movements,
      batterTo,
      direction = '',
      height = '',
      withError = false,
      withFc = false,
      fielding = [],
      errorBy = '',
      errorKind = '',
    }) => {
      if (finished) return { ok: false, error: '比賽已結束' }
      const problem = validateDetails(result, { direction, height })
      if (problem) return { ok: false, error: problem }
      const ev = evaluate(result, movements, batterTo, { withError, withFc })
      if (!ev.ok) return ev

      // 守備路線只在有出局或失誤上壘時才存；失誤來源只在有失誤時才存
      const hasError = result === 'E' || ev.record.with_error
      const extra = {
        fielding: allowsFielding(result, ev.record.outs_added) ? fieldingString(fielding) : null,
        error_by: hasError && errorBy ? Number(errorBy) : null,
        error_kind: hasError && errorKind ? errorKind : null,
      }

      const row = {
        id: queue.newId(),
        game_id: game.id,
        seq: events.length + 1,
        kind: 'pa',
        inning: state.inning,
        half: state.half,
        set_no: state.setNo,
        set_size: null,
        batting_order: currentBatter.order,
        batter_id: currentBatter.playerId,
        batter_name: currentBatter.name ?? '',
        batter_number: currentBatter.number,
        result,
        hit_type: height || null,
        hit_direction: direction || null,
        ...ev.record,
        ...extra,
        description: describePlateAppearance({
          result,
          batter: currentBatter,
          hit_direction: direction || null,
          hit_type: height || null,
          ...ev.record,
          ...extra,
        }),
      }

      touched.current = true
      setEvents((list) => [...list, row])
      queue.enqueue({ type: 'insert', table: TABLE, row })
      queue.enqueue({ type: 'game', gameId: game.id, patch: gamePatch(ev.nextState, paCount + 1) })
      return { ok: true }
    },
    [finished, evaluate, game.id, events.length, paCount, state.inning, state.half, state.setNo, currentBatter]
  )

  const undo = useCallback(() => {
    const last = events[events.length - 1]
    if (!last) return
    touched.current = true
    const rest = events.slice(0, -1)
    setEvents(rest)
    setManualFinished(false)
    if (!queue.removeInsert(last.id)) queue.enqueue({ type: 'delete', table: TABLE, id: last.id })
    queue.enqueue({ type: 'game', gameId: game.id, patch: gamePatch(replay(rest, ctx), rest.filter(isPA).length) })
  }, [events, ctx, game.id])

  const finishGame = useCallback(() => {
    setManualFinished(true)
    queue.enqueue({
      type: 'game',
      gameId: game.id,
      patch: { ...gamePatch(state, paCount), status: 'finished' },
    })
  }, [game.id, state, paCount])

  const reopenGame = useCallback(() => {
    setManualFinished(false)
    queue.enqueue({ type: 'game', gameId: game.id, patch: gamePatch(state, paCount) })
  }, [game.id, state, paCount])

  // 備註、更改 set 也是時間軸上的一筆紀錄：跟打席共用 seq，所以順序與復原都一致
  const makeRow = useCallback(
    (kind, extra) => ({
      id: queue.newId(),
      game_id: game.id,
      seq: events.length + 1,
      kind,
      inning: state.inning,
      half: state.half,
      set_no: state.setNo,
      batting_order: 0,
      batter_id: null,
      batter_name: '',
      batter_number: null,
      outs_before: state.outs,
      outs_added: 0,
      runs: 0,
      rbi: 0,
      runners: [],
      batter_to: 0,
      hit_type: null,
      hit_direction: null,
      with_error: false,
      with_fc: false,
      set_size: null,
      ...extra,
    }),
    [game.id, events.length, state.inning, state.half, state.setNo, state.outs]
  )

  const pushRow = useCallback((row) => {
    touched.current = true
    setEvents((list) => [...list, row])
    queue.enqueue({ type: 'insert', table: TABLE, row })
  }, [])

  /** 送出一則備註，會顯示在轉播的時間軸裡 */
  const addNote = useCallback(
    (text) => {
      const clean = String(text ?? '').trim().slice(0, NOTE_MAX)
      if (!clean) return { ok: false, error: '請輸入備註內容' }
      pushRow(makeRow('note', { result: 'NOTE', description: clean }))
      return { ok: true }
    },
    [makeRow, pushRow]
  )

  /** 更改「每隊連續打幾個半局」（1 = 輪流，2 = 連續兩個半局） */
  const changeSetSize = useCallback(
    (size) => {
      if (finished || (size !== 1 && size !== 2) || size === state.setSize) return
      pushRow(
        makeRow('set', {
          result: 'SET',
          set_size: size,
          description:
            size === 2 ? '改為 2set：每隊連續打 2 個半局。' : '改為 1set：每隊輪流打 1 個半局。',
        })
      )
    },
    [finished, state.setSize, makeRow, pushRow]
  )

  return {
    loading,
    error,
    lineups,
    events,
    paCount,
    state,
    currentBatter,
    finished,
    manualFinished,
    evaluate,
    record,
    undo,
    addNote,
    changeSetSize,
    finishGame,
    reopenGame,
    sync: { online, pending, failed, retry: queue.flush, clearFailed: queue.clearFailed },
  }
}