import { describe, expect, it } from 'vitest'
import {
  applySetSize,
  applySubsToState,
  defaultOutcome,
  evaluatePlateAppearance,
  initialState,
  isAvailable,
  replay,
  validateDetails,
} from './plateAppearance'
import { currentBatter, makeCtx, play, playAll, recordRows, strikeouts } from '../test/helpers'

const runner = (order) => ({ order, name: `R${order}`, number: order, playerId: `r-${order}` })
const withBases = (b1, b2, b3, extra = {}) => ({
  ...initialState(),
  bases: [b1 ? runner(1) : null, b2 ? runner(2) : null, b3 ? runner(3) : null],
  ...extra,
})
// 直接驗證一個打席（不用預設推進，自己指定跑者去向）
const evaluate = (state, result, movements, batterTo, extra = {}) =>
  evaluatePlateAppearance(state, { result, batter: currentBatter(state), movements, batterTo, ...extra }, makeCtx())

describe('defaultOutcome：預設的跑者推進', () => {
  it('四壞球：只有被強迫的跑者前進', () => {
    expect(defaultOutcome('BB', [null, null, null])).toEqual({ movements: [], batterTo: 1 })
    // 只有二壘有人：沒有被強迫，留在原地
    expect(defaultOutcome('BB', withBases(false, true, false).bases).movements).toEqual([{ from: 2, to: 2 }])
    // 滿壘：三壘跑者被擠回本壘
    expect(defaultOutcome('BB', withBases(true, true, true).bases).movements).toEqual([
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
    ])
  })

  it('安打：每位跑者前進的壘數和打者一樣', () => {
    expect(defaultOutcome('1B', withBases(true, true, false).bases)).toEqual({
      movements: [{ from: 1, to: 2 }, { from: 2, to: 3 }],
      batterTo: 1,
    })
    expect(defaultOutcome('2B', withBases(true, false, false).bases)).toEqual({
      movements: [{ from: 1, to: 3 }],
      batterTo: 2,
    })
    expect(defaultOutcome('HR', withBases(true, true, true).bases).batterTo).toBe(4)
  })

  it('野手選擇：被強迫的跑者中最前面的那位出局', () => {
    expect(defaultOutcome('FC', withBases(true, true, false).bases)).toEqual({
      movements: [{ from: 1, to: 2 }, { from: 2, to: 0 }],
      batterTo: 1,
    })
    // 沒有強迫進壘：最前面的跑者出局
    expect(defaultOutcome('FC', withBases(false, true, false).bases).movements).toEqual([{ from: 2, to: 0 }])
  })

  it('雙殺打：一壘跑者與打者出局', () => {
    expect(defaultOutcome('DP', withBases(true, false, false).bases)).toEqual({
      movements: [{ from: 1, to: 0 }],
      batterTo: 0,
    })
  })

  it('高飛犧牲打：三壘跑者回來得分，其他人不動', () => {
    expect(defaultOutcome('SF', withBases(true, false, true).bases)).toEqual({
      movements: [{ from: 1, to: 1 }, { from: 3, to: 4 }],
      batterTo: 0,
    })
  })
})

describe('isAvailable：局面不允許的結果', () => {
  it('沒人上壘不能記野手選擇、雙殺、犧牲打', () => {
    const empty = initialState()
    for (const code of ['FC', 'DP', 'SF', 'SH']) expect(isAvailable(code, empty)).toBe(false)
    expect(isAvailable('1B', empty)).toBe(true)
  })

  it('兩出局不能記雙殺與犧牲打；高飛犧牲打要三壘有人', () => {
    const twoOuts = withBases(true, false, true, { outs: 2 })
    expect(isAvailable('DP', twoOuts)).toBe(false)
    expect(isAvailable('SF', twoOuts)).toBe(false)
    expect(isAvailable('FC', twoOuts)).toBe(true)
    expect(isAvailable('SF', withBases(true, false, false))).toBe(false)
  })
})

describe('validateDetails：安打與出局一定要有擊球方向與高度', () => {
  it('缺資料時回傳錯誤訊息', () => {
    expect(validateDetails('1B', {})).toBe('請選擇擊球方向')
    expect(validateDetails('1B', { direction: 'LF' })).toBe('請選擇擊球高度')
    expect(validateDetails('1B', { direction: 'LF', height: 'fly' })).toBe('')
  })

  it('三振、四壞、失誤上壘不用填', () => {
    for (const code of ['K', 'BB', 'HBP', 'E', 'FC']) expect(validateDetails(code, {})).toBe('')
  })
})

describe('evaluatePlateAppearance：得分與打點', () => {
  it('滿貫全壘打：4 分 4 分打點，壘包清空', () => {
    const res = play(withBases(true, true, true), 'HR')
    expect(res.record.runs).toBe(4)
    expect(res.record.rbi).toBe(4)
    expect(res.nextState.bases).toEqual([null, null, null])
    expect(res.nextState.score.away).toBe(4)
    expect(res.nextState.lineScore.away).toEqual([4])
  })

  it('打者靠失誤自己跑回本壘：得分算，但不算自己的打點', () => {
    const res = evaluate(withBases(false, false, true), '3B', [{ from: 3, to: 4 }], 4, { withError: true })
    expect(res.ok).toBe(true)
    expect(res.record.runs).toBe(2)
    expect(res.record.rbi).toBe(1)
    expect(res.record.with_error).toBe(true)
  })

  it('失誤上壘與雙殺打不記打點', () => {
    expect(play(withBases(false, false, true), 'E', { movements: [{ from: 3, to: 4 }] }).record).toMatchObject({
      runs: 1,
      rbi: 0,
    })
    const dp = evaluate(withBases(true, false, true), 'DP', [{ from: 1, to: 0 }, { from: 3, to: 4 }], 0)
    expect(dp.record).toMatchObject({ runs: 1, rbi: 0, outs_added: 2 })
  })

  it('第三個出局的打席：不是安打就不算得分', () => {
    const state = withBases(false, false, true, { outs: 2 })
    const res = evaluate(state, 'OUT', [{ from: 3, to: 4 }], 0)
    expect(res.record.runs).toBe(0)
    expect(res.ignoredRuns).toBe(1)
    expect(res.nextState.score.away).toBe(0)
  })

  it('第三個出局發生在安打時（跑者被刺殺），先回本壘的分數照算', () => {
    const state = withBases(true, false, true, { outs: 2 })
    const res = evaluate(state, '1B', [{ from: 1, to: 0 }, { from: 3, to: 4 }], 1)
    expect(res.record.runs).toBe(1)
    expect(res.nextState.half).toBe('bottom')
  })
})

describe('evaluatePlateAppearance：不合理的資料會被擋下', () => {
  it('跑者不能往回跑、兩人不能同一壘、資料要完整', () => {
    const state = withBases(true, true, false)
    expect(evaluate(state, '1B', [{ from: 1, to: 2 }, { from: 2, to: 1 }], 1).error).toBe('跑者不能退回前面的壘包')
    expect(evaluate(state, '1B', [{ from: 1, to: 2 }, { from: 2, to: 2 }], 1).error).toBe('兩位跑者不能站在同一個壘包')
    expect(evaluate(state, '1B', [{ from: 1, to: 2 }], 1).error).toBe('跑者資料不完整')
    expect(evaluate(state, '1B', [{ from: 3, to: 4 }, { from: 1, to: 2 }, { from: 2, to: 3 }], 1).error).toBe(
      '跑者資料不正確'
    )
  })

  it('三振的打者一定出局；安打的打者至少要上到該壘', () => {
    const empty = initialState()
    expect(evaluate(empty, 'K', [], 1).error).toBe('打者去向不正確')
    expect(evaluate(empty, '2B', [], 1).error).toBe('只有附有失誤時，打者才能比安打多進壘')
    expect(evaluate(empty, '1B', [], 2).error).toBe('只有附有失誤時，打者才能比安打多進壘')
    expect(evaluate(empty, '1B', [], 2, { withError: true }).ok).toBe(true)
  })

  it('出局數不能超過 3，局面不允許的結果會被拒絕', () => {
    const state = withBases(true, false, false, { outs: 2 })
    expect(evaluate(state, 'OUT', [{ from: 1, to: 0 }], 0).error).toBe('出局數超過 3')
    expect(evaluate(initialState(), 'FC', [], 1).error).toBe('目前的局面不能記錄這個結果')
    expect(evaluate(initialState(), 'XYZ', [], 0).error).toBe('未知的打席結果：XYZ')
  })
})

describe('換局與輪棒', () => {
  it('三個出局換下半局：出局歸零、壘包清空、記下這半局的得分', () => {
    const state = playAll(['1B', ...strikeouts(3)])
    expect(state).toMatchObject({ inning: 1, half: 'bottom', outs: 0, bases: [null, null, null], halfPlays: 0 })
    expect(state.lineScore.away).toEqual([0])
  })

  it('1set：1上 → 1下 → 2上', () => {
    expect(playAll(strikeouts(6))).toMatchObject({ inning: 2, half: 'top', setNo: 1 })
  })

  it('2set：1上 → 2上 → 1下 → 2下 → 3上', () => {
    const ctx = makeCtx({ initialSetSize: 2 })
    const at = (outs) => {
      const s = playAll(strikeouts(outs), ctx)
      return `${s.inning}${s.half === 'top' ? '上' : '下'}`
    }
    expect([0, 3, 6, 9, 12].map(at)).toEqual(['1上', '2上', '1下', '2下', '3上'])
    const after = playAll(strikeouts(12), ctx)
    expect(after.lineScore).toEqual({ away: [0, 0], home: [0, 0] })
  })

  it('兩隊各自輪棒，打完最後一棒回到第一棒', () => {
    const ctx = makeCtx({ lineupSize: { away: 3, home: 3 } })
    const state = playAll(['1B', '1B', 'K', 'K', 'K'], ctx) // 客隊打了 5 個人：1 2 3 1 2
    expect(state.nextBatter).toEqual({ away: 3, home: 1 })
  })

  it('局數沒有上限：比賽不會自動結束，後攻超前也繼續打', () => {
    const state = playAll(strikeouts(6 * 9)) // 打完 9 局
    expect(state).toMatchObject({ inning: 10, half: 'top' })
    expect(state).not.toHaveProperty('over')

    // 9 局下後攻全壘打超前：不是「再見」，同一個半局繼續
    const bottomNinth = playAll(strikeouts(6 * 8 + 3))
    const res = play(bottomNinth, 'HR')
    expect(res.nextState).toMatchObject({ inning: 9, half: 'bottom', outs: 0 })
    expect(res.nextState.score).toEqual({ away: 0, home: 1 })
  })
})

describe('applySetSize：中途更改一次連打幾局', () => {
  it('新的一輪剛開始時立刻生效', () => {
    const state = applySetSize(initialState(1), 2)
    expect(state).toMatchObject({ setSize: 2, blockSize: 2 })
  })

  it('打到一半才改：等這一輪打完才生效', () => {
    const midway = playAll(['K'])
    const changed = applySetSize(midway, 2)
    expect(changed).toMatchObject({ setSize: 2, blockSize: 1 })
    // 1上剩下兩個出局 + 1下三個出局 → 新的一輪開始，才連打兩局
    const next = playAll(strikeouts(5), makeCtx(), changed)
    expect(next).toMatchObject({ inning: 2, half: 'top', blockSize: 2 })
    expect(playAll(strikeouts(3), makeCtx(), next)).toMatchObject({ inning: 3, half: 'top', setNo: 2 })
  })

  it('設定沒變就回傳同一個物件', () => {
    const state = initialState(1)
    expect(applySetSize(state, 1)).toBe(state)
  })
})

describe('applySubsToState：換人對局面的影響', () => {
  it('代跑：壘上的跑者換成新球員', () => {
    const state = withBases(true, false, false)
    const next = applySubsToState(state, [{ type: 'pr', side: 'away', order: 1, name: '快腿', number: 99, playerId: 'p99' }])
    expect(next.bases[0]).toEqual({ order: 1, name: '快腿', number: 99, playerId: 'p99' })
  })

  it('防守方換人、守位交換：不影響壘包', () => {
    const state = withBases(true, false, false)
    expect(applySubsToState(state, [{ type: 'sub', side: 'home', order: 1, name: 'X' }])).toBe(state)
    expect(applySubsToState(state, [{ type: 'swap', side: 'away', order: 1, swapWith: 2 }])).toBe(state)
  })

  it('插入打者：插在下一棒前面時，下一棒號碼跟著往後，輪到的還是同一個人', () => {
    const state = { ...initialState(), nextBatter: { away: 4, home: 1 }, bases: [runner(5), null, null] }
    const next = applySubsToState(state, [{ type: 'ins', side: 'away', order: 2 }])
    expect(next.nextBatter.away).toBe(5)
    expect(next.inserted.away).toBe(1)
    expect(next.bases[0].order).toBe(6) // 壘上跑者的棒次也往後一棒

    // 插在下一棒（含）之後：下一棒不變
    const later = applySubsToState(state, [{ type: 'ins', side: 'away', order: 4 }])
    expect(later.nextBatter.away).toBe(4)
  })

  it('插入打者後，打線變長，輪棒要多算一人', () => {
    const ctx = makeCtx({ lineupSize: { away: 3, home: 3 } })
    let state = applySubsToState(initialState(), [{ type: 'ins', side: 'away', order: 4 }])
    state = playAll(['1B', '1B', '1B'], ctx, state)
    expect(state.nextBatter.away).toBe(4) // 不會跳回第 1 棒
  })
})

describe('replay：把紀錄依序重播', () => {
  it('結果和一個一個打席套用相同', () => {
    const results = ['1B', '2B', 'OUT', 'BB', 'HR', 'K', 'K', 'E', 'FC', 'K']
    const ctx = makeCtx()
    const rows = recordRows(results, ctx)
    expect(replay(rows, ctx)).toEqual(playAll(results, ctx))
  })

  it('備註不影響比賽；資料異常的那一筆會被略過，不讓整場比賽壞掉', () => {
    const ctx = makeCtx()
    const rows = recordRows(['1B', 'K'], ctx)
    const withExtras = [
      rows[0],
      { kind: 'note', description: '下雨暫停' },
      { kind: 'pa', result: 'SF', runners: [], batter_to: 0, batting_order: 2 }, // 三壘沒人，不能高飛犧牲打
      rows[1],
    ]
    expect(replay(withExtras, ctx)).toEqual(replay(rows, ctx))
  })

  it('set 紀錄會改變連打局數', () => {
    const ctx = makeCtx()
    const state = replay([{ kind: 'set', set_size: 2 }], ctx)
    expect(state).toMatchObject({ setSize: 2, blockSize: 2 })
  })
})
