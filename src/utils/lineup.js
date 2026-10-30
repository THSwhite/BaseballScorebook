/**
 * lineup.js
 * 先發名單 + 換人紀錄 → 目前的打線（純函式，不含畫面）
 *
 * 異動有五種：
 *   pr   代跑：壘上的跑者換成新球員（新球員接替這一棒）
 *   ph   代打：新球員接替這一棒的打擊，守位不變
 *   sub  換人：新球員接替這一棒，可以同時改守位
 *   swap 守位交換：兩棒互換守位，不換人
 *   ins  插入打者：新球員插進打線的某一棒，原本那一棒以後的人依序往後移（打線多一人）
 * 被換下場的球員不能再回場。
 */
import { POSITION_NAMES, SUB_LABEL } from './formatters'

export const SUB_TYPE_OPTIONS = [
  { value: 'pr', label: SUB_LABEL.pr },
  { value: 'ph', label: SUB_LABEL.ph },
  { value: 'sub', label: SUB_LABEL.sub },
  { value: 'swap', label: SUB_LABEL.swap },
]

const DH = 'DH' // 指定打擊可以有多位，不檢查重複
const hasNumber = (n) => n !== null && n !== undefined && n !== ''
const hasName = (p) => !!(p.name ?? '').trim()

export const isBlankPlayer = (p) => !p.playerId && !hasNumber(p.number) && !hasName(p)

/** 兩個人是不是同一位：先比球隊名單的 id，再比背號，最後比姓名；兩邊都沒資料就當作同一個空位 */
export function samePlayer(a, b) {
  if (a.playerId && b.playerId) return a.playerId === b.playerId
  if (hasNumber(a.number) && hasNumber(b.number)) return Number(a.number) === Number(b.number)
  if (hasName(a) && hasName(b)) return a.name.trim() === b.name.trim()
  return isBlankPlayer(a) && isBlankPlayer(b)
}

/**
 * 把畫面上填的異動整理成要存的格式
 * 「插入打者」排在最後處理：其他異動寫的打序，都是插入之前的打序
 */
export function normalizeChanges(changes) {
  const list = changes.map((c) => ({
    side: c.side,
    order: Number(c.order),
    type: c.type,
    playerId: c.type === 'swap' ? null : (c.playerId ?? null),
    name: c.type === 'swap' ? '' : String(c.name ?? '').trim(),
    number: c.type === 'swap' || !hasNumber(c.number) ? null : Number(c.number),
    position: (c.type === 'sub' || c.type === 'ins') && c.position ? c.position : null,
    swapWith: c.type === 'swap' ? Number(c.swapWith) : null,
  }))
  return list.sort((a, b) => (a.type === 'ins') - (b.type === 'ins')) // 穩定排序：其他異動維持原本順序
}

// 套用一個異動，回傳新的打線（不改動傳進來的資料）
function applyChange(lineups, retired, c) {
  const list = [...(lineups[c.side] ?? [])]
  if (c.type === 'ins') {
    // 插入打者：插在第 order 棒，原本那一棒以後的人依序往後移一棒（沒有人被換下場）
    const at = Math.min(Math.max(c.order, 1), list.length + 1)
    list.splice(at - 1, 0, {
      order: at,
      name: c.name ?? '',
      number: c.number ?? null,
      playerId: c.playerId ?? null,
      position: c.position || '',
    })
    return { ...lineups, [c.side]: list.map((s, i) => ({ ...s, order: i + 1 })) }
  }
  if (c.type === 'swap') {
    const a = list[c.order - 1]
    const b = list[c.swapWith - 1]
    if (!a || !b) return lineups
    list[c.order - 1] = { ...a, position: b.position }
    list[c.swapWith - 1] = { ...b, position: a.position }
  } else {
    const old = list[c.order - 1]
    if (!old) return lineups
    retired[c.side].push(old) // 被換下場的人，不能再回場
    list[c.order - 1] = {
      order: c.order,
      name: c.name ?? '',
      number: c.number ?? null,
      playerId: c.playerId ?? null,
      position: c.position || old.position,
    }
  }
  return { ...lineups, [c.side]: list }
}

/**
 * 從先發名單與所有換人紀錄，算出目前的打線與已被換下場的球員
 * @returns {{ lineups: {away, home}, retired: {away: [], home: []} }}
 */
export function buildLineupState(start, rows) {
  let lineups = { away: [...(start.away ?? [])], home: [...(start.home ?? [])] }
  const retired = { away: [], home: [] }
  for (const row of rows) {
    if ((row.kind ?? 'pa') !== 'sub') continue
    for (const c of row.subs ?? []) lineups = applyChange(lineups, retired, c)
  }
  return { lineups, retired }
}

/**
 * 檢查這一批異動能不能送出
 * @param ctx { battingSide: 'away'|'home', bases }  目前進攻的一方與壘上跑者
 * @returns {string} 錯誤訊息，空字串代表沒問題
 */
export function validateSubstitutions(lineupState, ctx, changes) {
  if (changes.length === 0) return '請至少勾選一位要異動的球員'
  const slotOf = (side, order) => lineupState.lineups[side]?.[order - 1]
  const onBase = (side, order) => side === ctx.battingSide && ctx.bases.some((b) => b && b.order === order)
  const claimed = new Set() // 每一棒一次只能有一個異動（守位交換會同時占用兩棒）
  const inserted = new Set() // 每一隊一次只能插入一位打者

  for (const c of changes) {
    if (c.type === 'ins') {
      const size = lineupState.lineups[c.side]?.length ?? 0
      if (!Number.isInteger(c.order) || c.order < 1 || c.order > size + 1) return `插入的位置不正確（第 ${c.order} 棒）`
      if (inserted.has(c.side)) return '同一隊一次只能插入一位打者'
      inserted.add(c.side)
      if (c.number === null && !c.playerId) return '插入的打者請輸入背號，或從球隊名單選擇'
      if (c.number !== null && !(Number.isInteger(c.number) && c.number >= 0 && c.number <= 999)) {
        return '背號請輸入 0～999 的整數'
      }
      if (!c.position) return '插入的打者請選擇守備位置（沒有守備就選指定打擊）'
      continue
    }

    const slot = slotOf(c.side, c.order)
    if (!slot) return `找不到第 ${c.order} 棒`
    if (!['pr', 'ph', 'sub', 'swap'].includes(c.type)) return `第 ${c.order} 棒的異動類型不正確`
    const key = `${c.side}:${c.order}`
    if (claimed.has(key)) return `第 ${c.order} 棒同時有兩個異動`
    claimed.add(key)

    if (c.type === 'swap') {
      if (!c.swapWith || c.swapWith === c.order || !slotOf(c.side, c.swapWith)) {
        return `第 ${c.order} 棒的守位交換，請選擇另一位要互換的球員`
      }
      const partner = `${c.side}:${c.swapWith}`
      if (claimed.has(partner)) return `第 ${c.swapWith} 棒同時有兩個異動`
      claimed.add(partner)
      continue
    }

    if (c.type === 'pr' && !onBase(c.side, c.order)) return `第 ${c.order} 棒目前不在壘上，不能代跑`
    if (c.type === 'ph' && onBase(c.side, c.order)) return `第 ${c.order} 棒目前在壘上，請改用「代跑」`
    if (c.number === null && !c.playerId) return `第 ${c.order} 棒請輸入新球員的背號，或從球隊名單選擇`
    if (c.number !== null && !(Number.isInteger(c.number) && c.number >= 0 && c.number <= 999)) {
      return '背號請輸入 0～999 的整數'
    }
  }

  // 套用全部異動之後，檢查結果是否合理
  const retired = { away: [...lineupState.retired.away], home: [...lineupState.retired.home] }
  let next = lineupState.lineups
  for (const c of changes) next = applyChange(next, retired, c)

  const labelOf = (p) => (hasNumber(p.number) ? `背號 ${p.number}` : hasName(p) ? p.name.trim() : `第 ${p.order} 棒`)

  for (const c of changes) {
    if (c.type === 'swap') continue
    const incoming = { name: c.name, number: c.number, playerId: c.playerId }
    // 之前已經被換下場的人，或這次被換下去的人，都不能當成新球員
    const comeback = lineupState.retired[c.side].find((r) => samePlayer(incoming, r))
    if (comeback) return `${labelOf(comeback)} 已經被換下場，不能再回場`
  }

  const sides = [...new Set(changes.map((c) => c.side))]
  for (const side of sides) {
    const list = next[side]
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (!isBlankPlayer(list[i]) && samePlayer(list[i], list[j])) {
          return `${labelOf(list[i])} 重複了（第 ${i + 1} 棒與第 ${j + 1} 棒），一位球員只能站一個打序`
        }
      }
    }
    const used = list.map((s) => s.position).filter((p) => p && p !== DH)
    const dup = used.find((p, i) => used.indexOf(p) !== i)
    if (dup) return `守備位置「${POSITION_NAMES[dup] ?? dup}」重複了，請調整位置或改用「守位交換」`
  }

  // 這次被換下去的人，是否又被當成其他棒的新球員
  for (const c of changes) {
    if (c.type === 'swap' || c.type === 'ins') continue
    const out = lineupState.lineups[c.side][c.order - 1]
    const again = changes.find(
      (o) => o !== c && o.type !== 'swap' && o.side === c.side && samePlayer({ name: o.name, number: o.number, playerId: o.playerId }, out) && !isBlankPlayer(out)
    )
    if (again) return `${labelOf(out)} 已經被換下場，不能再回場`
  }
  return ''
}