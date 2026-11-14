/**
 * baseballRules.js
 * 棒球規則常數與守備位置（全專案共用）
 */

export const RULES = Object.freeze({
  OUTS_PER_HALF: 3, // 每半局出局數
  PLAYERS_ON_FIELD: 9, // 沒設定先發名單時，用 9 棒輪轉
})

// 守備位置：球員主要守位、先發名單、換人都用這一份
export const POSITION_OPTIONS = [
  { value: 'P', label: '投手' },
  { value: 'C', label: '捕手' },
  { value: '1B', label: '一壘手' },
  { value: '2B', label: '二壘手' },
  { value: '3B', label: '三壘手' },
  { value: 'SS', label: '游擊手' },
  { value: 'LF', label: '左外野手' },
  { value: 'CF', label: '中外野手' },
  { value: 'RF', label: '右外野手' },
  { value: 'SF', label: '自由球員' },
  { value: 'DH', label: '指定打擊' },
]

export const POSITION_NAMES = Object.fromEntries(POSITION_OPTIONS.map((p) => [p.value, p.label]))

// 指定打擊可以有多位，不檢查重複
export const DH = 'DH'
