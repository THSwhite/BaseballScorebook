/**
 * history.js
 * 修改歷史：改、插入、刪除過去的紀錄之後，把整條時間軸重新算一遍（純函式，不含畫面）
 *
 * 核心概念：
 *   每一筆紀錄存的「局數、出局數、打者、跑者、得分、說明文字」都是當時算出來的結果。
 *   改了前面的某一筆，後面每一筆的前提都變了（例如插入一個打席，後面所有人的棒次都往後挪）。
 *   所以做法是：只保留每一筆「使用者的決定」（結果、擊球資料、跑者去向、換人內容），
 *   其餘全部依序重新推算，再回寫。
 *
 *   例：1 → 2 → 3，在 1 與 2 中間插入 4  =>  1 → 4 → 2 → 3，2、3 的打者與局面自動往後調整。
 */
import {
  allowsFielding,
  applySetSize,
  applySubsToState,
  defaultOutcome,
  evaluatePlateAppearance,
  fieldingString,
  initialState,
  kindOf,
  rowToPa,
} from './plateAppearance'
import { batterAt, buildLineupState, validateSubstitutions } from './lineup'
import { describePlateAppearance, describeSubstitutions } from './formatters'

/**
 * 把整串紀錄依序重新推算
 * @param rows         紀錄（順序就是新的時間軸，seq 會被重新編號）
 * @param startLineups 原始先發 { away, home }
 * @param ctx          { innings, initialSetSize, lineupSize }
 * @param teamNames    { away, home }（換人說明文字用）
 * @returns {{
 *   rows: object[],       重新推算後的紀錄
 *   state: object,        最後的比賽狀態
 *   adjusted: string[],   跑者去向在新局面下不成立、改用預設推進的紀錄 id
 *   dropped: {row, reason}[],   在新局面下完全無法成立、被移除的打席
 *   warnings: {row, reason}[],  換人在新局面下有疑問（仍會保留，請記錄員確認）
 * }}
 */
export function rebuildTimeline(rows, startLineups, ctx, teamNames = { away: '客隊', home: '主隊' }) {
  let state = initialState(ctx.initialSetSize ?? 1)
  let lineups = buildLineupState(startLineups, []).lineups
  const out = []
  const adjusted = []
  const dropped = []
  const warnings = []

  for (const row of rows) {
    const kind = kindOf(row)
    const side = state.half === 'top' ? 'away' : 'home'
    const at = { inning: state.inning, half: state.half, set_no: state.setNo, outs_before: state.outs }

    if (kind === 'note') {
      out.push({ ...row, ...at, seq: out.length + 1 })
      continue
    }

    if (kind === 'set') {
      out.push({ ...row, ...at, seq: out.length + 1 })
      if (row.set_size === 1 || row.set_size === 2) state = applySetSize(state, row.set_size, ctx)
      continue
    }

    if (kind === 'sub') {
      // 換人：照目前的局面再檢查一次。有疑問只提醒、不移除，免得誤刪記錄員真的做過的換人
      const lineupState = buildLineupState(startLineups, out)
      const problem = validateSubstitutions(lineupState, { battingSide: side, bases: state.bases }, row.subs ?? [])
      if (problem) warnings.push({ row, reason: problem })

      out.push({
        ...row,
        ...at,
        seq: out.length + 1,
        description: describeSubstitutions(row.subs ?? [], lineupState.lineups, teamNames),
      })
      state = applySubsToState(state, row.subs)
      lineups = buildLineupState(startLineups, out).lineups
      continue
    }

    // ---- 打席 ----
    const batter = batterAt(lineups, side, state.nextBatter[side])
    const stored = rowToPa(row)
    const attempt = (movements, batterTo, extras) =>
      evaluatePlateAppearance(state, { result: row.result, batter, movements, batterTo, ...extras }, ctx)

    // 先照使用者原本的決定；跑者對不上（壘上的人變了），就改用預設推進
    let res = attempt(stored.movements, stored.batterTo, { withError: stored.withError, withFc: stored.withFc })
    if (!res.ok) {
      const d = defaultOutcome(row.result, state.bases)
      res = attempt(d.movements, d.batterTo, {})
      if (res.ok) adjusted.push(row.id)
    }
    if (!res.ok) {
      dropped.push({ row, reason: res.error }) // 例如沒人上壘卻有「野手選擇」，或比賽已經結束
      continue
    }

    const hasError = row.result === 'E' || res.record.with_error
    const extra = {
      fielding: allowsFielding(row.result, res.record.outs_added) ? (row.fielding ?? null) : null,
      error_by: hasError ? (row.error_by ?? null) : null,
      error_kind: hasError ? (row.error_kind ?? null) : null,
    }

    const next = {
      ...row,
      kind: 'pa',
      seq: out.length + 1,
      inning: state.inning,
      half: state.half,
      set_no: state.setNo,
      set_size: null,
      batting_order: batter.order,
      batter_id: batter.playerId ?? null,
      batter_name: batter.name ?? '',
      batter_number: batter.number ?? null,
      hit_type: row.hit_type ?? null,
      hit_direction: row.hit_direction ?? null,
      ...res.record,
      ...extra,
    }
    next.description = describePlateAppearance({
      result: row.result,
      batter,
      hit_direction: next.hit_direction,
      hit_type: next.hit_type,
      ...res.record,
      ...extra,
    })
    out.push(next)
    state = res.nextState
  }

  return { rows: out, state, adjusted, dropped, warnings }
}

/* ---------- 編輯動作（都回傳新的陣列，不改動原本的） ---------- */

/** 畫面確認後的資料 → 要寫進打席紀錄的欄位 */
export function paPatch(result, d) {
  return {
    result,
    runners: d.movements.map((m) => ({ from: m.from, to: m.to })),
    batter_to: d.batterTo,
    hit_direction: d.direction || null,
    hit_type: d.height || null,
    with_error: !!d.withError,
    with_fc: !!d.withFc,
    fielding: fieldingString(d.fielding),
    error_by: d.errorBy ? Number(d.errorBy) : null,
    error_kind: d.errorKind || null,
  }
}

/** 全新的打席紀錄（插入用）；局數、打者、得分等欄位會在 rebuildTimeline 裡算出來 */
export function newPaRow(id, gameId, result, details) {
  return { id, game_id: gameId, seq: 0, kind: 'pa', ...paPatch(result, details) }
}

/**
 * 一筆「不是打席」的空白紀錄（備註、set 更改、換人）：打席才有的欄位都填預設值。
 * 記錄頁新增紀錄、修改歷史插入換人都用這個，確保欄位一致
 */
export function emptyRow(fields) {
  return {
    seq: 0,
    kind: 'pa',
    inning: 1,
    half: 'top',
    set_no: 1,
    batting_order: 0,
    batter_id: null,
    batter_name: '',
    batter_number: null,
    outs_before: 0,
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
    ...fields,
  }
}

/** 全新的換人紀錄（插入用）；changes 是 normalizeChanges() 的結果。局數、說明文字會在 rebuildTimeline 裡算出來 */
export const newSubRow = (id, gameId, changes) =>
  emptyRow({ id, game_id: gameId, kind: 'sub', result: 'SUB', subs: changes, description: '' })

/**
 * 「插入打者」會讓這一棒以後的人往後移一棒（或刪掉時往前移）。
 * 在它之後的換人紀錄是用舊的棒次寫的，所以要一起調整：棒次在這一棒（含）以後的 +1。
 * delta = +1：插入；delta = -1：撤銷（只調整比這一棒大的，剛好是 +1 的反向）
 * @param fromIndex 從這個位置開始（含）往後的紀錄才調整
 */
export function shiftLaterSubs(rows, fromIndex, side, at, delta) {
  const move = (n) => {
    if (!Number.isInteger(n)) return n
    return delta > 0 ? (n >= at ? n + delta : n) : n > at ? n + delta : n
  }
  return rows.map((r, i) => {
    if (i < fromIndex || kindOf(r) !== 'sub') return r
    const subs = (r.subs ?? []).map((c) => {
      if (c.side !== side) return c
      const next = { ...c, order: move(Number(c.order)) }
      if (c.type === 'swap') next.swapWith = move(Number(c.swapWith))
      return next
    })
    return { ...r, subs }
  })
}

/** 一筆換人紀錄裡如果有「插入打者」，把它之後的換人棒次一起調整（delta = +1 加入，-1 移除） */
export function shiftForInsertions(rows, fromIndex, subRow, delta) {
  let next = rows
  for (const c of subRow.subs ?? []) {
    if (c.type === 'ins') next = shiftLaterSubs(next, fromIndex, c.side, Number(c.order), delta)
  }
  return next
}

export const updateRow = (rows, id, patch) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))

/** 插在 beforeId 這一筆之前；beforeId 為 null 就加到最後 */
export function insertBefore(rows, beforeId, row) {
  const index = beforeId ? rows.findIndex((r) => r.id === beforeId) : -1
  const next = [...rows]
  next.splice(index < 0 ? rows.length : index, 0, row)
  return next
}

/**
 * 這串紀錄「全部發生之後」的局面、下一位打者與打線（修改、插入時，確認畫面要用）
 * 傳入的 rows 通常是「某一筆之前」的那一段
 */
export function stateAt(rows, startLineups, ctx, teamNames) {
  const { rows: rebuilt, state } = rebuildTimeline(rows, startLineups, ctx, teamNames)
  const lineupState = buildLineupState(startLineups, rebuilt)
  const side = state.half === 'top' ? 'away' : 'home'
  const batter = batterAt(lineupState.lineups, side, state.nextBatter[side])
  return { state, batter, lineupState }
}
