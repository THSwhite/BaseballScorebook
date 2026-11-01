/**
 * offlineQueue.js
 * 離線暫存與同步
 *
 * 記錄時不直接等資料庫回應，而是：
 *   1. 先更新畫面、把要送出的動作放進佇列（存在 localStorage，重新整理也不會掉）
 *   2. 背景依序送出；斷線就停住，恢復連線後自動繼續
 *
 * 佇列裡有五種動作：
 *   insert ：新增一個打席（用 id 去重，重複送出不會寫兩次）
 *   upsert ：覆蓋一個已存在的打席（同一筆只留最新的）
 *   delete ：刪除一個打席（復原時，而且該打席已經送上去了）
 *   history：修改歷史：一次刪除多筆、覆蓋多筆（見 runHistory）
 *   game   ：更新比分與狀態（同一場只留最新一筆）
 */
import { supabase } from '../../lib/supabase'

const QUEUE_KEY = 'scoring:queue:v1'
const FAILED_KEY = 'scoring:failed:v1'

// 修改歷史會讓很多筆的 seq 一起改變。如果資料表有 (game_id, seq) 的唯一限制，
// 直接覆蓋會因為「新的 seq 還被舊的那一筆佔著」而撞號，所以先把要改的列暫時搬到很後面
const SEQ_PARK = 1_000_000
const CHUNK = 100

const listeners = new Set()
let syncing = false
let inFlight = null // 正在送出的動作 id

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]')
  } catch {
    return []
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 儲存空間已滿或瀏覽器停用：只能放棄暫存
  }
  listeners.forEach((fn) => fn())
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const getQueue = () => load(QUEUE_KEY)
export const getFailed = () => load(FAILED_KEY)
export const pendingCount = () => getQueue().length
export const clearFailed = () => save(FAILED_KEY, [])

export function enqueue(op) {
  let queue = getQueue()
  if (op.type === 'game') {
    queue = queue.filter((o) => !(o.type === 'game' && o.gameId === op.gameId))
  }
  if (op.type === 'upsert') {
    // 同一筆還沒送出的 upsert 只留最新的
    queue = queue.filter((o) => !(o.type === 'upsert' && o.row.id === op.row.id && o.opId !== inFlight))
  }
  queue.push({ opId: newId(), ...op })
  save(QUEUE_KEY, queue)
  flush()
}

/**
 * 復原或刪除時呼叫：如果該打席還沒送出去，直接從佇列拿掉（回傳 true）；
 * 已經送出或正在送出，就回傳 false，由呼叫端另外排一個 delete。
 * 同一筆還沒送出的 upsert 也會一併拿掉（否則刪掉之後又被寫回去）。
 */
export function removeInsert(rowId) {
  const queue = getQueue()
  const isMine = (o) =>
    (o.type === 'insert' || o.type === 'upsert') && o.row.id === rowId && o.opId !== inFlight
  const hadInsert = queue.some((o) => o.type === 'insert' && isMine(o))
  const next = queue.filter((o) => !isMine(o))
  if (next.length !== queue.length) save(QUEUE_KEY, next)
  return hadInsert
}

/** 把同步失敗的動作重新排回佇列（問題修好之後，例如補上資料庫權限，按「重試」） */
export function retryFailed() {
  const failed = getFailed()
  if (!failed.length) return
  const queue = getQueue()
  for (const f of failed) {
    const { opId: _old, ...op } = f.op
    // 比分更新只要最新的一筆；佇列裡已經有新的就不用補舊的
    if (op.type === 'game' && queue.some((o) => o.type === 'game' && o.gameId === op.gameId)) continue
    queue.push({ opId: newId(), ...op })
  }
  save(FAILED_KEY, [])
  save(QUEUE_KEY, queue)
  flush()
}

const chunks = (list, size) => {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

// 缺少的欄位不要補成 null，免得蓋掉資料庫的預設值或造成 not null 錯誤
const UPSERT = { onConflict: 'id', defaultToNull: false }

/**
 * 修改歷史：先刪除，再把要改的列搬到暫時的 seq，最後寫入正確的 seq。
 * 每一步重複執行都不會出錯，所以中途斷線、之後重試是安全的。
 */
async function runHistory(op) {
  const deleteIds = op.deleteIds ?? []
  const rows = op.rows ?? []

  for (const ids of chunks(deleteIds, CHUNK)) {
    const res = await supabase.from(op.table).delete().in('id', ids)
    if (res.error) return res
  }
  for (const part of chunks(rows, CHUNK)) {
    const res = await supabase.from(op.table).upsert(
      part.map((r) => ({ ...r, seq: r.seq + SEQ_PARK })),
      UPSERT
    )
    if (res.error) return res
  }
  for (const part of chunks(rows, CHUNK)) {
    const res = await supabase.from(op.table).upsert(part, UPSERT)
    if (res.error) return res
  }
  return { error: null, status: 200 }
}

function run(op) {
  switch (op.type) {
    case 'insert':
      return supabase.from(op.table).upsert(op.row, { onConflict: 'id', ignoreDuplicates: true })
    case 'upsert':
      return supabase.from(op.table).upsert(op.row, { onConflict: 'id' })
    case 'delete':
      return supabase.from(op.table).delete().eq('id', op.id)
    case 'history':
      return runHistory(op)
    case 'game':
      return supabase.from('games').update(op.patch).eq('id', op.gameId)
    default:
      return Promise.resolve({ error: null, status: 200 })
  }
}

// 網路問題或伺服器暫時故障 → 之後重試；其餘（權限、欄位錯誤…）重試也沒用
const shouldRetry = (status) => status === 0 || status === 408 || status === 429 || status >= 500

/** 依序送出佇列。遇到網路問題就停下來等下次 */
export async function flush() {
  if (syncing) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  syncing = true
  try {
    for (;;) {
      const op = getQueue()[0]
      if (!op) break

      inFlight = op.opId
      let res
      try {
        res = await run(op)
      } catch (err) {
        res = { error: err, status: 0 }
      }
      inFlight = null

      if (res.error) {
        if (shouldRetry(res.status ?? 0)) break
        save(FAILED_KEY, [
          ...getFailed(),
          {
            op,
            message: res.error.message ?? String(res.error),
            code: res.error.code ?? String(res.status ?? ''),
            at: Date.now(),
          },
        ])
      }
      save(QUEUE_KEY, getQueue().filter((o) => o.opId !== op.opId))
    }
  } finally {
    syncing = false
    inFlight = null
  }
}

/** 恢復連線時自動同步，並定時重試。回傳停止函式 */
export function startAutoSync() {
  const onOnline = () => flush()
  window.addEventListener('online', onOnline)
  const timer = setInterval(() => {
    if (getQueue().length) flush()
  }, 8000)
  flush()
  return () => {
    window.removeEventListener('online', onOnline)
    clearInterval(timer)
  }
}