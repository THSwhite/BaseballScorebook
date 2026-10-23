import { useState } from 'react'
import { RESULT_MAP } from '../../utils/plateAppearance'

const CHIP = {
  hit: 'bg-emerald-800 text-white',
  reach: 'bg-emerald-100 text-emerald-900',
  out: 'bg-stone-200 text-stone-800',
  other: 'border border-stone-300 bg-white text-stone-700',
}

const hasNumber = (n) => n !== null && n !== undefined && n !== ''

function batterLine(play) {
  const who = [hasNumber(play.batter_number) ? `#${play.batter_number}` : null, play.batter_name || null]
    .filter(Boolean)
    .join(' ')
  return `第 ${play.batting_order} 棒${who ? `・${who}` : ''}`
}

function PlayRow({ play, game, isLatest }) {
  const meta = RESULT_MAP[play.result]
  const scoring = play.runs > 0
  return (
    <li
      className={`flex gap-3 border-l-4 px-3 py-3 ${
        scoring ? 'border-emerald-600 bg-emerald-50' : isLatest ? 'border-amber-400 bg-amber-50/60' : 'border-transparent'
      }`}
    >
      <div className="w-[4.75rem] shrink-0 space-y-1.5 text-center">
        <span className={`block rounded px-1.5 py-1 text-xs font-semibold ${CHIP[meta?.group ?? 'other']}`}>
          {meta?.label ?? play.result}
        </span>
        <span className="block text-xs text-stone-500">
          {play.outsAfter >= 3 ? '三出局' : `${play.outsAfter} 出局`}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-xs text-stone-500">
          {batterLine(play)}
          {isLatest && <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-white">最新</span>}
        </p>
        <p className="mt-0.5 text-stone-900">{play.description}</p>
        {scoring && (
          <p className="mt-1.5 text-sm font-semibold tabular-nums text-emerald-800">
            得 {play.runs} 分　{game.away_team} {play.scoreAfter.away} : {play.scoreAfter.home} {game.home_team}
          </p>
        )}
      </div>
    </li>
  )
}

/**
 * 逐打席文字轉播：依半局分組，最新的在最上面，可以用局數篩選
 * @param groups  buildFeed() 的結果（時間由舊到新）
 */
export default function LiveFeed({ game, state, groups, finished }) {
  const [filter, setFilter] = useState('all')

  const currentKey = `${state.inning}-${state.half}`
  const last = groups[groups.length - 1]
  const showWaiting = !finished && last && last.key !== currentKey // 剛換邊，這個半局還沒有打席

  const allGroups = showWaiting
    ? [...groups, { key: currentKey, inning: state.inning, half: state.half, side: state.half === 'top' ? 'away' : 'home', plays: [], runs: 0, hits: 0 }]
    : groups

  const inningList = [...new Set(allGroups.map((g) => g.inning))]
  const visible = [...allGroups].filter((g) => filter === 'all' || g.inning === filter).reverse()
  const latestId = last?.plays[last.plays.length - 1]?.id

  if (allGroups.length === 0) {
    return <p className="rounded-lg border border-stone-200 bg-white py-10 text-center text-stone-500">比賽還沒有任何打席記錄。</p>
  }

  const tabClass = (active) =>
    `shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${
      active ? 'bg-emerald-800 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
    }`

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="局數篩選" className="flex gap-2 overflow-x-auto pb-1">
        <button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')} className={tabClass(filter === 'all')}>
          全部
        </button>
        {inningList.map((n) => (
          <button key={n} type="button" role="tab" aria-selected={filter === n} onClick={() => setFilter(n)} className={tabClass(filter === n)}>
            {n} 局
          </button>
        ))}
      </div>

      {visible.map((g) => (
        <section key={g.key} className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <header className="flex items-center justify-between gap-3 bg-stone-100 px-3 py-2">
            <h3 className="font-semibold text-stone-900">
              {g.inning} 局{g.half === 'top' ? '上' : '下'}
              <span className="ml-2 text-sm font-normal text-stone-600">
                {g.side === 'away' ? game.away_team : game.home_team} 進攻
              </span>
            </h3>
            {g.plays.length > 0 && (
              <span className="text-sm tabular-nums text-stone-600">{g.runs} 分・{g.hits} 安打</span>
            )}
          </header>

          {g.plays.length === 0 ? (
            <p className="px-3 py-4 text-sm text-stone-500">這個半局剛開始，等待第一個打席…</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {[...g.plays].reverse().map((play) => (
                <PlayRow key={play.id} play={play} game={game} isLatest={play.id === latestId && !finished} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}