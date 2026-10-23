import { useState } from 'react'
import { RESULT_MAP } from '../../utils/plateAppearance'
import { BASE_NAMES, playerLabel, runnerLabel } from '../../utils/formatters'

const DEST_LABEL = { 0: '出局', 1: '一壘', 2: '二壘', 3: '三壘', 4: '得分' }

// 跑者從 from 壘出發，可以去哪裡：出局、留在原壘、往前的壘包、得分
const destOptions = (from) => [0, ...Array.from({ length: 5 - from }, (_, i) => from + i)]
const destText = (from, to) => (to === from ? `留在${BASE_NAMES[from]}` : DEST_LABEL[to])

const selectClass =
  'rounded-md border border-stone-300 bg-white px-2 py-1.5 text-stone-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/30'

/**
 * 確認跑者推進：預設值已經依規則填好，沒問題就直接按「確認記錄」
 * @param {object} initial  { movements, batterTo } 預設去向
 * @param {(result, movements, batterTo) => object} preview  驗證並試算（不寫入）
 */
export default function RunnerAdjust({ result, bases, batter, initial, preview, onConfirm, onCancel }) {
  const [movements, setMovements] = useState(initial.movements)
  const [batterTo, setBatterTo] = useState(initial.batterTo)
  const batterAdjustable = result === 'E' // 失誤時打者可能多跑
  const evaluation = preview(result, movements, batterTo)

  const setDest = (from, to) =>
    setMovements((list) => list.map((m) => (m.from === from ? { ...m, to } : m)))

  const rows = [...movements].sort((a, b) => b.from - a.from) // 跑在前面的先列

  return (
    <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
      <h3 className="font-semibold text-stone-900">
        {RESULT_MAP[result].label}・確認跑者
      </h3>

      <ul className="space-y-2">
        {rows.map((m) => (
          <li key={m.from} className="flex items-center justify-between gap-3">
            <span className="text-sm text-stone-700">
              {BASE_NAMES[m.from]}跑者 <b className="text-stone-900">{runnerLabel(bases[m.from - 1])}</b>
            </span>
            <select
              aria-label={`${BASE_NAMES[m.from]}跑者去向`}
              value={m.to}
              onChange={(e) => setDest(m.from, Number(e.target.value))}
              className={selectClass}
            >
              {destOptions(m.from).map((to) => (
                <option key={to} value={to}>
                  {destText(m.from, to)}
                </option>
              ))}
            </select>
          </li>
        ))}

        <li className="flex items-center justify-between gap-3 border-t border-stone-200 pt-2">
          <span className="text-sm text-stone-700">
            打者 <b className="text-stone-900">{playerLabel(batter)}</b>
          </span>
          {batterAdjustable ? (
            <select
              aria-label="打者去向"
              value={batterTo}
              onChange={(e) => setBatterTo(Number(e.target.value))}
              className={selectClass}
            >
              {[1, 2, 3, 4].map((to) => (
                <option key={to} value={to}>
                  {DEST_LABEL[to]}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-stone-600">{DEST_LABEL[batterTo]}</span>
          )}
        </li>
      </ul>

      {evaluation.ok ? (
        <div className="space-y-1 text-sm">
          <p className="text-stone-700">
            本打席：出局 {evaluation.record.outs_added}　得分 {evaluation.record.runs}
          </p>
          {evaluation.ignoredRuns > 0 && (
            <p className="text-amber-700">這是第三個出局，本打席的得分不計。</p>
          )}
        </div>
      ) : (
        <p role="alert" className="text-sm text-red-700">{evaluation.error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!evaluation.ok}
          onClick={() => onConfirm(movements, batterTo)}
          className="flex-1 rounded-md bg-emerald-800 px-4 py-2.5 font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
        >
          確認記錄
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-stone-700 hover:bg-stone-50"
        >
          取消
        </button>
      </div>
    </div>
  )
}