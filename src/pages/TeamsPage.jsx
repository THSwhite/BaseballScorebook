import { useCallback, useEffect, useState } from 'react'
import TeamForm from '../features/teams/TeamForm'
import PlayerList from '../features/teams/PlayerList'
import { fetchTeams, deleteTeam, errorMessage } from '../features/teams/teamsApi'
import { buttonClass, errorClass, mutedClass } from '../components/styles'

export default function TeamsPage() {
  const [teams, setTeams] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)

  const load = useCallback(
    () =>
      fetchTeams()
        .then((data) => {
          setTeams(data)
          setError('')
        })
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setLoading(false)),
    []
  )

  useEffect(() => {
    load()
  }, [load])

  const selected = teams.find((t) => t.id === selectedId) ?? null

  function select(id) {
    setSelectedId(id)
    setCreating(false)
    setEditing(false)
  }

  function startCreating() {
    setCreating(true)
    setSelectedId(null)
    setEditing(false)
  }

  async function handleTeamSaved(team) {
    await load()
    select(team.id)
  }

  async function handleDelete() {
    if (!selected) return
    const ok = window.confirm(`確定要刪除「${selected.name}」嗎？球隊底下所有球員也會一併刪除。`)
    if (!ok) return
    try {
      await deleteTeam(selected.id)
      setSelectedId(null)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-stone-900">球隊管理</h1>
      {error && <p role="alert" className={`mb-4 ${errorClass}`}>{error}</p>}

      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        {/* 左：球隊列表 */}
        <aside className="space-y-3">
          {loading ? (
            <p className={mutedClass}>載入中…</p>
          ) : (
            <ul className="grid gap-1.5">
              {teams.map((t) => {
                const active = t.id === selectedId
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      aria-current={active}
                      onClick={() => select(t.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left ${
                        active
                          ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                          : 'border-stone-200 bg-white text-stone-900 hover:bg-stone-50'
                      }`}
                    >
                      <span className="truncate font-medium">{t.name}</span>
                      <span className="shrink-0 text-xs text-stone-500">{t.players?.[0]?.count ?? 0} 人</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {!loading && teams.length === 0 && !creating && (
            <p className={mutedClass}>還沒有球隊，先建立第一支吧。</p>
          )}
          <button type="button" onClick={startCreating} className={`w-full ${buttonClass.primary}`}>
            建立球隊
          </button>
        </aside>

        {/* 右：新增表單，或選中球隊的詳細內容 */}
        <section className="min-w-0">
          {creating && (
            <TeamForm key="new" onSaved={handleTeamSaved} onCancel={() => setCreating(false)} />
          )}

          {!creating && selected && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-stone-900">{selected.name}</h2>
                  {selected.short_name && <p className={mutedClass}>簡稱：{selected.short_name}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditing((v) => !v)} className={buttonClass.secondary}>
                    {editing ? '收起' : '編輯球隊'}
                  </button>
                  <button type="button" onClick={handleDelete} className={buttonClass.danger}>
                    刪除球隊
                  </button>
                </div>
              </div>

              {editing && (
                <TeamForm
                  key={selected.id}
                  team={selected}
                  onSaved={handleTeamSaved}
                  onCancel={() => setEditing(false)}
                />
              )}

              <PlayerList key={selected.id} team={selected} onChanged={load} />
            </>
          )}

          {!creating && !selected && !loading && teams.length > 0 && (
            <p className={mutedClass}>從左側選擇一支球隊，查看或編輯球員名單。</p>
          )}
        </section>
      </div>
    </main>
  )
}
