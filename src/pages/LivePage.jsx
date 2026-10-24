import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Scoreboard from '../features/live/Scoreboard'
import LiveFeed from '../features/live/LiveFeed'
import GameBoxScore from '../features/live/GameBoxScore'
import { useLiveGame } from '../features/live/useLiveGame'
import BaseDiamond from '../features/scoring/BaseDiamond'
import { playerLabel } from '../utils/formatters'

/* ---------- 目前局面：壘包、出局、打者 ---------- */
function Situation({ game, state, lineups, finished }) {
  if (finished) {
    const winnerName = state.winner ? (state.winner === 'home' ? game.home_team : game.away_team) : null
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-4 text-center">
        <p className="text-lg font-semibold text-stone-900">比賽結束</p>
        {winnerName && <p className="mt-1 text-sm text-stone-600">{winnerName} 獲勝</p>}
      </div>
    )
  }

  const side = state.half === 'top' ? 'away' : 'home'
  const team = side === 'away' ? game.away_team : game.home_team
  const lineup = lineups[side]
  const size = lineup.length || 9
  const order = state.nextBatter[side]
  const nextOrder = (order % size) + 1
  const slotOf = (o) => lineup[o - 1] ?? { order: o, name: '', number: null }

  return (
    <div className="space-y-4 rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-center text-sm font-medium text-stone-700">
        {state.inning} 局{state.half === 'top' ? '上' : '下'}・{team} 進攻
        {state.setSize > 1 && `（第 ${state.setNo} / ${state.setSize} 個半局）`}
      </p>
      <BaseDiamond bases={state.bases} outs={state.outs} />
      <dl className="space-y-2 border-t border-stone-100 pt-3 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-stone-500">打擊</dt>
          <dd className="text-right font-semibold text-stone-900">
            <span className="mr-1.5 font-normal text-stone-400">{order}</span>
            {playerLabel(slotOf(order))}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-stone-500">下一棒</dt>
          <dd className="text-right text-stone-700">
            <span className="mr-1.5 text-stone-400">{nextOrder}</span>
            {playerLabel(slotOf(nextOrder))}
          </dd>
        </div>
      </dl>
    </div>
  )
}

/* ---------- 更新狀態 ---------- */
function UpdateIndicator({ connected, onRefresh }) {
  return (
    <div className="flex items-center gap-3 text-xs text-stone-500">
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${connected ? 'animate-pulse bg-emerald-600' : 'bg-amber-500'}`}
        />
        {connected ? '即時更新中' : '每幾秒自動更新'}
      </span>
      <button type="button" onClick={onRefresh} className="text-emerald-800 hover:underline">立即更新</button>
    </div>
  )
}

export default function LivePage() {
  const { id } = useParams()
  const live = useLiveGame(id)
  const [tab, setTab] = useState('feed')
  const { game } = live

  // 分頁標題顯示對戰組合
  useEffect(() => {
    if (!game) return
    const previous = document.title
    document.title = `${game.away_team} vs ${game.home_team}`
    return () => {
      document.title = previous
    }
  }, [game])

  if (live.loading) return <p className="py-16 text-center text-stone-500">載入轉播中…</p>
  if (live.error || !game) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 text-center">
        <p role="alert" className="text-red-700">{live.error || '目前無法連線，請稍後再試。'}</p>
        <Link to="/" className="mt-4 inline-block text-emerald-800 hover:underline">回到比賽列表</Link>
      </main>
    )
  }

  const { state, totals } = live
  const finished = state.over || game.status === 'finished'
  const started = live.started
  const status = finished ? 'finished' : started ? 'live' : 'scheduled'

  const tabClass = (active) =>
    `flex-1 border-b-2 px-4 py-2.5 text-sm font-medium ${
      active ? 'border-emerald-800 text-emerald-900' : 'border-transparent text-stone-500 hover:text-stone-800'
    }`

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="text-sm text-emerald-800 hover:underline">← 比賽列表</Link>
        {status !== 'finished' && <UpdateIndicator connected={live.connected} onRefresh={live.refresh} />}
      </div>

      <Scoreboard game={game} state={state} totals={totals} status={status} />

      {status === 'scheduled' ? (
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-12 text-center">
          <p className="text-lg font-semibold text-stone-900">比賽尚未開始</p>
          <p className="mt-2 text-sm text-stone-500">
            {game.game_date}
            {game.game_time ? ` ${game.game_time.slice(0, 5)}` : ''}
            {game.location ? `　${game.location}` : ''}
          </p>
          <p className="mt-1 text-sm text-stone-500">開賽後，每個打席會即時顯示在這裡，不用重新整理。</p>
        </div>
      ) : (
        <div className="grid items-start gap-5 md:grid-cols-[260px_minmax(0,1fr)]">
          <div className="md:sticky md:top-4">
            <Situation game={game} state={state} lineups={live.lineups} finished={finished} />
          </div>

          <div className="space-y-4">
            <div role="tablist" className="flex border-b border-stone-200">
              <button type="button" role="tab" aria-selected={tab === 'feed'} onClick={() => setTab('feed')} className={tabClass(tab === 'feed')}>
                文字轉播
              </button>
              <button type="button" role="tab" aria-selected={tab === 'box'} onClick={() => setTab('box')} className={tabClass(tab === 'box')}>
                打擊成績
              </button>
            </div>

            {tab === 'feed' ? (
              <LiveFeed game={game} state={state} groups={live.groups} finished={finished} />
            ) : (
              <GameBoxScore game={game} boxScore={live.boxScore} />
            )}
          </div>
        </div>
      )}
    </main>
  )
}