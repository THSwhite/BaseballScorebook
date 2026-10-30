/**
 * history.js
 * 修改歷史：改、插入、刪除過去的紀錄之後，把整條時間軸重新算一遍（純函式，不含畫面）
 *
 * 核心概念：
 *   每一筆紀錄存的「局數、出局數、打者、跑者、得分、說明文字」都是當時算出來的結果。
 *   改了前面的某一筆，後面每一筆的前提都變了（例如插入一個打席，後面所有人的棒次都往後挪）。
 *   所以做法是：只保留每一筆「使用者的決定」（結果、擊球資料、跑者去向），
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
  rowToPa,
} from './plateAppearance'
import { buildLineupState } from './lineup'
import { describePlateAppearance, describeSubstitutions } from './formatters'

const kindOf = (row) => row.kind ?? 'pa'

/**
 * 把整串紀錄依序重新推算
 * @param rows         紀錄（順序就是新的時間軸，seq 會被重新編號）
 * @param startLineups 原始先發 { away, home }
 * @param ctx          { innings, initialSetSize, lineupSize }
 * @param teamNames    { away, home }（換人說明文字用）
 * @returns {{
 *   rows: object[],      重新推算後的紀錄
 *   state: object,       最後的比賽狀態
 *   adjusted: string[],  跑者去向在新局面下不成立、改用預設推進的紀錄 id
 *   dropped: object[],   在新局面下完全無法成立、被移除的紀錄（原本的樣子）
 * }}
 */
export function rebuildTimeline(rows, startLineups, ctx, teamNames = { away: '客隊', home: '主隊' }) {
  let state = initialState(ctx.initialSetSize ?? 1)
  let lineups = buildLineupState(startLineups, []).lineups
  const out = []
  const adjusted = []
  const dropped = []

  for (const row of rows) {
    const kind = kindOf(row)
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
      out.push({
        ...row,
        ...at,
        seq: out.length + 1,
        description: describeSubstitutions(row.subs ?? [], lineups, teamNames),
      })
      state = applySubsToState(state, row.subs)
      lineups = buildLineupState(startLineups, out).lineups
      continue
    }

    // ---- 打席 ----
    const side = state.half === 'top' ? 'away' : 'home'
    const order = state.nextBatter[side]
    const batter = lineups[side][order - 1] ?? { order, name: '', number: null, playerId: null }
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
      dropped.push(row) // 例如沒人上壘卻有「野手選擇」，或比賽已經結束
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

  return { rows: out, state, adjusted, dropped }
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

export const updateRow = (rows, id, patch) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))

/** 插在 beforeId 這一筆之前；beforeId 為 null 就加到最後 */
export function insertBefore(rows, beforeId, row) {
  const index = beforeId ? rows.findIndex((r) => r.id === beforeId) : -1
  const next = [...rows]
  next.splice(index < 0 ? rows.length : index, 0, row)
  return next
}

export const removeRow = (rows, id) => rows.filter((r) => r.id !== id)

/**
 * 某一筆「發生之前」的局面與打者（修改、插入時，確認畫面要用）
 * @param atId 這一筆的 id；null 代表最後（全部紀錄之後）
 */
export function stateBefore(rows, atId, startLineups, ctx, teamNames) {
  const index = atId ? rows.findIndex((r) => r.id === atId) : -1
  const upTo = index < 0 ? rows : rows.slice(0, index)
  const { state } = rebuildTimeline(upTo, startLineups, ctx, teamNames)
  const side = state.half === 'top' ? 'away' : 'home'
  const order = state.nextBatter[side]
  const lineups = buildLineupState(startLineups, upTo).lineups
  const batter = lineups[side][order - 1] ?? { order, name: '', number: null, playerId: null }
  return { state, batter }
}