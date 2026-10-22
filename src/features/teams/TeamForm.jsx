import { useState } from 'react'
import { createTeam, updateTeam, errorMessage } from './TeamsApi'

// team 有值 = 編輯，沒有 = 新增
// 父層請加 key={team?.id ?? 'new'}，切換球隊時表單會自動重設
export default function TeamForm({ team = null, onSaved, onCancel }) {
  const [name, setName] = useState(team?.name ?? '')
  const [shortName, setShortName] = useState(team?.short_name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('請輸入球隊名稱')
      return
    }

    setSaving(true)
    setError('')
    try {
      const payload = { name: trimmed, shortName: shortName.trim() }
      const saved = team ? await updateTeam(team.id, payload) : await createTeam(payload)
      onSaved?.(saved)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="tm-form" onSubmit={handleSubmit}>
      <label className="tm-field">
        <span>球隊名稱</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：高雄雷霆"
          maxLength={40}
          autoFocus
        />
      </label>

      <label className="tm-field">
        <span>簡稱（轉播頁顯示用）</span>
        <input
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          placeholder="例如：雷霆"
          maxLength={8}
        />
      </label>

      {error && <p className="tm-error">{error}</p>}

      <div className="tm-actions">
        <button type="submit" className="tm-btn tm-btn-primary" disabled={saving}>
          {saving ? '儲存中…' : team ? '儲存變更' : '建立球隊'}
        </button>
        {onCancel && (
          <button type="button" className="tm-btn" onClick={onCancel} disabled={saving}>
            取消
          </button>
        )}
      </div>
    </form>
  )
}