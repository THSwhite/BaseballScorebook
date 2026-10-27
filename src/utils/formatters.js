/**
 * formatters.js
 * 把打席資料轉成轉播用的文字（記錄頁與訪客轉播頁共用）
 */

export const BASE_NAMES = { 1: '一壘', 2: '二壘', 3: '三壘' }

// 擊球方向（守備位置）與高度的中文
const ZONE_NAMES = {
  P: '投手', C: '捕手', '1B': '一壘', '2B': '二壘', '3B': '三壘', SS: '游擊',
  LF: '左外野', CF: '中外野', RF: '右外野', SF: '自由球員',
}
const HEIGHT_NAMES = { ground: '滾地', line: '平飛', fly: '高飛' }
const BALL_NOUN = { ground: '滾地球', line: '平飛球', fly: '高飛球' }

const HIT_BASE = { '1B': 1, '2B': 2, '3B': 3 } // 安打讓打者上到的壘包

const hasNumber = (n) => n !== null && n !== undefined && n !== ''

/** 球員顯示名稱：有姓名用姓名，沒有就用背號，再沒有就用打序 */
export function playerLabel(p, { asRunner = false } = {}) {
  if (!p) return asRunner ? '跑者' : '打者'
  const name = (p.name ?? '').trim()
  if (name) return name
  if (hasNumber(p.number)) return `#${p.number}`
  return asRunner ? `第 ${p.order} 棒` : `第 ${p.order} 棒打者`
}

export const runnerLabel = (p) => playerLabel(p, { asRunner: true })

/**
 * 產生一個打席的文字描述
 * @param pa { result, batter, runners:[{from,to,runner}], runs, batter_to,
 *             hit_direction, hit_type, with_error, with_fc }
 */
export function describePlateAppearance(pa) {
  const {
    result,
    batter,
    runners = [],
    runs = 0,
    batter_to: batterTo,
    hit_direction: direction,
    hit_type: height,
    with_error: withError,
    with_fc: withFc,
  } = pa
  const who = playerLabel(batter)
  const zone = ZONE_NAMES[direction] ?? ''
  const batted = `${zone}${HEIGHT_NAMES[height] ?? ''}` // 例：左外野高飛、游擊滾地
  const parts = []

  switch (result) {
    case '1B':
      parts.push(`${who} 擊出${batted}一壘安打`)
      break
    case '2B':
      parts.push(`${who} 擊出${batted}二壘安打`)
      break
    case '3B':
      parts.push(`${who} 擊出${batted}三壘安打`)
      break
    case 'HR':
      if (runs === 4) parts.push(`${who} 擊出${batted}滿貫全壘打`)
      else if (runs >= 2) parts.push(`${who} 擊出${batted} ${runs} 分全壘打`)
      else parts.push(`${who} 擊出${batted}全壘打`)
      break
    case 'BB':
      parts.push(`${who} 獲得四壞球保送`)
      break
    case 'HBP':
      parts.push(`${who} 被觸身球，保送上壘`)
      break
    case 'E':
      parts.push(`${who} 因守備失誤上壘${batted ? `（${batted}）` : ''}`)
      if (batterTo === 4) parts.push(`${who} 跑回本壘得分`)
      else if (batterTo > 1) parts.push(`${who} 進佔${BASE_NAMES[batterTo]}`)
      break
    case 'FC':
      parts.push(`${who} 野手選擇上壘${batted ? `（${batted}）` : ''}`)
      break
    case 'K':
      parts.push(`${who} 三振出局`)
      break
    case 'OUT':
      if (BALL_NOUN[height]) parts.push(`${who} 打出${zone}${BALL_NOUN[height]}${height === 'ground' ? '出局' : '被接殺'}`)
      else parts.push(`${who} 打擊出局`)
      break
    case 'DP':
      parts.push(`${who} 擊出${batted}雙殺打`)
      break
    case 'SF':
      parts.push(`${who} 擊出${batted || '高飛'}犧牲打`)
      break
    case 'SH':
      parts.push(`${who} 犧牲觸擊${zone ? `（${zone}方向）` : ''}`)
      break
    // 以下是舊版的出局代碼，保留給之前記錄的比賽
    case 'GO':
      parts.push(`${who} 滾地球出局`)
      break
    case 'FO':
      parts.push(`${who} 飛球被接殺`)
      break
    case 'LO':
      parts.push(`${who} 平飛球被接殺`)
      break
    case 'PO':
      parts.push(`${who} 內野高飛球被接殺`)
      break
    default:
      parts.push(`${who} ${result}`)
  }

  if (withError) parts.push('守備同時出現失誤')
  // 安打附有失誤：打者比安打多進了壘包
  const hitBase = HIT_BASE[result]
  if (hitBase && batterTo > hitBase) {
    parts.push(batterTo === 4 ? `${who} 因失誤跑回本壘得分` : `${who} 因失誤進佔${BASE_NAMES[batterTo]}`)
  }
  if (withFc) parts.push('同時發生野手選擇')

  // 跑者變化：跑在前面的先說
  const moved = [...runners].filter((r) => r.to !== r.from).sort((a, b) => b.from - a.from)
  for (const r of moved) {
    const label = `${BASE_NAMES[r.from]}跑者 ${runnerLabel(r.runner)}`
    if (r.to === 4) parts.push(`${label} 回本壘得分`)
    else if (r.to === 0) parts.push(`${label} 出局`)
    else parts.push(`${label} 推進到${BASE_NAMES[r.to]}`)
  }

  return `${parts.join('，')}。`
}