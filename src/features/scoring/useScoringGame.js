import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  allowsFielding,
  evaluatePlateAppearance,
  fieldingString,
  replay,
  validateDetails,
} from '../../utils/plateAppearance'
import { describePlateAppearance, describeSubstitutions } from '../../utils/formatters'
import {
  batterAt,
  buildLineupState,
  gameContext,
  lineupsFromRows,
  normalizeChanges,
  validateSubstitutions,
} from '../../utils/lineup'
import { isPA } from '../../utils/gameSummary'
import { emptyRow } from '../../utils/history'
import * as queue from './offlineQueue'

const TABLE = 'plate_appearances'
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

// 伺服器資料 + 依序套用還沒送出的新增、修改、刪除（含修改歷史）
function mergeWithQueue(serverRows, gameId) {
  const byId = new Map(serverRows.map((row) => [row.id, row]))
  for (const o of queue.getQueue()) {
    if (o.type === 'delete') {
      byId.delete(o.id)
    } else if ((o.type === 'insert' || o.type === 'upsert') && o.row.game_id === gameId) {
      byId.set(o.row.id, o.row)
    } else if (o.type === 'history' && o.gameId === gameId) {
      for (const id of o.deleteIds ?? []) byId.delete(id)
      for (const row of o.rows ?? []) byId.set(row.id, row)
    }
  }
  return [...byId.values()].sort((a, b) => a.seq - b.seq)
}

// 比賽不會自動結束：「已結束」只由記錄員按「結束比賽」設定（見 finishGame）
const gamePatch = (state, eventCount) => ({
  away_score: state.score.away,
  home_score: state.score.home,
  status: eventCount === 0 ? 'scheduled' : 'live',
})

/**
 * 逐打席記錄的狀態中心
 * 回傳：目前局面、目前打者、record / undo、修改歷史、同步狀態…
 */
export function useScoringGame(game) {
  const [events, setEvents] = useState(() => readJson(eventsKey(game.id), []))
  const [startLineups, setStartLineups] = useState(() => readJson(lineupsKey(game.id), { away: [], home: [] })) // 原始先發
  const [loading, setLoading] = useState(() => readJson(lineupsKey(game.id), null) === null)
  const [error, setError] = useState('')
  const [finished, setFinished] = useState(game.status === 'finished')

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
        const next = lineupsFromRows(lineupRes.data)
        setStartLineups(next)
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

  // 目前的打線 = 原始先發 + 換人紀錄
  const lineupState = useMemo(() => buildLineupState(startLineups, events), [startLineups, events])
  const lineups = lineupState.lineups

  const ctx = useMemo(
    () => gameContext({ set_size: game.set_size }, startLineups),
    [game.set_size, startLineups]
  )

  const state = useMemo(() => replay(events, ctx), [events, ctx])
  const paCount = useMemo(() => events.filter(isPA).length, [events]) // 備註與 set 更改不算打席

  const side = state.half === 'top' ? 'away' : 'home'
  const currentBatter = useMemo(
    () => batterAt(lineups, side, state.nextBatter[side]),
    [lineups, side, state.nextBatter]
  )

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
    setFinished(false)
    if (!queue.removeInsert(last.id)) queue.enqueue({ type: 'delete', table: TABLE, id: last.id })
    queue.enqueue({ type: 'game', gameId: game.id, patch: gamePatch(replay(rest, ctx), rest.filter(isPA).length) })
  }, [events, ctx, game.id])

  const finishGame = useCallback(() => {
    setFinished(true)
    queue.enqueue({
      type: 'game',
      gameId: game.id,
      patch: { ...gamePatch(state, paCount), status: 'finished' },
    })
  }, [game.id, state, paCount])

  const reopenGame = useCallback(() => {
    setFinished(false)
    queue.enqueue({ type: 'game', gameId: game.id, patch: gamePatch(state, paCount) })
  }, [game.id, state, paCount])

  // 備註、更改 set 也是時間軸上的一筆紀錄：跟打席共用 seq，所以順序與復原都一致
  const makeRow = useCallback(
    (kind, extra) =>
      emptyRow({
        id: queue.newId(),
        game_id: game.id,
        seq: events.length + 1,
        kind,
        inning: state.inning,
        half: state.half,
        set_no: state.setNo,
        outs_before: state.outs,
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

  /** 更改「每隊一次連打幾局」（1 = 輪流，2 = 一次打兩局：1上、2上、1下、2下） */
  const changeSetSize = useCallback(
    (size) => {
      if (finished || (size !== 1 && size !== 2) || size === state.setSize) return
      pushRow(
        makeRow('set', {
          result: 'SET',
          set_size: size,
          description:
            size === 2
              ? '改為 2set：每隊一次打 2 局（1上、2上、1下、2下）。'
              : '改為 1set：每隊輪流打 1 局。',
        })
      )
    },
    [finished, state.setSize, makeRow, pushRow]
  )

  /**
   * 送出換人（代跑、代打、換人、守位交換），一次可以有好幾筆。
   * 成功後目前的打線會更新；換人是時間軸上的一筆紀錄，可以用「復原上一筆」撤回。
   */
  const substitute = useCallback(
    (rawChanges) => {
      if (finished) return { ok: false, error: '比賽已結束' }
      const changes = normalizeChanges(rawChanges)
      const problem = validateSubstitutions(lineupState, { battingSide: side, bases: state.bases }, changes)
      if (problem) return { ok: false, error: problem }
      const description = describeSubstitutions(changes, lineups, { away: game.away_team, home: game.home_team })
      pushRow(makeRow('sub', { result: 'SUB', subs: changes, description }))
      return { ok: true }
    },
    [finished, lineupState, lineups, side, state.bases, game.away_team, game.home_team, makeRow, pushRow]
  )

  /**
   * 修改歷史：把重新推算後的整串紀錄寫回（見 utils/history.js 的 rebuildTimeline）。
   * 只送出有變動的列，而且合成「一個」同步動作（刪除 + 新增 + 修改），
   * 不再一筆一筆各自排隊，避免中途失敗留下只改了一半的紀錄。
   */
  const applyHistory = useCallback(
    (newRows) => {
      touched.current = true
      const oldById = new Map(events.map((e) => [e.id, e]))
      const keep = new Set(newRows.map((r) => r.id))

      // 還沒送出的新增直接從佇列拿掉；已經送出的才需要真的刪除
      const deleteIds = []
      for (const e of events) {
        if (!keep.has(e.id) && !queue.removeInsert(e.id)) deleteIds.push(e.id)
      }
      const rows = newRows.filter((row) => {
        const old = oldById.get(row.id)
        return !old || JSON.stringify(old) !== JSON.stringify(row)
      })
      if (deleteIds.length > 0 || rows.length > 0) {
        queue.enqueue({ type: 'history', table: TABLE, gameId: game.id, deleteIds, rows })
      }

      setEvents(newRows)
      const patch = gamePatch(replay(newRows, ctx), newRows.filter(isPA).length)
      queue.enqueue({
        type: 'game',
        gameId: game.id,
        patch: finished ? { ...patch, status: 'finished' } : patch,
      })
    },
    [events, ctx, game.id, finished]
  )

  return {
    loading,
    error,
    lineups,
    startLineups,
    ctx,
    retired: lineupState.retired,
    events,
    paCount,
    state,
    currentBatter,
    finished,
    evaluate,
    record,
    undo,
    addNote,
    changeSetSize,
    substitute,
    applyHistory,
    finishGame,
    reopenGame,
    sync: {
      online,
      pending,
      failed,
      retry: queue.flush,
      retryFailed: queue.retryFailed,
      clearFailed: queue.clearFailed,
    },
  }
}