/**
 * gameSummary.js
 * 把一場比賽的打席資料整理成轉播頁要顯示的樣子（純函式）
 */
import { HIT_RESULTS } from './plateAppearance'

// 不算打數的結果：四壞球、觸身球、犧牲打、犧牲觸擊
const NOT_AB = new Set(['BB', 'HBP', 'SF', 'SH'])

/** 紀錄的種類：pa 打席（舊資料沒有 kind，也當作打席）、note 備註、set 更改連續打幾個半局 */
export const isPA = (e) => (e.kind ?? 'pa') === 'pa'

/**
 * 依半局分組（2set 時同一隊的兩個半局會分成兩組）。
 * 每組的 items 依時間順序（由舊到新）放打席、備註、set 更改；打席附上結束後的比分與出局數。
 */
export function buildFeed(events) {
  const groups = []
  const score = { away: 0, home: 0 }
  let current = null

  for (const e of events) {
    const kind = e.kind ?? 'pa'
    const side = e.half === 'top' ? 'away' : 'home'
    const setNo = e.set_no ?? 1
    if (kind === 'pa') score[side] += e.runs

    const key = `${e.inning}-${e.half}-${setNo}`
    if (!current || current.key !== key) {
      current = { key, inning: e.inning, half: e.half, setNo, side, items: [], runs: 0, hits: 0 }
      groups.push(current)
    }

    if (kind === 'pa') {
      current.items.push({ ...e, kind, outsAfter: e.outs_before + e.outs_added, scoreAfter: { ...score } })
      current.runs += e.runs
      if (HIT_RESULTS.has(e.result)) current.hits += 1
    } else {
      current.items.push({ ...e, kind })
    }
  }
  return groups
}

/** 兩隊的安打數與失誤數（失誤算在守備那一隊；包含「失誤上壘」與安打、出局時附有的失誤） */
export function teamTotals(events) {
  const t = { away: { h: 0, e: 0 }, home: { h: 0, e: 0 } }
  for (const e of events) {
    if (!isPA(e)) continue
    const bat = e.half === 'top' ? 'away' : 'home'
    const field = bat === 'away' ? 'home' : 'away'
    if (HIT_RESULTS.has(e.result)) t[bat].h += 1
    if (e.result === 'E' || e.with_error) t[field].e += 1
  }
  return t
}

/** 局數比分表某一格要顯示什麼 */
export function lineScoreCell(state, side, inning) {
  const value = state.lineScore[side][inning - 1]
  if (inning < state.inning) return value ?? 0
  if (inning > state.inning) return ''
  if (side === 'away' || state.half === 'bottom') return value ?? 0
  return state.over ? 'X' : '' // 後攻還沒打：比賽已結束就是 X（不用打）
}

/** 單場打擊成績：每個打序一列 */
export function buildBoxScore(events, lineups) {
  const result = { away: [], home: [] }

  for (const side of ['away', 'home']) {
    const slots = new Map()
    const ensure = (order, info = {}) => {
      if (!slots.has(order)) {
        slots.set(order, {
          order, name: '', number: null, position: '',
          ab: 0, h: 0, r: 0, rbi: 0, bb: 0, k: 0, ...info,
        })
      }
      return slots.get(order)
    }

    ;(lineups[side] ?? []).forEach((l) =>
      ensure(l.order, { name: l.name, number: l.number, position: l.position ?? '' })
    )

    for (const e of events) {
      if (!isPA(e)) continue
      if ((e.half === 'top' ? 'away' : 'home') !== side) continue
      const row = ensure(e.batting_order, { name: e.batter_name, number: e.batter_number })
      if (!NOT_AB.has(e.result)) row.ab += 1
      if (HIT_RESULTS.has(e.result)) row.h += 1
      if (e.result === 'BB' || e.result === 'HBP') row.bb += 1
      if (e.result === 'K') row.k += 1
      row.rbi += e.rbi

      if (e.runs > 0) {
        // 得分只算有效的（第三個出局不計分的打席 runs 為 0）
        for (const m of e.runners ?? []) {
          if (m.to === 4 && m.runner) ensure(m.runner.order, { name: m.runner.name, number: m.runner.number }).r += 1
        }
        if (e.batter_to === 4) row.r += 1
      }
    }
    result[side] = [...slots.values()].sort((a, b) => a.order - b.order)
  }
  return result
}