import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const INNING_OPTIONS = [5, 7, 9]

function todayString() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 建立比賽表單
 * @param {(game: object) => void} onCreated  建立成功後回傳新比賽（可用來導向先發設定）
 */
export default function CreateGameForm({ onCreated }) {
  const [form, setForm] = useState({
    game_date: todayString(),
    game_time: '18:00',
    location: '',
    away_team: '',
    home_team: '',
    innings: 7,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const away = form.away_team.trim()
    const home = form.home_team.trim()
    if (!away || !home) return setError('請填寫先攻與後攻球隊名稱。')
    if (away === home) return setError('先攻與後攻不能是同一支球隊。')

    setSaving(true)
    const { data: userData } = await supabase.auth.getUser()

    const { data, error: insertError } = await supabase
      .from('games')
      .insert({
        game_date: form.game_date,
        game_time: form.game_time || null,
        location: form.location.trim() || null,
        away_team: away,
        home_team: home,
        innings: Number(form.innings),
        status: 'scheduled',
        away_score: 0,
        home_score: 0,
        created_by: userData?.user?.id ?? null,
      })
      .select()
      .single()
    setSaving(false)

    if (insertError) return setError(`建立失敗：${insertError.message}`)
    onCreated?.(data)
  }

  const inputClass =
    'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/30'
  const labelClass = 'mb-1 block text-sm font-medium text-stone-700'

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="game_date" className={labelClass}>日期</label>
          <input id="game_date" type="date" required value={form.game_date} onChange={set('game_date')} className={inputClass} />
        </div>
        <div>
          <label htmlFor="game_time" className={labelClass}>開賽時間</label>
          <input id="game_time" type="time" value={form.game_time} onChange={set('game_time')} className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="location" className={labelClass}>球場（選填）</label>
        <input id="location" type="text" value={form.location} onChange={set('location')} placeholder="例如：高雄市立澄清湖棒球場" className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="away_team" className={labelClass}>先攻球隊（客隊）</label>
          <input id="away_team" type="text" required value={form.away_team} onChange={set('away_team')} className={inputClass} />
        </div>
        <div>
          <label htmlFor="home_team" className={labelClass}>後攻球隊（主隊）</label>
          <input id="home_team" type="text" required value={form.home_team} onChange={set('home_team')} className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="innings" className={labelClass}>比賽局數</label>
        <select id="innings" value={form.innings} onChange={set('innings')} className={inputClass}>
          {INNING_OPTIONS.map((n) => (
            <option key={n} value={n}>{n} 局</option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-md bg-emerald-800 px-4 py-2.5 font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
      >
        {saving ? '建立中…' : '建立比賽'}
      </button>
    </form>
  )
}
