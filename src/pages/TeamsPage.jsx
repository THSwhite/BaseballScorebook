import { useCallback, useEffect, useState } from 'react'
import TeamForm from '../features/teams/TeamForm'
import PlayerList from '../features/teams/PlayerList'
import { fetchTeams, deleteTeam, errorMessage } from '../features/teams/TeamsApi'
import '../features/teams/teams.css'

export default function TeamsPage() {
  const [teams, setTeams] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      setTeams(await fetchTeams())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const selected = teams.find((t) => t.id === selectedId) ?? null

  async function handleTeamSaved(team) {
    await load()
    setSelectedId(team.id)
    setCreating(false)
    setEditing(false)
  }

  async function handleDelete() {
    if (!selected) return
    const ok = window.confirm(
      `確定要刪除「${selected.name}」嗎？球隊底下所有球員也會一併刪除。`
    )
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
    <div className="tm-page">
      <h2>球隊管理</h2>
      {error && <p className="tm-error">{error}</p>}

      <div className="tm-layout">
        {/* 左：球隊列表 */}
        <aside>
          {loading ? (
            <p className="tm-muted">載入中…</p>
          ) : (
            <ul className="tm-side-list">
              {teams.map((t) => (
                <li key={t.id}>
                  <button
                    className="tm-team-item"
                    aria-current={t.id === selectedId}
                    onClick={() => {
                      setSelectedId(t.id)
                      setCreating(false)
                      setEditing(false)
                    }}
                  >
                    <span>{t.name}</span>
                    <span className="tm-muted">{t.players?.[0]?.count ?? 0} 人</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && teams.length === 0 && !creating && (
            <p className="tm-muted">還沒有球隊，先建立第一支吧。</p>
          )}
          <button
            className="tm-btn tm-btn-primary"
            onClick={() => {
              setCreating(true)
              setSelectedId(null)
              setEditing(false)
            }}
          >
            建立球隊
          </button>
        </aside>

        {/* 右：新增表單，或選中球隊的詳細內容 */}
        <main className="tm-main">
          {creating && (
            <TeamForm key="new" onSaved={handleTeamSaved} onCancel={() => setCreating(false)} />
          )}

          {!creating && selected && (
            <>
              <div className="tm-team-head">
                <div>
                  <h3>{selected.name}</h3>
                  {selected.short_name && (
                    <p className="tm-muted">簡稱：{selected.short_name}</p>
                  )}
                </div>
                <div className="tm-actions">
                  <button className="tm-btn" onClick={() => setEditing((v) => !v)}>
                    {editing ? '收起' : '編輯球隊'}
                  </button>
                  <button className="tm-btn tm-danger" onClick={handleDelete}>
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
            <p className="tm-muted">從左側選擇一支球隊，查看或編輯球員名單。</p>
          )}
        </main>
      </div>
    </div>
  )
}