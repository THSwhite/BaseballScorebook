/**LineupEditor.jsx*/
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import PlayerPicker from '../teams/PlayerPicker'
import '../teams/Teams.css'

export const POSITIONS = [
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

const MIN_SLOTS = 9 // 預設列數；棒次沒有上限，可無限增加
const DH = 'DH' // 指定打擊可以有多位，不檢查重複

// PlayerPicker 用到的顏色變數（原本定義在 .tm-page，這裡補上讓它在先發視窗也能正常顯示）
const pickerVars = {
  '--tm-accent': '#065f46',
  '--tm-line': 'rgba(128, 128, 128, 0.3)',
  '--tm-soft': 'rgba(128, 128, 128, 0.1)',
}

let keyCounter = 0
const newSlot = (overrides = {}) => ({
  key: `slot-${keyCounter++}`,
  player_id: null, // 有值代表是從球隊名單選的球員
  player_name: '',
  jersey_number: '',
  position: '',
  ...overrides,
})

// 姓名可以留空，所以「空棒次」改為：沒有連結球員、沒有姓名、沒有背號
const isBlankSlot = (s) => !s.player_id && !s.player_name.trim() && String(s.jersey_number) === ''

/**
 * 先發名單編輯器（打序 = 列表順序）
 * @param {object} game   games 資料列（需含 away_team_id / home_team_id 才能套用球隊名單）
 * @param {'away'|'home'} side  編輯哪一隊
 * @param {() => void} onSaved  儲存成功後的回呼
 */
export default function LineupEditor({ game, side, onSaved }) {
  const teamName = side === 'away' ? game.away_team : game.home_team
  const teamId = side === 'away' ? game.away_team_id : game.home_team_id
  const [slots, setSlots] = useState(() => Array.from({ length: MIN_SLOTS }, () => newSlot()))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  // 載入已存在的先發名單
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('lineups')
        .select('*')
        .eq('game_id', game.id)
        .eq('team_side', side)
        .order('batting_order')
      if (cancelled) return
      if (error) setMessage({ type: 'error', text: `讀取失敗：${error.message}` })
      else if (data.length > 0) {
        const loaded = data.map((r) =>
          newSlot({
            player_id: r.player_id ?? null,
            player_name: r.player_name,
            jersey_number: r.jersey_number ?? '',
            position: r.position,
          })
        )
        while (loaded.length < MIN_SLOTS) loaded.push(newSlot())
        setSlots(loaded)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [game.id, side])

  // 手動修改姓名或背號時，解除與球隊名單的連結
  const update = (key, field, value) =>
    setSlots((list) =>
      list.map((s) => {
        if (s.key !== key) return s
        const unlink = field === 'player_name' || field === 'jersey_number'
        return { ...s, [field]: value, ...(unlink ? { player_id: null } : {}) }
      })
    )

  // 從球隊名單點選球員：依序填入第一個空的打序
  function pickPlayer(player) {
    // 守位：DH 可重複；其他守位若已被占用就留空，由使用者自己選
    const pos = player.primary_position
    const taken = pos && pos !== DH && slots.some((s) => s.position === pos)
    const position = pos && !taken ? pos : ''

    const fill = {
      player_id: player.id,
      player_name: player.name,
      jersey_number: player.jersey_number ?? '',
    }

    const index = slots.findIndex(isBlankSlot)
    setSlots((list) =>
      index === -1
        ? [...list, newSlot({ ...fill, position })] // 沒有空位就自動新增一棒
        : list.map((s, i) => (i === index ? { ...s, ...fill, position: s.position || position } : s))
    )
    setMessage({ type: '', text: '' })
  }

  const move = (index, delta) =>
    setSlots((list) => {
      const target = index + delta
      if (target < 0 || target >= list.length) return list
      const next = [...list]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  const addSlot = () => setSlots((list) => [...list, newSlot()])

  // 超過 9 棒就移除該列；剛好 9 棒時改為清空內容（讓被選走的球員可以重新選）
  function removeOrClear(key) {
    setSlots((list) =>
      list.length > MIN_SLOTS
        ? list.filter((s) => s.key !== key)
        : list.map((s) =>
            s.key === key
              ? { ...s, player_id: null, player_name: '', jersey_number: '', position: '' }
              : s
          )
    )
  }

  function validate() {
    for (let i = 0; i < slots.length; i++) {
      // 姓名可以留空，只要求守備位置
      if (!slots[i].position) return `第 ${i + 1} 棒還沒選守備位置。`
    }
    // 指定打擊（DH）可以有多位，其他守位不可重複
    const used = slots.map((s) => s.position).filter((p) => p !== DH)
    const dup = used.find((p, i) => used.indexOf(p) !== i)
    if (dup) return `守備位置「${POSITIONS.find((p) => p.value === dup).label}」重複了。`
    const numbers = slots.map((s) => String(s.jersey_number).trim()).filter(Boolean)
    const dupNumber = numbers.find((n, i) => numbers.indexOf(n) !== i)
    if (dupNumber) return `背號 ${dupNumber} 重複了。`
    return ''
  }

  async function handleSave() {
    const problem = validate()
    if (problem) return setMessage({ type: 'error', text: problem })

    setSaving(true)
    setMessage({ type: '', text: '' })

    const { error: deleteError } = await supabase
      .from('lineups')
      .delete()
      .eq('game_id', game.id)
      .eq('team_side', side)
    if (deleteError) {
      setSaving(false)
      return setMessage({ type: 'error', text: `儲存失敗：${deleteError.message}` })
    }

    const rows = slots.map((s, i) => ({
      game_id: game.id,
      team_side: side,
      batting_order: i + 1,
      player_id: s.player_id,
      player_name: s.player_name.trim(),
      jersey_number: s.jersey_number === '' ? null : Number(s.jersey_number),
      position: s.position,
    }))
    const { error: insertError } = await supabase.from('lineups').insert(rows)
    setSaving(false)

    if (insertError) return setMessage({ type: 'error', text: `儲存失敗：${insertError.message}` })
    setMessage({ type: 'success', text: '先發名單已儲存。' })
    onSaved?.()
  }

  if (loading) return <p className="py-6 text-center text-stone-500">載入先發名單中…</p>

  const fieldClass =
    'rounded-md border border-stone-300 bg-white px-2 py-1.5 text-stone-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/30'
  const iconButton =
    'rounded px-2 py-1 text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-30'
  const canRemove = slots.length > MIN_SLOTS

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-stone-900">
        {teamName}・先發打序
      </h2>

      {/* 快速套用：從球隊名單點選球員 */}
      {teamId ? (
        <details open className="rounded-md border border-stone-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-stone-700">
            從球隊名單選擇（點選球員，依序填入打序）
          </summary>
          <div className="mt-3" style={pickerVars}>
            <PlayerPicker
              teamId={teamId}
              excludeIds={slots.map((s) => s.player_id).filter(Boolean)}
              onPick={pickPlayer}
            />
          </div>
        </details>
      ) : (
        <p className="rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-600">
          這場比賽的{side === 'away' ? '先攻' : '後攻'}沒有連結球隊，請手動輸入。建立比賽時選擇球隊，就能在這裡快速套用名單。
        </p>
      )}

      <ol className="space-y-2">
        {slots.map((slot, i) => (
          <li key={slot.key} className="flex items-center gap-2">
            <span className="w-6 text-right font-semibold tabular-nums text-stone-500">{i + 1}</span>
            <input
              type="number"
              min="0"
              max="999"
              inputMode="numeric"
              aria-label={`第 ${i + 1} 棒背號`}
              placeholder="背號"
              value={slot.jersey_number}
              onChange={(e) => update(slot.key, 'jersey_number', e.target.value)}
              className={`${fieldClass} w-20`}
            />
            <input
              type="text"
              aria-label={`第 ${i + 1} 棒球員姓名`}
              placeholder="球員姓名（可留空）"
              value={slot.player_name}
              onChange={(e) => update(slot.key, 'player_name', e.target.value)}
              className={`${fieldClass} min-w-0 flex-1`}
            />
            {slot.player_id && (
              <span title="已連結球隊名單" aria-label="已連結球隊名單" className="text-emerald-800">✓</span>
            )}
            <select
              aria-label={`第 ${i + 1} 棒守備位置`}
              value={slot.position}
              onChange={(e) => update(slot.key, 'position', e.target.value)}
              className={`${fieldClass} w-28`}
            >
              <option value="">守備位置</option>
              {POSITIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <div className="flex">
              <button type="button" aria-label="上移" disabled={i === 0} onClick={() => move(i, -1)} className={iconButton}>▲</button>
              <button type="button" aria-label="下移" disabled={i === slots.length - 1} onClick={() => move(i, 1)} className={iconButton}>▼</button>
              <button
                type="button"
                aria-label={canRemove ? '移除這一棒' : '清空這一棒'}
                title={canRemove ? '移除這一棒' : '清空這一棒'}
                onClick={() => removeOrClear(slot.key)}
                className={iconButton}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addSlot}
          className="text-sm text-emerald-800 hover:underline"
        >
          ＋ 增加一棒
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-emerald-800 px-5 py-2 font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
        >
          {saving ? '儲存中…' : '儲存先發名單'}
        </button>
      </div>

      {message.text && (
        <p
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`rounded-md px-3 py-2 text-sm ${
            message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}