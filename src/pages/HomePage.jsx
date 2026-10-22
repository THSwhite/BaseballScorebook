import { useState } from 'react'
import { Link } from 'react-router-dom'
import GameList from '../features/games/GameList'
import LineupEditor from '../features/games/LineupEditor'
import Modal from '../components/Modal'
import { useAuth } from '../features/auth/AuthContext'

export default function HomePage() {
  const { user } = useAuth()
  const [lineupGame, setLineupGame] = useState(null) // 正在編輯先發的比賽
  const [side, setSide] = useState('away')

  function openLineup(game) {
    setSide('away')
    setLineupGame(game)
  }

  const tabClass = (active) =>
    `rounded-md px-4 py-1.5 text-sm font-medium ${active ? 'bg-emerald-800 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">比賽列表</h1>
        {user && (
          <Link to="/games/new" className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900">
            建立比賽
          </Link>
        )}
      </div>

      <GameList canManage={!!user} onEditLineup={openLineup} />

      <Modal open={!!lineupGame} onClose={() => setLineupGame(null)} title="編輯先發名單">
        {lineupGame && (
          <>
            <div className="mb-4 flex gap-2">
              <button type="button" onClick={() => setSide('away')} className={tabClass(side === 'away')}>
                先攻：{lineupGame.away_team}
              </button>
              <button type="button" onClick={() => setSide('home')} className={tabClass(side === 'home')}>
                後攻：{lineupGame.home_team}
              </button>
            </div>
            <LineupEditor key={`${lineupGame.id}-${side}`} game={lineupGame} side={side} />
          </>
        )}
      </Modal>
    </main>
  )
}