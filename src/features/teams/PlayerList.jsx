import { useCallback, useEffect, useState } from 'react'
import {
  fetchPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer,
  errorMessage,
} from './teamsApi'
import { POSITIONS, BATS_LABEL, THROWS_LABEL } from './Constants'

/* ---------- 新增／編輯用的小表單 ---------- */
function PlayerForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [number, setNumber] = useState(initial?.jersey_number ?? '')
  const [position, setPosition] = useState(initial?.primary_position ?? '')
  const [bats, setBats] = useState(initial?.bats ?? '')
  const [throwsHand, setThrowsHand] = useState(initial?.throws ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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

  return (
    <form className="tm-player-form" onSubmit={handleSubmit}>
      <div className="tm-player-form-grid">
        <label className="tm-field tm-field-sm">
          <span>背號</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="999"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </label>

        <label className="tm-field tm-field-grow">
          <span>姓名</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            autoFocus
          />
        </label>

        <label className="tm-field">
          <span>主要守位</span>
          <select value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="">未指定</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="tm-field">
          <span>打擊</span>
          <select value={bats} onChange={(e) => setBats(e.target.value)}>
            <option value="">未指定</option>
            {Object.entries(BATS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="tm-field">
          <span>投球</span>
          <select value={throwsHand} onChange={(e) => setThrowsHand(e.target.value)}>
            <option value="">未指定</option>
            {Object.entries(THROWS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="tm-error">{error}</p>}

      <div className="tm-actions">
        <button type="submit" className="tm-btn tm-btn-primary" disabled={saving}>
          {saving ? '儲存中…' : submitLabel}
        </button>
        <button type="button" className="tm-btn" onClick={onCancel} disabled={saving}>
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

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setPlayers(await fetchPlayers(team.id))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [team.id])

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
    <section className="tm-section">
      <div className="tm-section-head">
        <h3>球員名單（{players.length}）</h3>
        {!adding && (
          <button className="tm-btn tm-btn-primary" onClick={() => setAdding(true)}>
            新增球員
          </button>
        )}
      </div>

      {error && <p className="tm-error">{error}</p>}

      {adding && (
        <PlayerForm
          submitLabel="新增球員"
          onSubmit={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}

      {loading ? (
        <p className="tm-muted">載入中…</p>
      ) : players.length === 0 && !adding ? (
        <p className="tm-muted">這支球隊還沒有球員，按「新增球員」開始建立名單。</p>
      ) : (
        <div className="tm-table-wrap">
          <table className="tm-table">
            <thead>
              <tr>
                <th>背號</th>
                <th>姓名</th>
                <th>守位</th>
                <th>投打</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {players.map((p) =>
                editingId === p.id ? (
                  <tr key={p.id}>
                    <td colSpan={5}>
                      <PlayerForm
                        initial={p}
                        submitLabel="儲存變更"
                        onSubmit={(fields) => handleUpdate(p.id, fields)}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id}>
                    <td className="tm-num">{p.jersey_number ?? '–'}</td>
                    <td>{p.name}</td>
                    <td>{p.primary_position ?? '–'}</td>
                    <td>
                      {[THROWS_LABEL[p.throws], BATS_LABEL[p.bats]].filter(Boolean).join(' / ') ||
                        '–'}
                    </td>
                    <td className="tm-row-actions">
                      <button className="tm-link" onClick={() => setEditingId(p.id)}>
                        編輯
                      </button>
                      <button className="tm-link tm-danger" onClick={() => handleDelete(p)}>
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