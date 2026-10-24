/**
 * plateAppearance.js
 * 逐打席記錄引擎（純函式，不含畫面）
 *
 * 核心概念：
 *   比賽狀態 = 把所有打席依序「重播」的結果。
 *   所以復原 = 刪掉最後一筆再重播，離線補送也不會讓狀態錯亂。
 *
 * 跑者去向代碼（to）：0 = 出局、1/2/3 = 壘包、4 = 回本壘得分
 */
import { RULES } from './baseballRules'

/* ---------- 打席結果定義 ---------- */
export const RESULT_LIST = [
  { code: '1B', label: '一壘安打', group: 'hit' },
  { code: '2B', label: '二壘安打', group: 'hit' },
  { code: '3B', label: '三壘安打', group: 'hit' },
  { code: 'HR', label: '全壘打', group: 'hit' },
  { code: 'BB', label: '四壞球', group: 'reach' },
  { code: 'HBP', label: '觸身球', group: 'reach' },
  { code: 'E', label: '失誤上壘', group: 'reach' },
  { code: 'FC', label: '野手選擇', group: 'reach' },
  { code: 'K', label: '三振', group: 'out' },
  { code: 'OUT', label: '打擊出局', group: 'out' }, // 方向、高度在確認畫面選
  { code: 'DP', label: '雙殺打', group: 'other' },
  { code: 'SF', label: '高飛犧牲打', group: 'other' },
  { code: 'SH', label: '犧牲觸擊', group: 'other' },
]

export const GROUP_LIST = [
  { key: 'hit', label: '安打' },
  { key: 'reach', label: '上壘' },
  { key: 'out', label: '出局' },
  { key: 'other', label: '雙殺・犧牲打' },
]

// 舊版的出局按鈕（滾地、飛球、平飛、內野高飛）。現在合併成「打擊出局」，高度改在確認畫面選。
// 保留這幾個代碼，是為了讓之前記錄的比賽還能正常重播與顯示。
const LEGACY_RESULTS = [
  { code: 'GO', label: '滾地出局', group: 'out' },
  { code: 'FO', label: '飛球出局', group: 'out' },
  { code: 'LO', label: '平飛出局', group: 'out' },
  { code: 'PO', label: '內野高飛', group: 'out' },
]

export const RESULT_MAP = Object.fromEntries([...RESULT_LIST, ...LEGACY_RESULTS].map((r) => [r.code, r]))

export const HIT_RESULTS = new Set(['1B', '2B', '3B', 'HR'])
const BATTER_OUT = new Set(['K', 'OUT', 'GO', 'FO', 'LO', 'PO', 'DP', 'SF', 'SH']) // 打者本人出局
const NO_RBI = new Set(['E', 'DP']) // 這兩種不記打點

/* ---------- 擊球方向、高度、附加情況（extra2 打擊習慣用）---------- */
// 方向 = 球往哪個守備位置去（存進 plate_appearances.hit_direction）
export const DIRECTION_OPTIONS = [
  { value: '1B', label: '一', name: '一壘' },
  { value: '2B', label: '二', name: '二壘' },
  { value: '3B', label: '三', name: '三壘' },
  { value: 'SS', label: '游', name: '游擊' },
  { value: 'P', label: '投', name: '投手' },
  { value: 'C', label: '捕', name: '捕手' },
  { value: 'LF', label: '左', name: '左外野' },
  { value: 'CF', label: '中', name: '中外野' },
  { value: 'RF', label: '右', name: '右外野' },
  { value: 'SF', label: '自由', name: '自由球員' },
]
// 高度（存進 plate_appearances.hit_type）
export const HEIGHT_OPTIONS = [
  { value: 'ground', label: '滾地' },
  { value: 'line', label: '平飛' },
  { value: 'fly', label: '高飛' },
]

// 安打與出局：方向、高度一定要選
export const DETAIL_REQUIRED = new Set(['1B', '2B', '3B', 'HR', 'OUT', 'DP', 'SF', 'SH'])
// 有擊球的結果（失誤上壘、野手選擇也有擊球，但方向與高度可以不填）
export const HAS_BATTED_BALL = new Set([...DETAIL_REQUIRED, 'E', 'FC'])
// 安打與出局的同時，可以標記「附有失誤」「附有野手選擇」
export const SIDE_PLAY_ALLOWED = DETAIL_REQUIRED

const DEFAULT_HEIGHT = { HR: 'fly', SF: 'fly', DP: 'ground', SH: 'ground' } // 這幾種通常固定，先幫忙選好
export const defaultHeight = (result) => DEFAULT_HEIGHT[result] ?? ''

/** 檢查必填的擊球資料。只用在「新記錄」，重播舊資料時不檢查，免得舊比賽壞掉 */
export function validateDetails(result, { direction, height } = {}) {
  if (!DETAIL_REQUIRED.has(result)) return ''
  if (!direction) return '請選擇擊球方向'
  if (!height) return '請選擇擊球高度'
  return ''
}

/* ---------- 狀態 ---------- */
export function initialState() {
  return {
    inning: 1,
    half: 'top', // top = 客隊（先攻）進攻，bottom = 主隊（後攻）進攻
    outs: 0,
    bases: [null, null, null], // 一、二、三壘：跑者 {order, name, number, playerId} 或 null
    score: { away: 0, home: 0 },
    lineScore: { away: [], home: [] }, // 每局得分
    nextBatter: { away: 1, home: 1 }, // 兩隊各自下一位打者的打序
    over: false,
    winner: null, // 'away' | 'home' | null
  }
}

const slim = (p) => ({
  order: p.order,
  name: p.name ?? '',
  number: p.number ?? null,
  playerId: p.playerId ?? null,
})

/** 目前的局面能不能記錄這個結果（例如沒人上壘就不能記野手選擇） */
export function isAvailable(result, state) {
  const [r1, r2, r3] = state.bases
  const anyRunner = !!(r1 || r2 || r3)
  switch (result) {
    case 'FC':
      return anyRunner
    case 'DP':
      return anyRunner && state.outs < 2
    case 'SF':
      return !!r3 && state.outs < 2
    case 'SH':
      return anyRunner && state.outs < 2
    default:
      return true
  }
}

/* ---------- 預設的跑者推進 ---------- */
// 被強迫進壘的壘包：打者上一壘 → 一壘有人才被迫前進，依序往後推
function forcedBases(bases) {
  const forced = []
  if (bases[0]) {
    forced.push(1)
    if (bases[1]) {
      forced.push(2)
      if (bases[2]) forced.push(3)
    }
  }
  return forced
}

/**
 * 依結果算出預設的跑者去向，使用者可以在確認畫面再調整
 * @returns {{ movements: {from:number,to:number}[], batterTo: number }}
 */
export function defaultOutcome(result, bases) {
  const occupied = [1, 2, 3].filter((b) => bases[b - 1])
  const stay = () => occupied.map((b) => ({ from: b, to: b }))
  const shift = (n) => occupied.map((b) => ({ from: b, to: Math.min(b + n, 4) }))
  const forced = forcedBases(bases)
  const forcedAdvance = () => occupied.map((b) => ({ from: b, to: forced.includes(b) ? b + 1 : b }))
  // 野選／雙殺：被強迫的跑者中，跑在最前面的那位出局；沒有強迫進壘時，最前面的跑者出局
  const outBase = forced.length ? forced[forced.length - 1] : (occupied[occupied.length - 1] ?? 0)
  const withRunnerOut = () =>
    occupied.map((b) => {
      if (b === outBase) return { from: b, to: 0 }
      return { from: b, to: forced.includes(b) ? b + 1 : b }
    })

  switch (result) {
    case '1B':
      return { movements: shift(1), batterTo: 1 }
    case '2B':
      return { movements: shift(2), batterTo: 2 }
    case '3B':
      return { movements: shift(3), batterTo: 3 }
    case 'HR':
      return { movements: shift(4), batterTo: 4 }
    case 'BB':
    case 'HBP':
      return { movements: forcedAdvance(), batterTo: 1 }
    case 'E':
      return { movements: shift(1), batterTo: 1 }
    case 'FC':
      return { movements: withRunnerOut(), batterTo: 1 }
    case 'DP':
      return { movements: withRunnerOut(), batterTo: 0 }
    case 'SF':
      return { movements: occupied.map((b) => ({ from: b, to: b === 3 ? 4 : b })), batterTo: 0 }
    case 'SH':
      return { movements: shift(1), batterTo: 0 }
    default: // K GO FO LO PO
      return { movements: stay(), batterTo: 0 }
  }
}

/* ---------- 套用一個打席 ---------- */
const fail = (error) => ({ ok: false, error })

// 一個半局結束／比賽結束的判斷
function settle(next, ctx) {
  const innings = ctx.innings ?? RULES.INNINGS
  const { away, home } = next.score
  const finish = (winner) => {
    next.over = true
    next.winner = winner
    return next
  }
  const ensure = (side) => {
    const arr = next.lineScore[side]
    while (arr.length < next.inning) arr.push(0)
  }

  // 再見：後攻在最後一局（含延長）下半超前，立刻結束
  if (next.half === 'bottom' && next.inning >= innings && home > away) return finish('home')
  if (next.outs < RULES.OUTS_PER_HALF) return next

  next.outs = 0
  next.bases = [null, null, null]
  if (next.half === 'top') {
    ensure('away')
    // 最後一局上半結束時後攻已領先，不必打下半
    if (next.inning >= innings && home > away) return finish('home')
    next.half = 'bottom'
  } else {
    ensure('home')
    if (next.inning >= innings && home !== away) return finish(home > away ? 'home' : 'away')
    next.inning += 1 // 同分就延長賽，沒有局數上限
    next.half = 'top'
  }
  return next
}

/**
 * 驗證並套用一個打席
 * @param state  目前狀態
 * @param pa     { result, batter:{order,name,number,playerId}, movements:[{from,to}], batterTo }
 * @param ctx    { innings, lineupSize:{away,home} }
 * @returns {{ ok, error?, record?, nextState?, ignoredRuns? }}
 */
export function evaluatePlateAppearance(state, pa, ctx = {}) {
  if (state.over) return fail('比賽已結束')
  const { result, batter, movements, batterTo } = pa
  if (!RESULT_MAP[result]) return fail(`未知的打席結果：${result}`)
  if (!isAvailable(result, state)) return fail('目前的局面不能記錄這個結果')

  const side = state.half === 'top' ? 'away' : 'home'
  const occupied = [1, 2, 3].filter((b) => state.bases[b - 1])

  const seen = new Set()
  for (const m of movements) {
    if (!occupied.includes(m.from) || seen.has(m.from)) return fail('跑者資料不正確')
    seen.add(m.from)
    if (!(m.to === 0 || (m.to >= m.from && m.to <= 4))) return fail('跑者不能退回前面的壘包')
  }
  if (seen.size !== occupied.length) return fail('跑者資料不完整')

  const batterOut = BATTER_OUT.has(result)
  if (batterOut ? batterTo !== 0 : !(batterTo >= 1 && batterTo <= 4)) return fail('打者去向不正確')

  const endBases = [...movements.map((m) => m.to), batterTo].filter((t) => t >= 1 && t <= 3)
  if (new Set(endBases).size !== endBases.length) return fail('兩位跑者不能站在同一個壘包')

  const outsAdded = movements.filter((m) => m.to === 0).length + (batterTo === 0 ? 1 : 0)
  const outsAfter = state.outs + outsAdded
  if (outsAfter > RULES.OUTS_PER_HALF) return fail('出局數超過 3')
  const inningEnds = outsAfter >= RULES.OUTS_PER_HALF

  // 得分：第三個出局的那一個打席，除了安打以外，得分不算
  const rawRuns = movements.filter((m) => m.to === 4).length + (batterTo === 4 ? 1 : 0)
  const runs = inningEnds && !HIT_RESULTS.has(result) ? 0 : rawRuns
  const rbi = NO_RBI.has(result) ? 0 : runs

  const record = {
    outs_before: state.outs,
    outs_added: outsAdded,
    runs,
    rbi,
    runners: movements.map((m) => ({ from: m.from, to: m.to, runner: state.bases[m.from - 1] })),
    batter_to: batterTo,
    // 附有失誤／野選：只是標記（用在轉播文字與失誤統計），跑者實際去向由使用者在確認畫面調整
    with_error: SIDE_PLAY_ALLOWED.has(result) && !!pa.withError,
    with_fc: SIDE_PLAY_ALLOWED.has(result) && !!pa.withFc,
  }

  // 新狀態
  const next = {
    ...state,
    bases: [null, null, null],
    score: { ...state.score, [side]: state.score[side] + runs },
    lineScore: { away: [...state.lineScore.away], home: [...state.lineScore.home] },
    nextBatter: { ...state.nextBatter },
  }
  if (!inningEnds) {
    for (const m of movements) {
      if (m.to >= 1 && m.to <= 3) next.bases[m.to - 1] = state.bases[m.from - 1]
    }
    if (batterTo >= 1 && batterTo <= 3) next.bases[batterTo - 1] = slim(batter)
  }
  next.outs = outsAfter

  const arr = next.lineScore[side]
  while (arr.length < state.inning) arr.push(0)
  arr[state.inning - 1] += runs

  const size = Math.max(1, ctx.lineupSize?.[side] ?? RULES.PLAYERS_ON_FIELD)
  next.nextBatter[side] = (batter.order % size) + 1

  return { ok: true, record, nextState: settle(next, ctx), ignoredRuns: rawRuns - runs }
}

/* ---------- 重播 ---------- */
// 資料庫的一列 → 打席輸入
export function rowToPa(row) {
  return {
    result: row.result,
    batter: {
      order: row.batting_order,
      name: row.batter_name,
      number: row.batter_number,
      playerId: row.batter_id,
    },
    movements: (row.runners ?? []).map((r) => ({ from: r.from, to: r.to })),
    batterTo: row.batter_to,
    withError: !!row.with_error,
    withFc: !!row.with_fc,
  }
}

/** 把所有打席依序重播，得到目前的比賽狀態 */
export function replay(rows, ctx) {
  let state = initialState()
  for (const row of rows) {
    const res = evaluatePlateAppearance(state, rowToPa(row), ctx)
    if (res.ok) state = res.nextState // 資料異常的那一筆直接略過，不讓整場比賽壞掉
  }
  return state
}