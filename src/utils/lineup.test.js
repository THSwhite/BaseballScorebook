import { describe, expect, it } from 'vitest'
import {
  batterAt,
  buildLineupState,
  gameContext,
  isBlankPlayer,
  lineupsFromRows,
  normalizeChanges,
  samePlayer,
  validateSubstitutions,
} from './lineup'
import { START, makeLineup } from '../test/helpers'

const subRow = (...changes) => ({ kind: 'sub', subs: normalizeChanges(changes) })
const lineupState = (...rows) => buildLineupState(START, rows)
// 換人驗證：預設客隊進攻，壘上沒人
const check = (state, changes, ctx = { battingSide: 'away', bases: [null, null, null] }) =>
  validateSubstitutions(state, ctx, normalizeChanges(changes))

describe('lineupsFromRows / batterAt / gameContext', () => {
  it('資料庫的列轉成兩隊打線', () => {
    const rows = [
      { team_side: 'home', batting_order: 1, player_name: '小明', jersey_number: 7, player_id: 'p7', position: 'SS' },
      { team_side: 'away', batting_order: 1, player_name: null, jersey_number: null, player_id: null, position: 'P' },
      { team_side: 'unknown', batting_order: 1 },
    ]
    expect(lineupsFromRows(rows)).toEqual({
      away: [{ order: 1, name: '', number: null, playerId: null, position: 'P' }],
      home: [{ order: 1, name: '小明', number: 7, playerId: 'p7', position: 'SS' }],
    })
    expect(lineupsFromRows(null)).toEqual({ away: [], home: [] })
  })

  it('名單沒有這一棒時，回傳只有棒次的空位', () => {
    expect(batterAt(START, 'away', 3).name).toBe('A3')
    expect(batterAt({ away: [], home: [] }, 'away', 5)).toEqual({ order: 5, name: '', number: null, playerId: null })
  })

  it('沒有先發名單時，用預設人數輪棒', () => {
    expect(gameContext({ set_size: 2 }, { away: makeLineup('A', 12), home: [] })).toEqual({
      initialSetSize: 2,
      lineupSize: { away: 12, home: 9 },
    })
    expect(gameContext(null, { away: [], home: [] }).initialSetSize).toBe(1)
  })
})

describe('samePlayer：判斷是不是同一位球員', () => {
  it('先比球隊名單 id，再比背號，最後比姓名', () => {
    expect(samePlayer({ playerId: 'a', number: 1 }, { playerId: 'b', number: 1 })).toBe(false)
    expect(samePlayer({ number: 7, name: '甲' }, { number: '7', name: '乙' })).toBe(true)
    expect(samePlayer({ name: ' 小明 ' }, { name: '小明' })).toBe(true)
    expect(samePlayer({ number: 0 }, { number: 0 })).toBe(true) // 背號 0 也算有填
  })

  it('兩邊都沒資料就當作同一個空位', () => {
    expect(isBlankPlayer({ name: '  ', number: '' })).toBe(true)
    expect(samePlayer({}, { name: '' })).toBe(true)
    expect(samePlayer({}, { name: '小明' })).toBe(false)
  })
})

describe('normalizeChanges：整理畫面上填的異動', () => {
  it('轉成數字、清掉不需要的欄位，插入打者排到最後', () => {
    const list = normalizeChanges([
      { side: 'away', order: '9', type: 'ins', name: ' 新人 ', number: '50', position: 'DH' },
      { side: 'away', order: '2', type: 'swap', swapWith: '3', name: '不該留', number: 5 },
      { side: 'away', order: '1', type: 'ph', number: '', position: 'C' },
    ])
    expect(list.map((c) => c.type)).toEqual(['swap', 'ph', 'ins'])
    expect(list[0]).toMatchObject({ order: 2, swapWith: 3, name: '', number: null })
    expect(list[1]).toMatchObject({ number: null, position: null }) // 代打不改守位
    expect(list[2]).toMatchObject({ order: 9, name: '新人', number: 50, position: 'DH' })
  })
})

describe('buildLineupState：先發 + 換人紀錄 → 目前的打線', () => {
  it('換人：新球員接替這一棒，原本的人記在已下場名單', () => {
    const { lineups, retired } = lineupState(subRow({ side: 'away', order: 2, type: 'sub', name: '新', number: 50, position: 'LF' }))
    expect(lineups.away[1]).toEqual({ order: 2, name: '新', number: 50, playerId: null, position: 'LF' })
    expect(retired.away.map((p) => p.name)).toEqual(['A2'])
    expect(START.away[1].name).toBe('A2') // 不會改到原本的先發名單
  })

  it('代打沒有指定守位時，沿用原本的守位', () => {
    const { lineups } = lineupState(subRow({ side: 'home', order: 6, type: 'ph', number: 51 }))
    expect(lineups.home[5]).toMatchObject({ number: 51, position: 'SS' })
  })

  it('守位交換：兩棒互換守位，人不換', () => {
    const { lineups, retired } = lineupState(subRow({ side: 'away', order: 1, type: 'swap', swapWith: 2 }))
    expect(lineups.away[0]).toMatchObject({ name: 'A1', position: 'C' })
    expect(lineups.away[1]).toMatchObject({ name: 'A2', position: 'P' })
    expect(retired.away).toEqual([])
  })

  it('插入打者：這一棒以後的人往後移一棒，打線多一人', () => {
    const { lineups } = lineupState(subRow({ side: 'away', order: 3, type: 'ins', name: '插', number: 77, position: 'DH' }))
    expect(lineups.away).toHaveLength(11)
    expect(lineups.away.slice(1, 4).map((p) => `${p.order}${p.name}`)).toEqual(['2A2', '3插', '4A3'])
    expect(lineups.away.at(-1)).toMatchObject({ order: 11, name: 'A10' })
  })

  it('只看換人紀錄，打席與備註不影響打線', () => {
    expect(lineupState({ kind: 'pa' }, { kind: 'note' }).lineups).toEqual(START)
  })
})

describe('validateSubstitutions：換人能不能送出', () => {
  const base = lineupState()

  it('沒有勾選任何異動', () => {
    expect(validateSubstitutions(base, { battingSide: 'away', bases: [null, null, null] }, [])).toBe(
      '請至少勾選一位要異動的球員'
    )
  })

  it('一般的換人可以送出', () => {
    expect(check(base, [{ side: 'home', order: 1, type: 'sub', number: 88, position: 'P' }])).toBe('')
  })

  it('代跑只能換壘上的人；壘上的人不能代打', () => {
    const onFirst = { battingSide: 'away', bases: [{ order: 4 }, null, null] }
    expect(check(base, [{ side: 'away', order: 5, type: 'pr', number: 88 }], onFirst)).toBe('第 5 棒目前不在壘上，不能代跑')
    expect(check(base, [{ side: 'away', order: 4, type: 'pr', number: 88 }], onFirst)).toBe('')
    expect(check(base, [{ side: 'away', order: 4, type: 'ph', number: 88 }], onFirst)).toBe('第 4 棒目前在壘上，請改用「代跑」')
  })

  it('新球員要有背號或球隊名單，背號要是 0～999 的整數', () => {
    expect(check(base, [{ side: 'away', order: 1, type: 'sub', name: '只有名字' }])).toBe(
      '第 1 棒請輸入新球員的背號，或從球隊名單選擇'
    )
    expect(check(base, [{ side: 'away', order: 1, type: 'sub', number: 1000 }])).toBe('背號請輸入 0～999 的整數')
  })

  it('被換下場的球員不能再回場', () => {
    const state = lineupState(subRow({ side: 'away', order: 2, type: 'sub', number: 50 }))
    expect(check(state, [{ side: 'away', order: 3, type: 'sub', number: 2, name: 'A2' }])).toBe('背號 2 已經被換下場，不能再回場')
  })

  it('同一位球員不能站兩個打序', () => {
    expect(check(base, [{ side: 'away', order: 1, type: 'sub', number: 5 }])).toBe(
      '背號 5 重複了（第 1 棒與第 5 棒），一位球員只能站一個打序'
    )
  })

  it('守位不能重複（指定打擊除外）', () => {
    expect(check(base, [{ side: 'away', order: 1, type: 'sub', number: 88, position: 'C' }])).toBe(
      '守備位置「捕手」重複了，請調整位置或改用「守位交換」'
    )
    const twoDh = [
      { side: 'away', order: 1, type: 'sub', number: 88, position: 'DH' },
      { side: 'away', order: 2, type: 'sub', number: 89, position: 'DH' },
    ]
    expect(check(base, twoDh)).toBe('')
  })

  it('同一棒不能同時有兩個異動；守位交換要選另一位', () => {
    expect(
      check(base, [
        { side: 'away', order: 1, type: 'swap', swapWith: 2 },
        { side: 'away', order: 2, type: 'sub', number: 88 },
      ])
    ).toBe('第 2 棒同時有兩個異動')
    expect(check(base, [{ side: 'away', order: 1, type: 'swap', swapWith: 1 }])).toBe(
      '第 1 棒的守位交換，請選擇另一位要互換的球員'
    )
  })

  it('插入打者：位置要在打線範圍內、要選守位，一隊一次只能插一位', () => {
    expect(check(base, [{ side: 'away', order: 12, type: 'ins', number: 88, position: 'DH' }])).toBe('插入的位置不正確（第 12 棒）')
    expect(check(base, [{ side: 'away', order: 11, type: 'ins', number: 88, position: 'DH' }])).toBe('')
    expect(check(base, [{ side: 'away', order: 3, type: 'ins', number: 88 }])).toBe(
      '插入的打者請選擇守備位置（沒有守備就選指定打擊）'
    )
    expect(
      check(base, [
        { side: 'away', order: 3, type: 'ins', number: 88, position: 'DH' },
        { side: 'away', order: 4, type: 'ins', number: 89, position: 'DH' },
      ])
    ).toBe('同一隊一次只能插入一位打者')
  })
})
