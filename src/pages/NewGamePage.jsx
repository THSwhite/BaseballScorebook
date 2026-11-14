import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CreateGameForm from '../features/games/CreateGameForm'
import LineupEditor from '../features/games/LineupEditor'

// 建立比賽 → 設定先攻先發 → 設定後攻先發 → 進入記錄頁
const STEPS = ['比賽資訊', '先攻先發', '後攻先發']

export default function NewGamePage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [game, setGame] = useState(null)
  const [saved, setSaved] = useState({ away: false, home: false })

  function handleCreated(newGame) {
    setGame(newGame)
    setStep(1)
  }

  const side = step === 1 ? 'away' : 'home'
  const isLastStep = step === STEPS.length - 1

  function next() {
    if (isLastStep) navigate(`/game/${game.id}/score`)
    else setStep((s) => s + 1)
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-stone-900">建立比賽</h1>

      <ol className="mb-8 flex items-center gap-3 text-sm" aria-label="建立流程">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            className={`flex items-center gap-2 ${
              i === step ? 'font-semibold text-emerald-800' : i < step ? 'text-stone-700' : 'text-stone-400'
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                i === step
                  ? 'bg-emerald-800 text-white'
                  : i < step
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-stone-200 text-stone-500'
              }`}
            >
              {i < step ? '✓' : i + 1}
            </span>
            {label}
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-stone-300" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      {step === 0 && <CreateGameForm onCreated={handleCreated} />}

      {step > 0 && game && (
        <div className="space-y-6">
          <p className="text-sm text-stone-500">
            {game.away_team} vs {game.home_team}・{game.game_date}
          </p>

          {/* key 讓換邊時重新載入對應球隊的名單 */}
          <LineupEditor
            key={side}
            game={game}
            side={side}
            onSaved={() => setSaved((s) => ({ ...s, [side]: true }))}
          />

          <div className="flex items-center justify-between border-t border-stone-200 pt-4">
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 1}
              className="text-sm text-stone-600 hover:underline disabled:invisible"
            >
              上一步
            </button>

            <div className="flex items-center gap-4">
              {!saved[side] && (
                <button type="button" onClick={next} className="text-sm text-stone-500 hover:underline">
                  稍後再設定
                </button>
              )}
              <button
                type="button"
                onClick={next}
                disabled={!saved[side]}
                className="rounded-md bg-emerald-800 px-5 py-2 font-medium text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isLastStep ? '開始記錄' : '下一步：後攻先發'}
              </button>
            </div>
          </div>

          <p className="text-center text-sm text-stone-500">
            <Link to="/" className="hover:underline">回到比賽列表</Link>
          </p>
        </div>
      )}
    </main>
  )
}