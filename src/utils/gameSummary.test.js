import { describe, expect, it } from 'vitest'
import {
  buildBoxScore,
  buildFeed,
  isPA,
  lineScoreCell,
  lineScoreColumns,
  teamTotals,
  winnerOf,
} from './gameSummary'
import { initialState, replay } from './plateAppearance'
import { normalizeChanges } from './lineup'
import { newSubRow } from './history'
import { START, makeCtx, recordRows } from '../test/helpers'

// 1 局上：A1 安打、A2 兩分全壘打、三振×3；1 局下：H1 保送、三振×3
const GAME = ['1B', 'HR', 'K', 'K', 'K', 'BB', 'K', 'K', 'K']

describe('isPA / winnerOf', () => {
  it('舊資料沒有 kind 也當作打席', () => {
    expect(isPA({})).toBe(true)
    expect(isPA({ kind: 'note' })).toBe(false)
  })

  it('勝負看比分，同分是 null', () => {
    expect(winnerOf({ away: 3, home: 1 })).toBe('away')
    expect(winnerOf({ away: 0, home: 2 })).toBe('home')
    expect(winnerOf({ away: 4, home: 4 })).toBeNull()
  })
})

describe('teamTotals：兩隊的安打與失誤', () => {
  it('安打算進攻方，失誤（含附有失誤）算守備方', () => {
    const rows = recordRows([...GAME, 'E']) // 最後的失誤上壘發生在 2 局上：主隊守備的失誤
    rows.push({ kind: 'pa', half: 'top', result: '1B', with_error: true }) // 客隊安打，主隊失誤
    rows.push({ kind: 'pa', half: 'bottom', result: 'E' }) // 主隊進攻，客隊失誤
    rows.push({ kind: 'note', half: 'top', result: '1B' }) // 備註不算
    expect(teamTotals(rows)).toEqual({ away: { h: 3, e: 1 }, home: { h: 0, e: 2 } })
  })
})

describe('buildFeed：依半局分組的轉播', () => {
  it('每組記下得分、安打數，打席附上打完後的比分與出局數', () => {
    const groups = buildFeed(recordRows(GAME))
    expect(groups.map((g) => `${g.inning}${g.half}:${g.runs}分${g.hits}安`)).toEqual(['1top:2分2安', '1bottom:0分0安'])
    expect(groups[0].items[1]).toMatchObject({ result: 'HR', scoreAfter: { away: 2, home: 0 }, outsAfter: 0 })
    expect(groups[0].items[4].outsAfter).toBe(3)
  })

  it('2set 連打的兩局分成兩組', () => {
    const groups = buildFeed(recordRows(['K', 'K', 'K', 'K'], makeCtx({ initialSetSize: 2 })))
    expect(groups.map((g) => `${g.inning}-${g.setNo}`)).toEqual(['1-1', '2-2'])
  })
})

describe('buildBoxScore：單場打擊成績', () => {
  it('打數、安打、得分、打點、四死、三振', () => {
    const { away, home } = buildBoxScore(recordRows(GAME), START)
    const line = (r) => `${r.name} ${r.ab}-${r.h} R${r.r} RBI${r.rbi} BB${r.bb} K${r.k}`
    expect(away.slice(0, 5).map(line)).toEqual([
      'A1 1-1 R1 RBI0 BB0 K0',
      'A2 1-1 R1 RBI2 BB0 K0',
      'A3 1-0 R0 RBI0 BB0 K1',
      'A4 1-0 R0 RBI0 BB0 K1',
      'A5 1-0 R0 RBI0 BB0 K1',
    ])
    expect(line(home[0])).toBe('H1 0-0 R0 RBI0 BB1 K0') // 保送不算打數
  })

  it('代打：新球員另起一列接在原球員下面，成績記在新球員身上', () => {
    const ctx = makeCtx()
    const rows = recordRows(['K'], ctx)
    rows.push(newSubRow('s1', 'g', normalizeChanges([{ side: 'away', order: 2, type: 'ph', number: 50, name: '代打王' }])))
    rows.push({ kind: 'pa', half: 'top', result: '1B', batting_order: 2, batter_name: '代打王', batter_number: 50, rbi: 0, runs: 0 })

    const { away } = buildBoxScore(rows, START)
    const second = away.filter((r) => r.order === 2)
    expect(second.map((r) => `${r.name}:${r.role}:${r.ab}-${r.h}`)).toEqual(['A2::0-0', '代打王:代打:1-1'])
  })

  it('插入打者：之後的人整列往後移一棒', () => {
    const rows = [newSubRow('s1', 'g', normalizeChanges([{ side: 'home', order: 1, type: 'ins', number: 77, name: '插', position: 'DH' }]))]
    const { home } = buildBoxScore(rows, START)
    expect(home.slice(0, 3).map((r) => `${r.order}${r.name}`)).toEqual(['1插', '2H1', '3H2'])
    expect(home).toHaveLength(11)
  })
})

describe('lineScoreCell / lineScoreColumns：局數比分表', () => {
  const state = replay(recordRows(GAME), makeCtx()) // 現在是 2 局上

  it('打過的局顯示得分，正在打的半局顯示 0，還沒打的空白', () => {
    expect(lineScoreCell(state, 'away', 1)).toBe(2)
    expect(lineScoreCell(state, 'home', 1)).toBe(0)
    expect(lineScoreCell(state, 'away', 2)).toBe(0) // 正在打
    expect(lineScoreCell(state, 'home', 2)).toBe('')
  })

  it('比賽結束後，還沒開始打的半局不顯示 0', () => {
    expect(lineScoreCell(state, 'away', 2, true)).toBe('')
    expect(lineScoreCell(state, 'away', 1, true)).toBe(2)
  })

  it('至少 7 欄，打到第 8 局以後自動加欄', () => {
    expect(lineScoreColumns(initialState())).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(lineScoreColumns({ ...initialState(), inning: 9 })).toHaveLength(9)
  })
})
