import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import BaseDiamond from './BaseDiamond'
import ResultButtons from './ResultButtons'
import PlaySheet from './PlaySheet'
import SubstitutionPanel from './SubstitutionPanel'
import HistoryPanel from './HistoryPanel'
import { useScoringGame } from './useScoringGame'
import { HAS_BATTED_BALL, defaultHeight, defaultOutcome } from '../../utils/plateAppearance'
import { hasNumber } from '../../utils/formatters'
import { lineScoreCell, lineScoreColumns, teamTotals, winnerOf } from '../../utils/gameSummary'

// 沒有擊球的結果（三振、保送、觸身球）：就算有跑者也直接記錄，跑者去向固定。
// 有擊球的結果一律先開確認畫面（要選方向、高度，跑者去向也在同一個畫面）
const SKIP_CONFIRM = new Set(['BB', 'HBP', 'K'])

/* ---------- 局數比分表 ---------- */
function LineScore({ game, state, events, finished }) {
  const innings = lineScoreColumns(state)
  const totals = teamTotals(events)

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
                className={`px-2 py-1.5 font-medium ${i === state.inning && !finished ? 'text-emerald-800' : ''}`}
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
              className={`border-t border-stone-100 ${!finished && batting === side ? 'bg-emerald-50' : ''}`}
            >
              <td className="max-w-[9rem] truncate px-3 py-1.5 text-left font-medium text-stone-900">
                {side === 'away' ? game.away_team : game.home_team}
              </td>
              {innings.map((i) => (
                <td key={i} className="px-2 py-1.5">{lineScoreCell(state, side, i, finished)}</td>
              ))}
              <td className="px-2 py-1.5 font-bold text-stone-900">{state.score[side]}</td>
              <td className="px-2 py-1.5 text-stone-700">{totals[side].h}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- 同步狀態 ---------- */
// 常見的資料庫錯誤代碼，翻成看得懂的提示
const SYNC_HINT = {
  '42501': '沒有寫入權限：請確認 Supabase 的 plate_appearances 有允許記錄員 update 與 delete 的 RLS 規則',
  '23505': '序號或資料重複：請確認 plate_appearances 的 (game_id, seq) 唯一限制',
  '23503': '關聯的資料不存在（例如球員或比賽已被刪除）',
  '23502': '有必填欄位沒有值',
  PGRST204: '資料表缺少某個欄位（schema 與程式不一致）',
}

function SyncStatus({ sync }) {
  const { online, pending, failed } = sync
  const last = failed[failed.length - 1]
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
        <div role="alert" className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>
            有 {failed.length} 筆資料同步失敗
            {last.op?.type === 'history' ? '（修改歷史）' : ''}：{last.message}
            {last.code ? `（${last.code}）` : ''}
          </p>
          {SYNC_HINT[last.code] && <p className="text-xs">{SYNC_HINT[last.code]}</p>}
          <p className="flex gap-3">
            <button type="button" onClick={sync.retryFailed} className="font-medium underline">重試</button>
            <button type="button" onClick={sync.clearFailed} className="underline">知道了</button>
          </p>
        </div>
      )}
    </div>
  )
}

/* ---------- 每隊一次連打幾局：1set / 2set ---------- */
function SetControl({ state, battingTeam, atBoundary, onChange }) {
  const option = (size, title, hint) => {
    const active = state.setSize === size
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => !active && onChange(size)}
        className={`flex-1 rounded-md px-3 py-2 text-left ${
          active ? 'bg-emerald-800 text-white' : 'bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50'
        }`}
      >
        <span className="block text-sm font-semibold">{title}</span>
        <span className={`block text-xs ${active ? 'text-emerald-100' : 'text-stone-500'}`}>{hint}</span>
      </button>
    )
  }

  return (
    <section
      aria-label="每隊一次連打幾局"
      className={`space-y-2 rounded-lg border p-3 ${atBoundary ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-white'}`}
    >
      <p className="text-sm font-medium text-stone-800">
        {atBoundary ? `新的一輪開始：${battingTeam} 進攻，要調整一次連打幾局嗎？` : '每隊一次連打幾局'}
      </p>
      <div className="flex gap-2">
        {option(1, '1set', '輪流打')}
        {option(2, '2set', '一次打兩局')}
      </div>
      {(state.setSize > 1 || state.blockSize > 1) && (
        <p className="text-xs text-stone-500">
          目前是 {battingTeam} 連打的第 {state.setNo} / {state.blockSize} 局。更改設定會從下一輪開始生效，剛好在新一輪開始時則立刻生效。
        </p>
      )}
    </section>
  )
}

/* ---------- 備註：送出後會顯示在轉播的時間軸裡 ---------- */
function NoteBox({ onSend }) {
  const [text, setText] = useState('')

  function submit(e) {
    e.preventDefault()
    const clean = text.trim()
    if (!clean) return
    onSend(clean)
    setText('')
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-stone-200 bg-white p-3">
      <label htmlFor="game-note" className="text-sm font-medium text-stone-800">
        備註<span className="ml-2 text-xs font-normal text-stone-500">送出後會顯示在轉播裡</span>
      </label>
      <div className="flex gap-2">
        <input
          id="game-note"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder="例如：投手換人、暫停、場地狀況…"
          className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/30"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-40"
        >
          發送
        </button>
      </div>
    </form>
  )
}

/* ---------- 記錄面板 ---------- */
export default function ScoringPanel({ game }) {
  const g = useScoringGame(game)
  const [adjusting, setAdjusting] = useState(null) // { result, movements, batterTo }
  const [subOpen, setSubOpen] = useState(false) // 更換選手面板
  const [historyOpen, setHistoryOpen] = useState(false) // 修改歷史面板
  const historyDirty = useRef(false) // 修改歷史裡有尚未送出的草稿
  const [alwaysConfirm, setAlwaysConfirm] = useState(false)
  const [message, setMessage] = useState('')

  if (g.loading) return <p className="py-10 text-center text-stone-500">載入記錄中…</p>
  if (g.error) return <p role="alert" className="py-10 text-center text-red-700">{g.error}</p>

  const { state, currentBatter: batter, events } = g
  const hasRunners = state.bases.some(Boolean)
  const side = state.half === 'top' ? 'away' : 'home'
  const battingTeam = side === 'away' ? game.away_team : game.home_team
  const lastEvent = events[events.length - 1]
  // 新的一輪剛開始（上半、這一輪第一局、還沒有打席）：提醒可以調整 1set / 2set
  const atBoundary =
    !g.finished && g.paCount > 0 && state.halfPlays === 0 && state.half === 'top' && state.setNo === 1

  // details：{ movements, batterTo, direction, height, withError, withFc }
  function commit(result, details) {
    const res = g.record({ result, ...details })
    if (!res.ok) return setMessage(res.error)
    setAdjusting(null)
    setMessage('')
  }

  function handlePick(result) {
    setMessage('')
    const outcome = defaultOutcome(result, state.bases)
    const needSheet =
      HAS_BATTED_BALL.has(result) || (hasRunners && (alwaysConfirm || !SKIP_CONFIRM.has(result)))
    if (needSheet) setAdjusting({ result, ...outcome, direction: '', height: defaultHeight(result) })
    else commit(result, { movements: outcome.movements, batterTo: outcome.batterTo })
  }

  function handleFinish() {
    if (window.confirm('確定要結束這場比賽嗎？比賽狀態會變成「已結束」。')) g.finishGame()
  }

  // 離開修改歷史前，如果有尚未送出的草稿，先問一下
  function confirmLeaveHistory() {
    if (!historyOpen || !historyDirty.current) return true
    return window.confirm('修改歷史裡有尚未送出的修改，確定要放棄嗎？')
  }

  const winner = winnerOf(state.score)
  const winnerText = winner
    ? `${winner === 'home' ? game.home_team : game.away_team} 獲勝`
    : '比賽結束（平手）'

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

      <LineScore game={game} state={state} events={events} finished={g.finished} />

      {g.finished && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-stone-800 px-4 py-3 text-white">
          <span>
            {winnerText}　{game.away_team} {state.score.away} : {state.score.home} {game.home_team}
          </span>
          <button type="button" onClick={g.reopenGame} className="rounded-md bg-white/15 px-3 py-1 text-sm hover:bg-white/25">
            重新開啟
          </button>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[minmax(0,280px)_1fr]">
        {/* 左：局面 */}
        <section className="space-y-3">
          <p className="text-sm font-medium text-stone-700">
            {state.inning} 局{state.half === 'top' ? '上' : '下'}・{battingTeam} 進攻
            {state.blockSize > 1 && `（連打第 ${state.setNo} / ${state.blockSize} 局）`}
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

          {!g.finished && (
            <button
              type="button"
              aria-pressed={subOpen}
              onClick={() => {
                if (!confirmLeaveHistory()) return
                setAdjusting(null)
                setHistoryOpen(false)
                setSubOpen((v) => !v)
              }}
              className={`w-full rounded-md px-4 py-2.5 text-sm font-medium ${
                subOpen ? 'bg-emerald-800 text-white' : 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50'
              }`}
            >
              更換選手
            </button>
          )}

          {/* 比賽結束後也可以修改歷史 */}
          <button
            type="button"
            aria-pressed={historyOpen}
            onClick={() => {
              if (!confirmLeaveHistory()) return
              setAdjusting(null)
              setSubOpen(false)
              setHistoryOpen((v) => !v)
            }}
            className={`w-full rounded-md px-4 py-2.5 text-sm font-medium ${
              historyOpen ? 'bg-emerald-800 text-white' : 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50'
            }`}
          >
            修改歷史
          </button>

          {!g.finished && !historyOpen && (
            <SetControl state={state} battingTeam={battingTeam} atBoundary={atBoundary} onChange={g.changeSetSize} />
          )}
        </section>

        {/* 右：記錄 */}
        <section className="space-y-4">
          {historyOpen ? (
            <HistoryPanel
              game={game}
              events={events}
              state={state}
              startLineups={g.startLineups}
              ctx={g.ctx}
              dirtyRef={historyDirty}
              onApply={(rows) => {
                g.applyHistory(rows)
                setHistoryOpen(false)
              }}
              onClose={() => setHistoryOpen(false)}
            />
          ) : subOpen ? (
            <SubstitutionPanel
              game={game}
              lineups={g.lineups}
              retired={g.retired}
              state={state}
              onSubmit={g.substitute}
              onClose={() => setSubOpen(false)}
            />
          ) : adjusting ? (
            <PlaySheet
              key={`${state.inning}-${state.half}-${events.length}-${adjusting.result}`}
              result={adjusting.result}
              bases={state.bases}
              batter={batter}
              initial={adjusting}
              preview={g.evaluate}
              onConfirm={(details) => commit(adjusting.result, details)}
              onCancel={() => setAdjusting(null)}
            />
          ) : (
            <>
              <ResultButtons state={state} disabled={g.finished} onPick={handlePick} />

              <label className="flex items-center gap-2 text-sm text-stone-600">
                <input
                  type="checkbox"
                  checked={alwaysConfirm}
                  onChange={(e) => setAlwaysConfirm(e.target.checked)}
                  className="h-4 w-4 accent-emerald-800"
                />
                有跑者時，三振、保送也先確認跑者去向
              </label>
            </>
          )}

          {message && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
          )}

          {!historyOpen && <NoteBox onSend={g.addNote} />}
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
          disabled={!lastEvent || historyOpen}
          className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-40"
        >
          復原上一筆
        </button>
        {!g.finished && (
          <button
            type="button"
            onClick={handleFinish}
            disabled={g.paCount === 0}
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
                <span className="min-w-0 break-words text-stone-800">
                  {e.kind === 'note' && (
                    <span className="mr-2 rounded bg-sky-600 px-1.5 py-0.5 text-xs font-semibold text-white">備註</span>
                  )}
                  {e.kind === 'set' && (
                    <span className="mr-2 rounded bg-stone-700 px-1.5 py-0.5 text-xs font-semibold text-white">設定</span>
                  )}
                  {e.kind === 'sub' && (
                    <span className="mr-2 rounded bg-violet-600 px-1.5 py-0.5 text-xs font-semibold text-white">換人</span>
                  )}
                  {e.description}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}