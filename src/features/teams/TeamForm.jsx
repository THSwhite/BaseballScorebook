import { useState } from 'react'
import { createTeam, updateTeam, errorMessage } from './teamsApi'
import { buttonClass, errorClass, inputClass, labelClass } from '../../components/styles'

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
    <form onSubmit={handleSubmit} className="my-3 space-y-4 rounded-lg border border-stone-200 bg-white p-4">
      <div>
        <label htmlFor="team-name" className={labelClass}>球隊名稱</label>
        <input
          id="team-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：高雄雷霆"
          maxLength={40}
          autoFocus
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="team-short-name" className={labelClass}>簡稱（轉播頁顯示用）</label>
        <input
          id="team-short-name"
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          placeholder="例如：雷霆"
          maxLength={8}
          className={inputClass}
        />
      </div>

      {error && <p role="alert" className={errorClass}>{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={buttonClass.primary}>
          {saving ? '儲存中…' : team ? '儲存變更' : '建立球隊'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving} className={buttonClass.secondary}>
            取消
          </button>
        )}
      </div>
    </form>
  )
}
