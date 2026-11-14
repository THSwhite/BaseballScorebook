import { useCallback, useEffect, useState } from 'react'
import {
  fetchPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer,
  errorMessage,
} from './teamsApi'
import { POSITION_NAMES, POSITION_OPTIONS } from '../../utils/baseballRules'
import { buttonClass, errorClass, inputClass, labelClass, mutedClass } from '../../components/styles'

const BATS_LABEL = { R: '右打', L: '左打', S: '左右開弓' }
const THROWS_LABEL = { R: '右投', L: '左投' }

const linkButton = 'rounded px-2 py-1 text-sm font-medium hover:bg-stone-100'

/* ---------- 新增／編輯用的小表單 ---------- */
function PlayerForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [number, setNumber] = useState(initial?.jersey_number ?? '')
  const [position, setPosition] = useState(initial?.primary_position ?? '')
  const [bats, setBats] = useState(initial?.bats ?? '')
  const [throwsHand, setThrowsHand] = useState(initial?.throws ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const idPrefix = `player-${initial?.id ?? 'new'}`

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('請輸入球員姓名')
      return
    }
    const jersey = number === '' ? null : Number(number)
    if (jersey !== null && (!Number.isInteger(jersey) || jersey < 0 || jersey > 999)) {
      setError('背號請輸入 0～999 的整數')
      return
    }

    setSaving(true)
    setError('')
    try {
      await onSubmit({
        name: trimmed,
        jersey_number: jersey,
        primary_position: position || null,
        bats: bats || null,
        throws: throwsHand || null,
      })
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  const select = (id, label, value, onChange, options) => (
    <div className="min-w-28 flex-1">
      <label htmlFor={id} className={labelClass}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">未指定</option>
        {options.map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="my-3 space-y-4 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap gap-3">
        <div className="w-20">
          <label htmlFor={`${idPrefix}-number`} className={labelClass}>背號</label>
          <input
            id={`${idPrefix}-number`}
            type="number"
            inputMode="numeric"
            min="0"
            max="999"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="min-w-40 flex-[2]">
          <label htmlFor={`${idPrefix}-name`} className={labelClass}>姓名</label>
          <input
            id={`${idPrefix}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            autoFocus
            className={inputClass}
          />
        </div>

        {select(`${idPrefix}-position`, '主要守位', position, setPosition, POSITION_OPTIONS.map((p) => [p.value, p.label]))}
        {select(`${idPrefix}-bats`, '打擊', bats, setBats, Object.entries(BATS_LABEL))}
        {select(`${idPrefix}-throws`, '投球', throwsHand, setThrowsHand, Object.entries(THROWS_LABEL))}
      </div>

      {error && <p role="alert" className={errorClass}>{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={buttonClass.primary}>
          {saving ? '儲存中…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={buttonClass.secondary}>
          取消
        </button>
      </div>
    </form>
  )
}

/* ---------- 球員名單 ---------- */
// 父層請加 key={team.id}，切換球隊時狀態會自動重設
export default function PlayerList({ team, onChanged }) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const load = useCallback(
    () =>
      fetchPlayers(team.id)
        .then((data) => {
          setPlayers(data)
          setError('')
        })
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setLoading(false)),
    [team.id]
  )

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd(fields) {
    await createPlayer(team.id, fields)
    setAdding(false)
    await load()
    onChanged?.()
  }

  async function handleUpdate(id, fields) {
    await updatePlayer(id, fields)
    setEditingId(null)
    await load()
  }

  async function handleDelete(player) {
    if (!window.confirm(`確定要刪除「${player.name}」嗎？`)) return
    try {
      await deletePlayer(player.id)
      await load()
      onChanged?.()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-stone-900">球員名單（{players.length}）</h3>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={buttonClass.primary}>
            新增球員
          </button>
        )}
      </div>

      {error && <p role="alert" className={errorClass}>{error}</p>}

      {adding && (
        <PlayerForm
          submitLabel="新增球員"
          onSubmit={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}

      {loading ? (
        <p className={mutedClass}>載入中…</p>
      ) : players.length === 0 && !adding ? (
        <p className={mutedClass}>這支球隊還沒有球員，按「新增球員」開始建立名單。</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs text-stone-500">
                <th className="w-14 px-3 py-2 font-medium">背號</th>
                <th className="px-3 py-2 font-medium">姓名</th>
                <th className="px-3 py-2 font-medium">守位</th>
                <th className="px-3 py-2 font-medium">投打</th>
                <th className="px-3 py-2" aria-label="操作" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {players.map((p) =>
                editingId === p.id ? (
                  <tr key={p.id}>
                    <td colSpan={5} className="px-3">
                      <PlayerForm
                        initial={p}
                        submitLabel="儲存變更"
                        onSubmit={(fields) => handleUpdate(p.id, fields)}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className="text-stone-900">
                    <td className="px-3 py-2 tabular-nums text-stone-600">{p.jersey_number ?? '–'}</td>
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2">{POSITION_NAMES[p.primary_position] ?? p.primary_position ?? '–'}</td>
                    <td className="px-3 py-2 text-stone-600">
                      {[THROWS_LABEL[p.throws], BATS_LABEL[p.bats]].filter(Boolean).join(' / ') || '–'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button type="button" onClick={() => setEditingId(p.id)} className={`${linkButton} text-emerald-800`}>
                        編輯
                      </button>
                      <button type="button" onClick={() => handleDelete(p)} className={`${linkButton} text-red-700`}>
                        刪除
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
