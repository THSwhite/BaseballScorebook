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

/* ---------- 打席 ---------- */
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
        <p className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
          {batterLine(play)}
          {isLatest && <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-white">最新</span>}
          {play.fielding && (
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-stone-600">
              {play.fielding}
              {(play.result === 'E' || play.with_error) && 'E'}
            </span>
          )}
          {play.with_error && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">失誤</span>}
          {play.with_fc && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">野選</span>}
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

/* ---------- 記錄員的備註 ---------- */
function NoteRow({ note }) {
  return (
    <li className="flex gap-3 border-l-4 border-sky-400 bg-sky-50 px-3 py-3">
      <div className="w-[4.75rem] shrink-0 text-center">
        <span className="block rounded bg-sky-600 px-1.5 py-1 text-xs font-semibold text-white">備註</span>
      </div>
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-stone-900">{note.description}</p>
    </li>
  )
}

/* ---------- 更改 1set / 2set ---------- */
function SetRow({ item }) {
  return (
    <li className="bg-stone-50 px-3 py-2 text-center text-xs text-stone-500">{item.description}</li>
  )
}

/**
 * 逐打席文字轉播：依半局分組，最新的在最上面，可以用局數篩選
 * 每組的 items 依時間順序放打席、備註、set 更改（見 gameSummary.buildFeed）
 */
export default function LiveFeed({ game, state, groups, finished }) {
  const [filter, setFilter] = useState('all')

  const currentKey = `${state.inning}-${state.half}-${state.setNo}`
  const last = groups[groups.length - 1]
  const showWaiting = !finished && last && last.key !== currentKey // 剛換邊，這個半局還沒有任何紀錄

  const allGroups = showWaiting
    ? [
        ...groups,
        {
          key: currentKey,
          inning: state.inning,
          half: state.half,
          setNo: state.setNo,
          side: state.half === 'top' ? 'away' : 'home',
          items: [],
          runs: 0,
          hits: 0,
        },
      ]
    : groups

  // 2set：同一隊同一局有兩個半局時，標題要寫第幾個半局
  const multiSet = new Set(allGroups.filter((g) => g.setNo > 1).map((g) => `${g.inning}-${g.half}`))

  const inningList = [...new Set(allGroups.map((g) => g.inning))]
  const visible = allGroups.filter((g) => filter === 'all' || g.inning === filter).reverse()

  // 「最新」標記放在最後一個打席
  let latestId = null
  for (let i = groups.length - 1; i >= 0 && !latestId; i -= 1) {
    const lastPlay = [...groups[i].items].reverse().find((x) => x.kind === 'pa')
    if (lastPlay) latestId = lastPlay.id
  }

  if (allGroups.length === 0) {
    return <p className="rounded-lg border border-stone-200 bg-white py-10 text-center text-stone-500">比賽還沒有任何記錄。</p>
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
              {multiSet.has(`${g.inning}-${g.half}`) && (
                <span className="ml-1 text-sm font-normal text-stone-600">・第 {g.setNo} 個半局</span>
              )}
              <span className="ml-2 text-sm font-normal text-stone-600">
                {g.side === 'away' ? game.away_team : game.home_team} 進攻
              </span>
            </h3>
            {g.items.some((x) => x.kind === 'pa') && (
              <span className="text-sm tabular-nums text-stone-600">{g.runs} 分・{g.hits} 安打</span>
            )}
          </header>

          {g.items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-stone-500">這個半局剛開始，等待第一個打席…</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {[...g.items].reverse().map((item) => {
                if (item.kind === 'note') return <NoteRow key={item.id} note={item} />
                if (item.kind === 'set') return <SetRow key={item.id} item={item} />
                return <PlayRow key={item.id} play={item} game={game} isLatest={item.id === latestId && !finished} />
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}