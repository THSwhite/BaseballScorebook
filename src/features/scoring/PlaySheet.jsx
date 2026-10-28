import { useState } from 'react'
import {
  DETAIL_REQUIRED,
  DIRECTION_OPTIONS,
  ERROR_KIND_OPTIONS,
  HAS_BATTED_BALL,
  HEIGHT_OPTIONS,
  HIT_BASE,
  RESULT_MAP,
  SIDE_PLAY_ALLOWED,
  allowsFielding,
  validateDetails,
} from '../../utils/plateAppearance'
import { BASE_NAMES, describeFielding, fieldingNotation, playerLabel, runnerLabel } from '../../utils/formatters'

const MAX_ROUTE = 6 // 守備路線最多幾個守備員

const DEST_LABEL = { 0: '出局', 1: '一壘', 2: '二壘', 3: '三壘', 4: '得分' }

// 跑者從 from 壘出發，可以去哪裡：出局、留在原壘、往前的壘包、得分
const destOptions = (from) => [0, ...Array.from({ length: 5 - from }, (_, i) => from + i)]
const destText = (from, to) => (to === from ? `留在${BASE_NAMES[from]}` : DEST_LABEL[to])

const selectClass =
  'rounded-md border border-stone-300 bg-white px-2 py-1.5 text-stone-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/30'

const chipClass = (active) =>
  `min-h-11 rounded-md px-2 py-2 text-sm font-medium ${
    active ? 'bg-emerald-800 text-white' : 'bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50'
  }`

/**
 * 打席確認畫面：擊球方向與高度、出局的守備路線、失誤來源、附有失誤／野選、跑者去向，一次確認
 * @param {object} initial  { movements, batterTo, direction, height } 預設值
 * @param {(result, movements, batterTo, extras) => object} preview  驗證並試算（不寫入）
 * @param {(details: object) => void} onConfirm
 */
export default function PlaySheet({ result, bases, batter, initial, preview, onConfirm, onCancel }) {
  const [movements, setMovements] = useState(initial.movements)
  const [batterTo, setBatterTo] = useState(initial.batterTo)
  const [direction, setDirection] = useState(initial.direction ?? '')
  const [height, setHeight] = useState(initial.height ?? '')
  const [withError, setWithError] = useState(false)
  const [withFc, setWithFc] = useState(false)
  const [fielding, setFielding] = useState([]) // 守備路線：[6, 3] = 游擊手傳一壘手
  const [fieldingAuto, setFieldingAuto] = useState(false) // 目前的路線只是依擊球方向自動帶入的
  const [errorBy, setErrorBy] = useState('') // 失誤的守備員編號
  const [errorKind, setErrorKind] = useState('') // catch 接球 / throw 傳球 / field 處理

  const hasBall = HAS_BATTED_BALL.has(result)
  const required = DETAIL_REQUIRED.has(result)
  const allowSidePlay = SIDE_PLAY_ALLOWED.has(result)
  // 失誤上壘，或一、二、三壘安打附有失誤時，打者可能因失誤多跑
  const hitBase = HIT_BASE[result]
  const batterAdjustable = result === 'E' || (!!hitBase && hitBase < 4 && withError)
  const batterStart = hitBase ?? 1 // 打者最少會上到這個壘包
  const batterOptions = Array.from({ length: 5 - batterStart }, (_, i) => batterStart + i)
  const showRunners = movements.length > 0 || batterAdjustable

  const evaluation = preview(result, movements, batterTo, { withError, withFc })
  const detailProblem = validateDetails(result, { direction, height })
  const canConfirm = evaluation.ok && !detailProblem
  // 有出局（三振除外）或失誤上壘，才問守備路線；有失誤才問失誤來源
  const showFielding = allowsFielding(result, evaluation.ok ? evaluation.record.outs_added : 0)
  const showError = result === 'E' || withError

  const setDest = (from, to) =>
    setMovements((list) => list.map((m) => (m.from === from ? { ...m, to } : m)))

  function toggleError() {
    const next = !withError
    setWithError(next)
    if (!next) {
      setErrorBy('')
      setErrorKind('')
      if (hitBase) setBatterTo(initial.batterTo) // 取消失誤：打者回到安打的壘包
    }
  }

  function pickDirection(option) {
    const next = direction === option.value ? '' : option.value
    setDirection(next)
    // 路線還沒動過：把第一個守備員帶成球去的方向（飛球、平飛接殺只要這一步就完成了）
    if (fielding.length === 0 || fieldingAuto) {
      setFielding(next ? [option.num] : [])
      setFieldingAuto(true)
    }
  }

  const addFielder = (num) => {
    setFielding((list) => (list.length >= MAX_ROUTE ? list : [...list, num]))
    setFieldingAuto(false)
  }
  const removeLastFielder = () => {
    setFielding((list) => list.slice(0, -1))
    setFieldingAuto(false)
  }
  const clearFielding = () => {
    setFielding([])
    setFieldingAuto(false)
  }

  const rows = [...movements].sort((a, b) => b.from - a.from) // 跑在前面的先列
  const tag = (text, warn) => (
    <span className={`ml-2 text-xs font-normal ${warn ? 'text-red-600' : 'text-stone-400'}`}>{text}</span>
  )

  return (
    <div className="space-y-5 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
      <h3 className="font-semibold text-stone-900">
        {RESULT_MAP[result].label}
        <span className="ml-2 text-sm font-normal text-stone-600">{playerLabel(batter)}</span>
      </h3>

      {hasBall && (
        <>
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-stone-600">
              擊球方向{required ? tag('必選', true) : tag('選填')}
            </legend>
            <div className="grid grid-cols-5 gap-2">
              {DIRECTION_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={direction === o.value}
                  aria-label={o.name}
                  title={o.name}
                  onClick={() => pickDirection(o)}
                  className={chipClass(direction === o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-stone-600">
              擊球高度{required ? tag('必選', true) : tag('選填')}
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {HEIGHT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={height === o.value}
                  onClick={() => setHeight(height === o.value ? '' : o.value)}
                  className={chipClass(height === o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      )}

      {showFielding && (
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-stone-600">
            {result === 'E' ? '失誤的守備路線' : '出局怎麼產生（守備路線）'}
            {tag('選填，依序點選守備員')}
          </legend>
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-white px-3 py-2 ring-1 ring-stone-200">
            {fielding.length === 0 ? (
              <span className="text-sm text-stone-400">尚未選擇</span>
            ) : (
              <>
                <span className="text-lg font-semibold tabular-nums text-stone-900">
                  {fieldingNotation(fielding, height, { error: result === 'E' })}
                </span>
                {result !== 'E' && (
                  <span className="text-sm text-stone-600">{describeFielding(fielding, { height, result })}</span>
                )}
              </>
            )}
            <span className="ml-auto flex gap-3">
              <button
                type="button"
                disabled={fielding.length === 0}
                onClick={removeLastFielder}
                className="text-sm text-emerald-800 hover:underline disabled:text-stone-300 disabled:no-underline"
              >
                退一步
              </button>
              <button
                type="button"
                disabled={fielding.length === 0}
                onClick={clearFielding}
                className="text-sm text-emerald-800 hover:underline disabled:text-stone-300 disabled:no-underline"
              >
                清除
              </button>
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {DIRECTION_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-label={o.name}
                title={o.name}
                disabled={fielding.length >= MAX_ROUTE}
                onClick={() => addFielder(o.num)}
                className={`${chipClass(false)} disabled:opacity-40`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-stone-500">
            例如游擊手傳一壘手：先點「游」再點「一」，記成 6-3。選擊球方向時會先帶入第一位。
          </p>
        </fieldset>
      )}

      {allowSidePlay && (
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-stone-600">附加情況{tag('沒有就不用選')}</legend>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={withError} onClick={toggleError} className={chipClass(withError)}>
              附有失誤
            </button>
            <button type="button" aria-pressed={withFc} onClick={() => setWithFc((v) => !v)} className={chipClass(withFc)}>
              附有野手選擇
            </button>
          </div>
          {(withError || withFc) && showRunners && (
            <p className="mt-1.5 text-xs text-stone-500">請在下方確認打者與跑者的實際去向。</p>
          )}
        </fieldset>
      )}

      {showError && (
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-stone-600">失誤從何而來{tag('選填')}</legend>
          <p className="mb-1.5 text-xs text-stone-500">哪一位守備員失誤</p>
          <div className="grid grid-cols-5 gap-2">
            {DIRECTION_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={errorBy === o.num}
                aria-label={o.name}
                title={o.name}
                onClick={() => setErrorBy(errorBy === o.num ? '' : o.num)}
                className={chipClass(errorBy === o.num)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mb-1.5 mt-3 text-xs text-stone-500">失誤類型</p>
          <div className="grid grid-cols-3 gap-2">
            {ERROR_KIND_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={errorKind === o.value}
                onClick={() => setErrorKind(errorKind === o.value ? '' : o.value)}
                className={chipClass(errorKind === o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {showRunners && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-stone-600">打者與跑者去向</p>
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
                  {batterOptions.map((to) => (
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
        </div>
      )}

      <div className="space-y-1 text-sm">
        {evaluation.ok ? (
          <>
            <p className="text-stone-700">
              本打席：出局 {evaluation.record.outs_added}　得分 {evaluation.record.runs}
            </p>
            {evaluation.ignoredRuns > 0 && (
              <p className="text-amber-700">這是第三個出局，本打席的得分不計。</p>
            )}
          </>
        ) : (
          <p role="alert" className="text-red-700">{evaluation.error}</p>
        )}
        {detailProblem && <p role="alert" className="text-red-700">{detailProblem}</p>}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => onConfirm({ movements, batterTo, direction, height, withError, withFc, fielding, errorBy, errorKind })}
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