import { lineScoreCell } from '../../utils/gameSummary'

/**
 * 比分板：大比分 + 局數比分表（R 得分、H 安打、E 失誤）
 * @param {'scheduled'|'live'|'finished'} status
 */
export default function Scoreboard({ game, state, totals, status }) {
  const cols = Math.max(game.innings ?? 9, state.inning)
  const innings = Array.from({ length: cols }, (_, i) => i + 1)
  const batting = state.half === 'top' ? 'away' : 'home'

  const statusText =
    status === 'finished'
      ? '比賽結束'
      : status === 'live'
        ? `${state.inning} 局${state.half === 'top' ? '上' : '下'}${state.blockSize > 1 ? `・連打 ${state.setNo}/${state.blockSize} 局` : ''}`
        : '未開賽'

  const winner = status === 'finished' ? state.winner : null

  const teamBlock = (side, align) => (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <p className="text-xs text-emerald-200">{side === 'away' ? '客隊・先攻' : '主隊・後攻'}</p>
      <p className="truncate text-lg font-bold sm:text-xl">{side === 'away' ? game.away_team : game.home_team}</p>
      <p className={`text-5xl font-bold tabular-nums sm:text-6xl ${winner && winner !== side ? 'opacity-60' : ''}`}>
        {state.score[side]}
      </p>
    </div>
  )

  return (
    <section aria-label="比分板" className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 bg-emerald-900 px-4 py-5 text-white sm:px-8">
        {teamBlock('away', 'left')}
        <div className="text-center">
          <span
            className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
              status === 'live' ? 'bg-red-600 text-white' : 'bg-white/20 text-white'
            }`}
          >
            {status === 'live' && <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-white" />}
            {statusText}
          </span>
          {status === 'scheduled' && (
            <p className="mt-2 text-xs text-emerald-100">
              {game.game_date}
              {game.game_time ? ` ${game.game_time.slice(0, 5)}` : ''}
            </p>
          )}
        </div>
        {teamBlock('home', 'right')}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-center text-sm tabular-nums">
          <thead>
            <tr className="bg-stone-50 text-xs text-stone-500">
              <th className="px-3 py-2 text-left font-medium">球隊</th>
              {innings.map((i) => (
                <th
                  key={i}
                  className={`w-9 px-1 py-2 font-medium ${status === 'live' && i === state.inning ? 'text-emerald-800' : ''}`}
                >
                  {i}
                </th>
              ))}
              <th className="w-10 border-l border-stone-200 px-1 py-2 font-semibold text-stone-700">R</th>
              <th className="w-10 px-1 py-2 font-semibold text-stone-700">H</th>
              <th className="w-10 px-1 py-2 font-semibold text-stone-700">E</th>
            </tr>
          </thead>
          <tbody>
            {['away', 'home'].map((side) => (
              <tr
                key={side}
                className={`border-t border-stone-100 ${status === 'live' && batting === side ? 'bg-emerald-50' : ''}`}
              >
                <td className="max-w-[9rem] truncate px-3 py-2 text-left font-medium text-stone-900">
                  {side === 'away' ? game.away_team : game.home_team}
                </td>
                {innings.map((i) => (
                  <td key={i} className="px-1 py-2 text-stone-700">{lineScoreCell(state, side, i)}</td>
                ))}
                <td className="border-l border-stone-200 px-1 py-2 font-bold text-stone-900">{state.score[side]}</td>
                <td className="px-1 py-2">{totals[side].h}</td>
                <td className="px-1 py-2">{totals[side].e}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}