/**
 * 測試共用的小工具：快速建立打線、依序打完一串打席
 */
import { defaultOutcome, evaluatePlateAppearance, initialState, replay } from '../utils/plateAppearance'
import { rebuildTimeline } from '../utils/history'

/** 一隊的打線：A1、A2…（背號 = 棒次，守位依序排，第 10 棒是自由球員） */
const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'SF']
export const makeLineup = (prefix, size = 10) =>
  Array.from({ length: size }, (_, i) => ({
    order: i + 1,
    name: `${prefix}${i + 1}`,
    number: i + 1,
    playerId: `${prefix}-${i + 1}`,
    position: POSITIONS[i] ?? 'DH',
  }))

export const START = { away: makeLineup('A'), home: makeLineup('H') }
export const TEAMS = { away: '客隊', home: '主隊' }

/** 重播比賽的設定：預設 1set、兩隊各 10 棒 */
export const makeCtx = (overrides = {}) => ({
  initialSetSize: 1,
  lineupSize: { away: 10, home: 10 },
  ...overrides,
})

const battingSide = (state) => (state.half === 'top' ? 'away' : 'home')

/** 目前輪到的打者（用 START 的名單） */
export function currentBatter(state, start = START) {
  const side = battingSide(state)
  const order = state.nextBatter[side]
  return start[side][order - 1] ?? { order, name: '', number: null, playerId: null }
}

/**
 * 打一個打席。跑者用預設推進，可以用 override 改掉（movements、batterTo、withError…）
 * 打席不成立時直接丟出錯誤，讓測試失敗時看得到原因
 */
export function play(state, result, override = {}, ctx = makeCtx()) {
  const d = defaultOutcome(result, state.bases)
  const res = evaluatePlateAppearance(
    state,
    { result, batter: currentBatter(state), movements: d.movements, batterTo: d.batterTo, ...override },
    ctx
  )
  if (!res.ok) throw new Error(`${result}：${res.error}`)
  return res
}

/** 依序打完一串結果，回傳最後的狀態 */
export function playAll(results, ctx = makeCtx(), state = initialState(ctx.initialSetSize)) {
  return results.reduce((s, r) => play(s, r, {}, ctx).nextState, state)
}

/** 連續 n 個三振 */
export const strikeouts = (n) => Array(n).fill('K')

/**
 * 模擬記錄員依序記錄，產生資料庫格式的紀錄（跑者用預設推進）
 * 每一筆的 id 是 r1、r2…
 */
export function recordRows(results, ctx = makeCtx(), start = START) {
  let rows = []
  results.forEach((result, i) => {
    const state = replay(rows, ctx)
    const d = defaultOutcome(result, state.bases)
    const row = { id: `r${i + 1}`, game_id: 'g', kind: 'pa', result, runners: d.movements, batter_to: d.batterTo }
    rows = rebuildTimeline([...rows, row], start, ctx, TEAMS).rows
  })
  return rows
}
