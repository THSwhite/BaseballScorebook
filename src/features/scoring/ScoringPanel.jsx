import { useState } from 'react'
import { Link } from 'react-router-dom'
import BaseDiamond from './BaseDiamond'
import ResultButtons from './ResultButtons'
import RunnerAdjust from './RunnerAdjust'
import { useScoringGame } from './UseScoringGame'
import {
  HIT_DIRECTION_OPTIONS,
  HIT_RESULTS,
  HIT_TYPE_OPTIONS,
  defaultOutcome,
} from '../../utils/plateAppearance'

// 這些結果就算有跑者，也直接記錄（跑者去向固定）；其他結果會先讓記錄員確認跑者
const SKIP_CONFIRM = new Set(['HR', '3B', 'BB', 'HBP', 'K', 'PO'])

const hasNumber = (n) => n !== null && n !== undefined && n !== ''

/* ---------- 局數比分表 ---------- */
function LineScore({ game, state, events }) {
  const cols = Math.max(game.innings ?? 9, state.inning)
  const innings = Array.from({ length: cols }, (_, i) => i + 1)

  function cell(side, i) {
    const value = state.lineScore[side][i - 1]
    if (i < state.inning) return value ?? 0
    if (i > state.inning) return ''
    if (side === 'away' || state.half === 'bottom') return value ?? 0
    return state.over ? 'X' : '' // 後攻還沒打：比賽已結束就是 X
  }
  const hits = (side) =>
    events.filter((e) => HIT_RESULTS.has(e.result) && e.half === (side === 'away' ? 'top' : 'bottom')).length

  const batting = state.half === 'top' ? 'away' : 'home'

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="w-full min-w-max text-center text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-stone-500">
            <th className="px-3 py-1.5 text-left font-medium" />
            {innings.map((i) => (
              <th
                key={i}
                className={`px-2 py-1.5 font-medium ${i === state.inning && !state.over ? 'text-emerald-800' : ''}`}
              >
                {i}
              </th>
            ))}
            <th className="px-2 py-1.5 font-semibold text-stone-700">R</th>
            <th className="px-2 py-1.5 font-semibold text-stone-700">H</th>
          </tr>
        </thead>
        <tbody>
          {['away', 'home'].map((side) => (
            <tr
              key={side}
              className={`border-t border-stone-100 ${!state.over && batting === side ? 'bg-emerald-50' : ''}`}
            >
              <td className="max-w-[9rem] truncate px-3 py-1.5 text-left font-medium text-stone-900">
                {side === 'away' ? game.away_team : game.home_team}
              </td>
              {innings.map((i) => (
                <td key={i} className="px-2 py-1.5">{cell(side, i)}</td>
              ))}
              <td className="px-2 py-1.5 font-bold text-stone-900">{state.score[side]}</td>
              <td className="px-2 py-1.5 text-stone-700">{hits(side)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- 同步狀態 ---------- */
function SyncStatus({ sync }) {
  const { online, pending, failed } = sync
  let text = '已同步'
  let style = 'bg-emerald-100 text-emerald-800'
  if (!online) {
    text = pending > 0 ? `離線中，${pending} 筆已暫存在這台裝置` : '離線中'
    style = 'bg-amber-100 text-amber-800'
  } else if (pending > 0) {
    text = `同步中（${pending} 筆待送出）`
    style = 'bg-amber-100 text-amber-800'
  }
  return (
    <div className="space-y-2">
      <span role="status" className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${style}`}>
        {text}
      </span>
      {failed.length > 0 && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          有 {failed.length} 筆資料同步失敗：{failed[failed.length - 1].message}
          <button type="button" onClick={sync.clearFailed} className="ml-2 underline">知道了</button>
        </p>
      )}
    </div>
  )
}

/* ---------- 選填的擊球資料用的選項鈕 ---------- */
function Chips({ label, options, value, onChange }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-stone-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? '' : o.value)} // 再點一次取消
              className={`rounded-full px-3 py-1.5 text-sm ${
                active ? 'bg-emerald-800 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- 記錄面板 ---------- */
export default function ScoringPanel({ game }) {
  const g = useScoringGame(game)
  const [adjusting, setAdjusting] = useState(null) // { result, movements, batterTo }
  const [alwaysConfirm, setAlwaysConfirm] = useState(false)
  const [hitType, setHitType] = useState('')
  const [hitDirection, setHitDirection] = useState('')
  const [message, setMessage] = useState('')

  if (g.loading) return <p className="py-10 text-center text-stone-500">載入記錄中…</p>
  if (g.error) return <p role="alert" className="py-10 text-center text-red-700">{g.error}</p>

  const { state, currentBatter: batter, events } = g
  const hasRunners = state.bases.some(Boolean)
  const side = state.half === 'top' ? 'away' : 'home'
  const battingTeam = side === 'away' ? game.away_team : game.home_team
  const lastEvent = events[events.length - 1]

  function commit(result, movements, batterTo) {
    const res = g.record({
      result,
      movements,
      batterTo,
      hitType: hitType || null,
      hitDirection: hitDirection || null,
    })
    if (!res.ok) return setMessage(res.error)
    setAdjusting(null)
    setHitType('')
    setHitDirection('')
    setMessage('')
  }

  function handlePick(result) {
    setMessage('')
    const outcome = defaultOutcome(result, state.bases)
    const needConfirm = hasRunners && (alwaysConfirm || !SKIP_CONFIRM.has(result))
    if (needConfirm) setAdjusting({ result, ...outcome })
    else commit(result, outcome.movements, outcome.batterTo)
  }

  function handleFinish() {
    if (window.confirm('確定要結束這場比賽嗎？比賽狀態會變成「已結束」。')) g.finishGame()
  }

  const winnerText = state.winner
    ? `${state.winner === 'home' ? game.home_team : game.away_team} 獲勝`
    : '比賽結束'

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">
            {game.away_team} vs {game.home_team}
          </h1>
          <p className="text-sm text-stone-500">
            {game.game_date}
            {game.location ? `　${game.location}` : ''}
            {'　'}
            <Link to={`/game/${game.id}`} className="text-emerald-800 hover:underline">查看轉播頁</Link>
          </p>
        </div>
        <SyncStatus sync={g.sync} />
      </header>

      <LineScore game={game} state={state} events={events} />

      {g.finished && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-stone-800 px-4 py-3 text-white">
          <span>
            {winnerText}　{game.away_team} {state.score.away} : {state.score.home} {game.home_team}
          </span>
          {g.manualFinished && !state.over && (
            <button type="button" onClick={g.reopenGame} className="rounded-md bg-white/15 px-3 py-1 text-sm hover:bg-white/25">
              重新開啟
            </button>
          )}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[minmax(0,280px)_1fr]">
        {/* 左：局面 */}
        <section className="space-y-3">
          <p className="text-sm font-medium text-stone-700">
            {state.inning} 局{state.half === 'top' ? '上' : '下'}・{battingTeam} 進攻
          </p>
          <BaseDiamond bases={state.bases} outs={state.outs} />

          {!g.finished && (
            <div className="rounded-lg border border-stone-200 bg-white p-3">
              <p className="text-xs text-stone-500">{battingTeam}・第 {batter.order} 棒</p>
              <p className="text-lg font-semibold text-stone-900">
                {hasNumber(batter.number) && (
                  <span className="mr-2 tabular-nums text-stone-500">#{batter.number}</span>
                )}
                {batter.name || (hasNumber(batter.number) ? '' : '（未填姓名）')}
              </p>
              {g.lineups[side].length === 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  這隊還沒設定先發名單，先以打序顯示。可回首頁按「先發」設定。
                </p>
              )}
            </div>
          )}
        </section>

        {/* 右：記錄 */}
        <section className="space-y-4">
          {adjusting ? (
            <RunnerAdjust
              key={`${state.inning}-${state.half}-${events.length}-${adjusting.result}`}
              result={adjusting.result}
              bases={state.bases}
              batter={batter}
              initial={adjusting}
              preview={g.evaluate}
              onConfirm={(movements, batterTo) => commit(adjusting.result, movements, batterTo)}
              onCancel={() => setAdjusting(null)}
            />
          ) : (
            <>
              <ResultButtons state={state} disabled={g.finished} onPick={handlePick} />

              <details className="rounded-md border border-stone-200 bg-white p-3">
                <summary className="cursor-pointer text-sm font-medium text-stone-700">
                  擊球資料（選填）
                  {(hitType || hitDirection) && <span className="ml-2 text-emerald-800">已選</span>}
                </summary>
                <div className="mt-3 space-y-3">
                  <Chips label="擊球類型" options={HIT_TYPE_OPTIONS} value={hitType} onChange={setHitType} />
                  <Chips label="擊球方向" options={HIT_DIRECTION_OPTIONS} value={hitDirection} onChange={setHitDirection} />
                  <p className="text-xs text-stone-500">選好之後，記錄下一個打席時一併存入，記完會自動清除。</p>
                </div>
              </details>

              <label className="flex items-center gap-2 text-sm text-stone-600">
                <input
                  type="checkbox"
                  checked={alwaysConfirm}
                  onChange={(e) => setAlwaysConfirm(e.target.checked)}
                  className="h-4 w-4 accent-emerald-800"
                />
                有跑者時，每次都先確認跑者去向
              </label>
            </>
          )}

          {message && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
          )}
        </section>
      </div>

      {/* 復原與結束 */}
      <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4">
        <button
          type="button"
          onClick={() => {
            setAdjusting(null)
            g.undo()
          }}
          disabled={!lastEvent}
          className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-40"
        >
          復原上一筆
        </button>
        {!g.finished && (
          <button
            type="button"
            onClick={handleFinish}
            disabled={events.length === 0}
            className="rounded-md px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40"
          >
            結束比賽
          </button>
        )}
      </div>

      {/* 最近的記錄 */}
      {events.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-stone-700">最近記錄</h2>
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white text-sm">
            {[...events].reverse().slice(0, 6).map((e) => (
              <li key={e.id} className="flex gap-3 px-3 py-2">
                <span className="w-10 shrink-0 text-stone-500">
                  {e.inning}{e.half === 'top' ? '上' : '下'}
                </span>
                <span className="text-stone-800">{e.description}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}