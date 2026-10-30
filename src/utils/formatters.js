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

// 守備位置編號（記分表的寫法）
export const FIELDER_NAMES = {
  1: '投手', 2: '捕手', 3: '一壘手', 4: '二壘手', 5: '三壘手',
  6: '游擊手', 7: '左外野手', 8: '中外野手', 9: '右外野手', 10: '自由球員',
}
const ERROR_KIND_NAMES = { catch: '接球失誤', throw: '傳球失誤', field: '處理失誤' }
// 打者本人出局的結果：守備路線說的就是打者的出局
const BATTER_OUT_RESULTS = new Set(['OUT', 'DP', 'SF', 'SH', 'GO', 'FO', 'LO', 'PO'])

// 換人的類型與守位名稱
export const SUB_LABEL = { pr: '代跑', ph: '代打', sub: '換人', swap: '守位交換', ins: '插入打者' }
export const POSITION_NAMES = {
  P: '投手', C: '捕手', '1B': '一壘手', '2B': '二壘手', '3B': '三壘手', SS: '游擊手',
  LF: '左外野手', CF: '中外野手', RF: '右外野手', SF: '自由球員', DH: '指定打擊',
}

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

/* ---------- 守備路線 ---------- */
/** '6-3' → [6, 3] */
export function parseFielding(text) {
  return String(text ?? '')
    .split('-')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 10)
}

/**
 * 記分表寫法：[6,3] → 6-3；單一守備員依擊球高度寫成 F8（飛球）、L6（平飛）、3U（滾地自行處理）
 * 失誤時：[5,3] → 5-3E，[6] → E6
 */
export function fieldingNotation(seq, height, { error = false } = {}) {
  if (!seq.length) return ''
  if (error) return seq.length === 1 ? `E${seq[0]}` : `${seq.join('-')}E`
  if (seq.length > 1) return seq.join('-')
  const n = seq[0]
  if (height === 'fly') return `F${n}`
  if (height === 'line') return `L${n}`
  if (height === 'ground') return `${n}U`
  return `${n}`
}

/** 守備路線的中文：[6,3] → 游擊手傳一壘手刺殺 */
export function describeFielding(seq, { height, result } = {}) {
  if (!seq.length) return ''
  const names = seq.map((n) => FIELDER_NAMES[n] ?? `${n} 號`)
  if (names.length === 1) {
    if (height === 'fly' || height === 'line') return `${names[0]}接殺`
    if (height === 'ground') return `${names[0]}自行刺殺`
    return `${names[0]}處理出局`
  }
  const chain = names.map((n, i) => (i === 0 ? n : i === 1 ? `傳${n}` : `再傳${n}`)).join('')
  return result === 'DP' ? `${chain}，完成雙殺` : `${chain}刺殺`
}

// 失誤的來源：一壘手接球失誤
function errorDetail(by, kind) {
  const name = FIELDER_NAMES[by] ?? ''
  const kindName = ERROR_KIND_NAMES[kind] ?? ''
  if (name && kindName) return `${name}${kindName}`
  if (name) return `${name}失誤`
  return kindName
}

const paren = (items) => {
  const list = items.filter(Boolean)
  return list.length ? `（${list.join('，')}）` : ''
}

/**
 * 產生一個打席的文字描述
 * @param pa { result, batter, runners:[{from,to,runner}], runs, batter_to,
 *             hit_direction, hit_type, with_error, with_fc, fielding, error_by, error_kind }
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
    fielding,
    error_by: errorBy,
    error_kind: errorKind,
  } = pa
  const who = playerLabel(batter)
  const zone = ZONE_NAMES[direction] ?? ''
  const batted = `${zone}${HEIGHT_NAMES[height] ?? ''}` // 例：左外野高飛、游擊滾地
  const seq = parseFielding(fielding)
  const errorText = errorDetail(errorBy, errorKind)
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
      parts.push(`${who} 因守備失誤上壘${paren([batted, fieldingNotation(seq, height, { error: true }), errorText])}`)
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

  // 出局怎麼產生：打者出局就接在第一句後面；其他（野選、安打時跑者被刺殺）接在跑者出局那句
  const route =
    seq.length && result !== 'E'
      ? `${fieldingNotation(seq, height)} ${describeFielding(seq, { height, result })}`.trim()
      : ''
  const routeOnBatter = BATTER_OUT_RESULTS.has(result)
  if (route && routeOnBatter) parts[0] += `（${route}）`

  if (withError) parts.push(`守備同時出現失誤${errorText ? `（${errorText}）` : ''}`)
  if (withFc) parts.push('同時發生野手選擇')

  // 安打附有失誤：打者比安打多進了壘包
  const hitBase = HIT_BASE[result]
  if (hitBase && batterTo > hitBase) {
    parts.push(batterTo === 4 ? `${who} 因失誤跑回本壘得分` : `${who} 因失誤進佔${BASE_NAMES[batterTo]}`)
  }

  // 跑者變化：跑在前面的先說
  let routeUsed = false
  const moved = [...runners].filter((r) => r.to !== r.from).sort((a, b) => b.from - a.from)
  for (const r of moved) {
    const label = `${BASE_NAMES[r.from]}跑者 ${runnerLabel(r.runner)}`
    if (r.to === 4) parts.push(`${label} 回本壘得分`)
    else if (r.to === 0) {
      const withRoute = route && !routeOnBatter && !routeUsed ? `（${route}）` : ''
      routeUsed = true
      parts.push(`${label} 出局${withRoute}`)
    } else parts.push(`${label} 推進到${BASE_NAMES[r.to]}`)
  }

  return `${parts.join('，')}。`
}

/* ---------- 換人 ---------- */
// 球員的簡短稱呼：姓名，沒有就用背號，都沒有就用 fallback
function slotLabel(p, fallback) {
  const name = (p?.name ?? '').trim()
  if (name) return name
  if (hasNumber(p?.number)) return `#${p.number}`
  return fallback
}

/**
 * 一批換人異動的文字描述（用換人之前的打線來寫）
 * @param changes    normalizeChanges() 的結果
 * @param lineups    換人之前的打線 { away, home }
 * @param teamNames  { away, home }
 */
export function describeSubstitutions(changes, lineups, teamNames) {
  const sentences = changes.map((c) => {
    const team = teamNames[c.side]
    const old = lineups[c.side]?.[c.order - 1]
    if (c.type === 'swap') {
      const other = lineups[c.side]?.[c.swapWith - 1]
      const pos = (p) => POSITION_NAMES[p?.position] ?? p?.position ?? '未定'
      return `${team} 守位交換：第 ${c.order} 棒 ${slotLabel(old, '原球員')}（${pos(old)}）與第 ${c.swapWith} 棒 ${slotLabel(other, '原球員')}（${pos(other)}）互換守位`
    }
    if (c.type === 'ins') {
      const size = lineups[c.side]?.length ?? 0
      const where = c.order > size ? `加在最後一棒（第 ${c.order} 棒）` : `插在第 ${c.order} 棒（原第 ${c.order} 棒起依序往後移）`
      const pos = c.position ? `，守${POSITION_NAMES[c.position] ?? c.position}` : ''
      return `${team} 臨時插入打者：${slotLabel(c, '新球員')} ${where}${pos}`
    }
    const moved = c.position && c.position !== old?.position ? `，改守${POSITION_NAMES[c.position] ?? c.position}` : ''
    return `${team} 第 ${c.order} 棒 ${slotLabel(old, '原球員')} 由 ${slotLabel(c, '新球員')} ${SUB_LABEL[c.type]}${moved}`
  })
  return `${sentences.join('；')}。`
}