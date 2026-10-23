/**
 * formatters.js
 * 把打席資料轉成轉播用的文字（記錄頁與訪客轉播頁共用）
 */

export const BASE_NAMES = { 1: '一壘', 2: '二壘', 3: '三壘' }

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
 * @param pa { result, batter, runners:[{from,to,runner}], runs, batter_to }
 */
export function describePlateAppearance(pa) {
  const { result, batter, runners = [], runs = 0, batter_to: batterTo } = pa
  const who = playerLabel(batter)
  const parts = []

  switch (result) {
    case '1B':
      parts.push(`${who} 擊出一壘安打`)
      break
    case '2B':
      parts.push(`${who} 擊出二壘安打`)
      break
    case '3B':
      parts.push(`${who} 擊出三壘安打`)
      break
    case 'HR':
      if (runs === 4) parts.push(`${who} 擊出滿貫全壘打`)
      else if (runs >= 2) parts.push(`${who} 擊出 ${runs} 分全壘打`)
      else parts.push(`${who} 擊出全壘打`)
      break
    case 'BB':
      parts.push(`${who} 獲得四壞球保送`)
      break
    case 'HBP':
      parts.push(`${who} 被觸身球，保送上壘`)
      break
    case 'E':
      parts.push(`${who} 因守備失誤上壘`)
      if (batterTo === 4) parts.push(`${who} 跑回本壘得分`)
      else if (batterTo > 1) parts.push(`${who} 進佔${BASE_NAMES[batterTo]}`)
      break
    case 'FC':
      parts.push(`${who} 野手選擇上壘`)
      break
    case 'K':
      parts.push(`${who} 三振出局`)
      break
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
    case 'DP':
      parts.push(`${who} 擊出雙殺打`)
      break
    case 'SF':
      parts.push(`${who} 擊出高飛犧牲打`)
      break
    case 'SH':
      parts.push(`${who} 犧牲觸擊`)
      break
    default:
      parts.push(`${who} ${result}`)
  }

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