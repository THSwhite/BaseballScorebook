/**
 * plateAppearance.js
 * 逐打席記錄引擎（純函式，不含畫面）
 *
 * 核心概念：
 *   比賽狀態 = 把所有打席依序「重播」的結果。
 *   所以復原 = 刪掉最後一筆再重播，離線補送也不會讓狀態錯亂。
 *
 * 跑者去向代碼（to）：0 = 出局、1/2/3 = 壘包、4 = 回本壘得分
 *
 * 1set / 2set：
 *   1set：1上 → 1下 → 2上 → 2下 …（照舊）
 *   2set：1上 → 2上 → 1下 → 2下 → 3上 → 4上 → 3下 → 4下 …
 *         （每隊一次連打兩局，上半打完回到這一輪的起始局打下半）
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
// 安打讓打者上到的壘包（4 = 全壘打）。附有失誤時，打者可以再多進，但不能比這個少
export const HIT_BASE = { '1B': 1, '2B': 2, '3B': 3, HR: 4 }
const BATTER_OUT = new Set(['K', 'OUT', 'GO', 'FO', 'LO', 'PO', 'DP', 'SF', 'SH']) // 打者本人出局
const NO_RBI = new Set(['E', 'DP']) // 這兩種不記打點

/* ---------- 擊球方向、高度、附加情況（extra2 打擊習慣用）---------- */
// 方向 = 球往哪個守備位置去（存進 plate_appearances.hit_direction）
export const DIRECTION_OPTIONS = [
  { value: '1B', label: '一', name: '一壘', num: 3 },
  { value: '2B', label: '二', name: '二壘', num: 4 },
  { value: '3B', label: '三', name: '三壘', num: 5 },
  { value: 'SS', label: '游', name: '游擊', num: 6 },
  { value: 'P', label: '投', name: '投手', num: 1 },
  { value: 'C', label: '捕', name: '捕手', num: 2 },
  { value: 'LF', label: '左', name: '左外野', num: 7 },
  { value: 'CF', label: '中', name: '中外野', num: 8 },
  { value: 'RF', label: '右', name: '右外野', num: 9 },
  { value: 'SF', label: '自由', name: '自由球員', num: 10 },
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

/* ---------- 出局怎麼產生、失誤從何而來（選填）---------- */
// 失誤類型（存進 plate_appearances.error_kind）
export const ERROR_KIND_OPTIONS = [
  { value: 'catch', label: '接球失誤' },
  { value: 'throw', label: '傳球失誤' },
  { value: 'field', label: '處理失誤' },
]

/** 這個打席要不要問「守備路線」：有出局（三振除外），或是失誤上壘 */
export function allowsFielding(result, outsAdded) {
  return result !== 'K' && (outsAdded > 0 || result === 'E')
}

/** 守備路線 [6, 3] → '6-3'（只收 1～10 的整數，最多 6 個）；沒有就回傳 null */
export function fieldingString(seq) {
  const clean = (seq ?? []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 10).slice(0, 6)
  return clean.length ? clean.join('-') : null
}

/* ---------- 狀態 ---------- */
/**
 * @param setSize 每隊一次連續打幾局：1 = 正常輪流，2 = 一次打兩局（2set）
 */
export function initialState(setSize = 1) {
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
    setSize, // 目前的設定：每隊一次連打幾局
    blockSize: setSize, // 這一輪實際連打幾局（一輪開始時決定；最後一局不夠時會縮短）
    setNo: 1, // 這一輪的第幾局（1 ~ blockSize）
    halfPlays: 0, // 目前這個半局已經記錄了幾個打席
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

const finishWith = (next, winner) => {
  next.over = true
  next.winner = winner
  return next
}

/**
 * 從 start 局開始的這一輪，實際要連打幾局。
 * 正規局數內，最後不夠一輪就縮短（例如 7 局制：1-2、3-4、5-6、7）；延長賽一律一局一局打。
 */
const blockLength = (start, size, innings) => (start <= innings ? Math.min(size, innings - start + 1) : 1)

/**
 * 一輪打完（連打完這一輪的局數）：
 *   上半結束 → 回到這一輪的起始局打下半（2set：1上、2上 之後回到 1下）
 *   下半結束 → 進入下一輪的上半
 */
function endTurn(next, ctx) {
  const innings = ctx.innings ?? RULES.INNINGS
  const { away, home } = next.score
  const blockStart = next.inning - (next.setNo - 1) // 這一輪是從第幾局開始的
  next.setNo = 1
  if (next.half === 'top') {
    // 最後一局先攻打完時後攻已領先，不必打下半
    if (next.inning >= innings && home > away) return finishWith(next, 'home')
    next.half = 'bottom'
    next.inning = blockStart
  } else {
    if (next.inning >= innings && home !== away) return finishWith(next, home > away ? 'home' : 'away')
    next.inning += 1 // 同分就延長賽，沒有局數上限
    next.half = 'top'
    next.blockSize = blockLength(next.inning, next.setSize, innings)
  }
  return next
}

// 打席之後的判斷：再見、半局結束（2set 時同一隊接著打下一局）、比賽結束
function settle(next, ctx) {
  const innings = ctx.innings ?? RULES.INNINGS
  const { away, home } = next.score

  // 再見：後攻在最後一局（含延長）超前，立刻結束
  if (next.half === 'bottom' && next.inning >= innings && home > away) return finishWith(next, 'home')
  if (next.outs < RULES.OUTS_PER_HALF) return next

  // 三個出局：這個半局結束
  const arr = next.lineScore[next.half === 'top' ? 'away' : 'home']
  while (arr.length < next.inning) arr.push(0)
  next.outs = 0
  next.bases = [null, null, null]
  next.halfPlays = 0

  if (next.setNo < next.blockSize) {
    next.setNo += 1 // 2set：同一隊接著打下一局（1上 → 2上）
    next.inning += 1
    return next
  }
  return endTurn(next, ctx)
}

/**
 * 更改「每隊一次連打幾局」。
 * 只有在新的一輪剛開始（上半、這一輪第一局、還沒有打席）時立刻生效；
 * 其他時候只記下新設定，等下一輪才套用，避免打到一半局數重複或跳號。
 */
export function applySetSize(state, size, ctx = {}) {
  if (state.over || state.setSize === size) return state
  const next = { ...state, setSize: size }
  const atBlockStart = state.half === 'top' && state.setNo === 1 && state.halfPlays === 0
  if (atBlockStart) {
    next.blockSize = blockLength(state.inning, size, ctx.innings ?? RULES.INNINGS)
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
  // 安打：打者至少上到安打的壘包；只有「附有失誤」時才能再多進（全壘打已經是最遠）
  const hitBase = HIT_BASE[result]
  if (hitBase && batterTo !== hitBase && !(pa.withError && batterTo > hitBase)) {
    return fail('只有附有失誤時，打者才能比安打多進壘')
  }

  const endBases = [...movements.map((m) => m.to), batterTo].filter((t) => t >= 1 && t <= 3)
  if (new Set(endBases).size !== endBases.length) return fail('兩位跑者不能站在同一個壘包')

  const outsAdded = movements.filter((m) => m.to === 0).length + (batterTo === 0 ? 1 : 0)
  const outsAfter = state.outs + outsAdded
  if (outsAfter > RULES.OUTS_PER_HALF) return fail('出局數超過 3')
  const inningEnds = outsAfter >= RULES.OUTS_PER_HALF

  // 得分：第三個出局的那一個打席，除了安打以外，得分不算
  const rawRuns = movements.filter((m) => m.to === 4).length + (batterTo === 4 ? 1 : 0)
  const runs = inningEnds && !HIT_RESULTS.has(result) ? 0 : rawRuns
  // 打點：打者自己跑回本壘不算打點（全壘打除外）
  const ownRun = result !== 'HR' && batterTo === 4 && runs > 0 ? 1 : 0
  const rbi = NO_RBI.has(result) ? 0 : runs - ownRun

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
    halfPlays: state.halfPlays + 1,
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

/**
 * 換人對比賽狀態的影響：進攻方壘上的跑者如果被換掉（代跑），壘包上改成新球員，
 * 之後的得分就會算在新球員身上。其他換人只影響打線，不影響這裡。
 */
export function applySubsToState(state, subs = []) {
  const side = state.half === 'top' ? 'away' : 'home'
  let bases = state.bases
  for (const c of subs) {
    if (c.type === 'swap' || c.side !== side) continue
    bases = bases.map((b) =>
      b && b.order === c.order
        ? { order: c.order, name: c.name ?? '', number: c.number ?? null, playerId: c.playerId ?? null }
        : b
    )
  }
  return bases === state.bases ? state : { ...state, bases }
}

/**
 * 把所有紀錄依序重播，得到目前的比賽狀態
 * 紀錄有四種：pa 打席（預設）、note 備註（不影響比賽）、set 更改一次連打幾局、sub 換人
 * @param ctx { innings, lineupSize, initialSetSize }
 */
export function replay(rows, ctx = {}) {
  let state = initialState(ctx.initialSetSize ?? 1)
  for (const row of rows) {
    const kind = row.kind ?? 'pa'
    if (kind === 'note') continue
    if (kind === 'sub') {
      state = applySubsToState(state, row.subs)
      continue
    }
    if (kind === 'set') {
      if (row.set_size === 1 || row.set_size === 2) state = applySetSize(state, row.set_size, ctx)
      continue
    }
    const res = evaluatePlateAppearance(state, rowToPa(row), ctx)
    if (res.ok) state = res.nextState // 資料異常的那一筆直接略過，不讓整場比賽壞掉
  }
  return state
}