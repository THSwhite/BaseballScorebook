import { describe, expect, it } from 'vitest'
import {
  describeFielding,
  describePlateAppearance,
  describeSubstitutions,
  fieldingNotation,
  hasNumber,
  parseFielding,
  playerLabel,
  runnerLabel,
} from './formatters'
import { normalizeChanges } from './lineup'
import { START, TEAMS } from '../test/helpers'

const batter = { order: 3, name: '小明', number: 7 }
const runner = { order: 1, name: '阿華', number: 1 }
const describe1 = (pa) => describePlateAppearance({ batter, ...pa })

describe('球員名稱', () => {
  it('有姓名用姓名，沒有就用背號，再沒有就用棒次', () => {
    expect(playerLabel(batter)).toBe('小明')
    expect(playerLabel({ order: 2, name: ' ', number: 0 })).toBe('#0')
    expect(playerLabel({ order: 2, name: '', number: null })).toBe('第 2 棒打者')
    expect(runnerLabel({ order: 2, name: '', number: null })).toBe('第 2 棒')
    expect(playerLabel(null)).toBe('打者')
  })

  it('hasNumber：背號 0 也算有填', () => {
    expect([0, 7, '0'].map(hasNumber)).toEqual([true, true, true])
    expect([null, undefined, ''].map(hasNumber)).toEqual([false, false, false])
  })
})

describe('守備路線', () => {
  it('parseFielding：只留 1～10 的整數', () => {
    expect(parseFielding('6-4-3')).toEqual([6, 4, 3])
    expect(parseFielding('10-3')).toEqual([10, 3])
    expect(parseFielding('0-11-x-5')).toEqual([5])
    expect(parseFielding(null)).toEqual([])
  })

  it('fieldingNotation：記分表寫法', () => {
    expect(fieldingNotation([6, 3], 'ground')).toBe('6-3')
    expect(fieldingNotation([8], 'fly')).toBe('F8')
    expect(fieldingNotation([6], 'line')).toBe('L6')
    expect(fieldingNotation([3], 'ground')).toBe('3U')
    expect(fieldingNotation([5], 'ground', { error: true })).toBe('E5')
    expect(fieldingNotation([5, 3], 'ground', { error: true })).toBe('5-3E')
    expect(fieldingNotation([], 'fly')).toBe('')
  })

  it('describeFielding：中文說明', () => {
    expect(describeFielding([6, 3])).toBe('游擊手傳一壘手刺殺')
    expect(describeFielding([4, 6, 3], { result: 'DP' })).toBe('二壘手傳游擊手再傳一壘手，完成雙殺')
    expect(describeFielding([10], { height: 'fly' })).toBe('自由球員接殺')
  })
})

describe('describePlateAppearance：轉播文字', () => {
  it('安打與全壘打', () => {
    expect(describe1({ result: '1B', hit_direction: 'LF', hit_type: 'line', batter_to: 1 })).toBe('小明 擊出左外野平飛一壘安打。')
    expect(describe1({ result: 'HR', hit_direction: 'CF', hit_type: 'fly', runs: 4, batter_to: 4 })).toBe(
      '小明 擊出中外野高飛滿貫全壘打。'
    )
    expect(describe1({ result: 'HR', runs: 2, batter_to: 4 })).toBe('小明 擊出 2 分全壘打。')
  })

  it('出局時附上守備路線', () => {
    expect(describe1({ result: 'OUT', hit_direction: 'SS', hit_type: 'ground', fielding: '6-3', batter_to: 0 })).toBe(
      '小明 打出游擊滾地球出局（6-3 游擊手傳一壘手刺殺）。'
    )
    expect(describe1({ result: 'OUT', hit_direction: 'SF', hit_type: 'fly', fielding: '10', batter_to: 0 })).toBe(
      '小明 打出自由球員高飛球被接殺（F10 自由球員接殺）。'
    )
  })

  it('野手選擇：守備路線接在跑者出局那一句', () => {
    expect(
      describe1({ result: 'FC', batter_to: 1, fielding: '6-4', runners: [{ from: 1, to: 0, runner }] })
    ).toBe('小明 野手選擇上壘，一壘跑者 阿華 出局（6-4 游擊手傳二壘手刺殺）。')
  })

  it('失誤：寫出是誰、哪一種失誤，打者與跑者的去向', () => {
    expect(
      describe1({
        result: 'E',
        batter_to: 2,
        fielding: '5',
        error_by: 5,
        error_kind: 'throw',
        runs: 1,
        runners: [{ from: 1, to: 4, runner }],
      })
    ).toBe('小明 因守備失誤上壘（E5，三壘手傳球失誤），小明 進佔二壘，一壘跑者 阿華 回本壘得分。')
  })

  it('安打附有失誤，打者多進的壘也寫出來', () => {
    expect(
      describe1({ result: '2B', hit_direction: 'RF', hit_type: 'line', batter_to: 3, with_error: true, error_by: 9, error_kind: 'catch' })
    ).toBe('小明 擊出右外野平飛二壘安打，守備同時出現失誤（右外野手接球失誤），小明 因失誤進佔三壘。')
  })

  it('三振不會出現守備路線；舊版的出局代碼仍能顯示', () => {
    expect(describe1({ result: 'K', fielding: '2', batter_to: 0 })).toBe('小明 三振出局。')
    expect(describe1({ result: 'GO', batter_to: 0 })).toBe('小明 滾地球出局。')
  })
})

describe('describeSubstitutions：換人文字', () => {
  it('用換人之前的打線來寫，多筆用分號隔開', () => {
    const changes = normalizeChanges([
      { side: 'away', order: 2, type: 'ph', number: 50, name: '代打王' },
      { side: 'home', order: 1, type: 'swap', swapWith: 2 },
    ])
    expect(describeSubstitutions(changes, START, TEAMS)).toBe(
      '客隊 第 2 棒 A2 由 代打王 代打；主隊 守位交換：第 1 棒 H1（投手）與第 2 棒 H2（捕手）互換守位。'
    )
  })

  it('換人改守位、插入打者', () => {
    const changes = normalizeChanges([
      { side: 'away', order: 1, type: 'sub', number: 51, position: 'SF' },
      { side: 'away', order: 11, type: 'ins', number: 52, name: '新人', position: 'DH' },
    ])
    expect(describeSubstitutions(changes, START, TEAMS)).toBe(
      '客隊 第 1 棒 A1 由 #51 換人，改守自由球員；客隊 臨時插入打者：新人 加在最後一棒（第 11 棒），守指定打擊。'
    )
  })
})
