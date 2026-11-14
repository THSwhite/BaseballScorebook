import { describe, expect, it } from 'vitest'
import {
  emptyRow,
  insertBefore,
  newPaRow,
  newSubRow,
  paPatch,
  rebuildTimeline,
  shiftForInsertions,
  shiftLaterSubs,
  stateAt,
  updateRow,
} from './history'
import { replay } from './plateAppearance'
import { normalizeChanges } from './lineup'
import { START, TEAMS, makeCtx, recordRows } from '../test/helpers'

const ctx = makeCtx()
const rebuild = (rows) => rebuildTimeline(rows, START, ctx, TEAMS)
const details = (movements, batterTo, extra = {}) => ({ movements, batterTo, ...extra })
const insRow = (id, side, order) =>
  newSubRow(id, 'g', normalizeChanges([{ side, order, type: 'ins', number: 90 + order, position: 'DH' }]))

describe('rebuildTimeline：插入一個打席', () => {
  it('後面的人自動往後輪一棒，seq 重新編號', () => {
    const rows = recordRows(['K', 'K', 'K'])
    const inserted = insertBefore(rows, 'r1', newPaRow('n1', 'g', 'BB', details([], 1)))
    const out = rebuild(inserted)

    expect(out.rows.map((r) => `${r.seq}:${r.result}:${r.batter_name}`)).toEqual(['1:BB:A1', '2:K:A2', '3:K:A3', '4:K:A4'])
    expect(out.rows[1].description).toContain('A2')
    expect(out.state).toMatchObject({ inning: 1, half: 'bottom', nextBatter: { away: 5, home: 1 } })
    expect(out.dropped).toEqual([])
  })

  it('壘上多了跑者，舊的跑者紀錄對不上時改用預設推進，並列在 adjusted', () => {
    const rows = recordRows(['K', '1B'])
    const out = rebuild(insertBefore(rows, 'r1', newPaRow('n1', 'g', '1B', details([], 1))))
    expect(out.adjusted).toEqual(['r1', 'r2']) // 原本都記成「壘上沒人」，現在一壘有人
    expect(out.state.bases.map((b) => b?.name ?? null)).toEqual(['A3', 'A1', null])
  })
})

describe('rebuildTimeline：修改、刪除', () => {
  it('改了前面的結果，後面不成立的打席會被移除並說明原因', () => {
    const rows = recordRows(['1B', 'FC'])
    const out = rebuild(updateRow(rows, 'r1', paPatch('K', details([], 0))))
    expect(out.dropped).toHaveLength(1)
    expect(out.dropped[0]).toMatchObject({ row: { id: 'r2' }, reason: '目前的局面不能記錄這個結果' })
    expect(out.rows.map((r) => r.result)).toEqual(['K'])
  })

  it('刪掉一個打席，之後的比分與局面重新計算', () => {
    const rows = recordRows(['HR', 'HR', 'K'])
    const out = rebuild(rows.filter((r) => r.id !== 'r2'))
    expect(out.state.score).toEqual({ away: 1, home: 0 })
    expect(out.rows.map((r) => `${r.seq}:${r.batter_name}`)).toEqual(['1:A1', '2:A2'])
  })

  it('不再有出局的打席，守備路線會被清掉；失誤來源只留在有失誤的打席', () => {
    const rows = recordRows(['OUT'])
    const withRoute = updateRow(rows, 'r1', { fielding: '6-3', error_by: 6, error_kind: 'throw' })
    const kept = rebuild(withRoute).rows[0]
    expect(kept).toMatchObject({ fielding: '6-3', error_by: null, error_kind: null })

    const changed = rebuild(updateRow(withRoute, 'r1', { result: '1B', batter_to: 1 })).rows[0]
    expect(changed.fielding).toBeNull()
  })

  it('沒有修改時，重算的結果和原本一樣', () => {
    const rows = recordRows(['1B', '2B', 'OUT', 'BB', 'HR', 'K', 'E', 'FC', 'K'])
    expect(rebuild(rows).rows).toEqual(rows)
    expect(rebuild(rows).state).toEqual(replay(rows, ctx))
  })
})

describe('rebuildTimeline：備註、set、換人', () => {
  it('備註與 set 紀錄會蓋上當時的局數與出局數', () => {
    const rows = recordRows(['K', 'K', 'K', 'K'])
    const note = emptyRow({ id: 'n1', kind: 'note', result: 'NOTE', description: '雨停了' })
    const out = rebuild(insertBefore(rows, 'r4', note))
    expect(out.rows[3]).toMatchObject({ id: 'n1', seq: 4, inning: 1, half: 'bottom', outs_before: 0 })
  })

  it('換人在新局面下有問題時只提醒，不會被移除', () => {
    const rows = recordRows(['1B', 'K'])
    const pr = newSubRow('s1', 'g', normalizeChanges([{ side: 'away', order: 1, type: 'pr', number: 88 }]))
    const withPr = insertBefore(rows, 'r2', pr)
    expect(rebuild(withPr).warnings).toEqual([])

    // 把安打改成三振：一壘沒人了，代跑就有疑問
    const out = rebuild(updateRow(withPr, 'r1', paPatch('K', details([], 0))))
    expect(out.warnings).toHaveLength(1)
    expect(out.warnings[0].reason).toBe('第 1 棒目前不在壘上，不能代跑')
    expect(out.rows.map((r) => r.id)).toContain('s1')
  })

  it('插入打者之後，輪到的打者跟著新打線走', () => {
    const rows = recordRows(['K', 'K'])
    const out = rebuild(insertBefore(rows, 'r2', insRow('s1', 'away', 2)))
    // A1 打完，在第 2 棒插入新打者 → 下一位是插入的人
    expect(out.rows.find((r) => r.id === 'r2')).toMatchObject({ batting_order: 2, batter_number: 92 })
    expect(out.rows.find((r) => r.id === 's1').description).toContain('臨時插入打者')
  })
})

describe('shiftLaterSubs / shiftForInsertions：插入打者後調整後面的換人棒次', () => {
  const rows = [
    insRow('s1', 'away', 3),
    newSubRow('s2', 'g', normalizeChanges([{ side: 'away', order: 5, type: 'sub', number: 50 }])),
    newSubRow('s3', 'g', normalizeChanges([{ side: 'away', order: 2, type: 'swap', swapWith: 4 }])),
    newSubRow('s4', 'g', normalizeChanges([{ side: 'home', order: 5, type: 'sub', number: 51 }])),
  ]
  const orders = (list) => list.map((r) => r.subs.map((c) => (c.type === 'swap' ? `${c.order}↔${c.swapWith}` : c.order)).join())

  it('插入：在這一棒（含）以後的棒次 +1，另一隊不受影響', () => {
    expect(orders(shiftLaterSubs(rows, 1, 'away', 3, 1))).toEqual(['3', '6', '2↔5', '5'])
  })

  it('撤銷：反向調整，回到原本的棒次', () => {
    const shifted = shiftLaterSubs(rows, 1, 'away', 3, 1)
    expect(orders(shiftLaterSubs(shifted, 1, 'away', 3, -1))).toEqual(orders(rows))
  })

  it('shiftForInsertions 只處理換人紀錄裡的插入打者', () => {
    expect(orders(shiftForInsertions(rows, 1, rows[0], 1))).toEqual(['3', '6', '2↔5', '5'])
    expect(shiftForInsertions(rows, 1, rows[1], 1)).toBe(rows) // 不是插入打者：原封不動
  })
})

describe('其他小工具', () => {
  it('paPatch：畫面資料 → 要存的欄位', () => {
    expect(
      paPatch('OUT', { movements: [{ from: 1, to: 2 }], batterTo: 0, direction: 'SS', height: 'ground', fielding: [6, 3], errorBy: '', errorKind: '' })
    ).toEqual({
      result: 'OUT',
      runners: [{ from: 1, to: 2 }],
      batter_to: 0,
      hit_direction: 'SS',
      hit_type: 'ground',
      with_error: false,
      with_fc: false,
      fielding: '6-3',
      error_by: null,
      error_kind: null,
    })
  })

  it('emptyRow：打席才有的欄位都有預設值，傳入的欄位優先', () => {
    const row = emptyRow({ id: 'x', kind: 'note', inning: 3 })
    expect(row).toMatchObject({ id: 'x', kind: 'note', inning: 3, runs: 0, runners: [], set_size: null })
  })

  it('insertBefore：找不到或傳 null 就加到最後；updateRow 不改動原本的陣列', () => {
    const rows = [{ id: 'a' }, { id: 'b' }]
    expect(insertBefore(rows, null, { id: 'c' }).map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(insertBefore(rows, 'b', { id: 'c' }).map((r) => r.id)).toEqual(['a', 'c', 'b'])
    expect(updateRow(rows, 'a', { x: 1 })[0]).toEqual({ id: 'a', x: 1 })
    expect(rows[0]).toEqual({ id: 'a' })
  })

  it('stateAt：這串紀錄之後的局面與下一位打者', () => {
    const { state, batter } = stateAt(recordRows(['1B']), START, ctx, TEAMS)
    expect(batter.name).toBe('A2')
    expect(state.bases[0].name).toBe('A1')
  })
})
