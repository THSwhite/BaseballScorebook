import { useState } from 'react'
import PlayerPicker from '../teams/PlayerPicker'
import { POSITIONS } from '../games/LineupEditor'
import { SUB_TYPE_OPTIONS } from '../../utils/lineup'
import { POSITION_NAMES, runnerLabel } from '../../utils/formatters'
import '../teams/teams.css'

// PlayerPicker 用到的顏色變數（原本定義在 .tm-page，這裡補上讓它在這個面板也能正常顯示）
const pickerVars = {
  '--tm-accent': '#ba265c',
  '--tm-line': 'rgba(128, 128, 128, 0.3)',
  '--tm-soft': 'rgba(128, 128, 128, 0.1)',
}

const TYPE_HINT = {
  pr: '新球員接替這位跑者，之後的得分算在他身上。',
  ph: '新球員只接這一棒的打擊，守位不變。',
  sub: '新球員接替這一棒，可以同時改守位。',
  swap: '兩棒互換守位，球員不換。',
}

const hasNumber = (n) => n !== null && n !== undefined && n !== ''
const keyOf = (side, order) => `${side}:${order}`

const fieldClass =
  'rounded-md border border-stone-300 bg-white px-2 py-1.5 text-stone-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/30'
const chipClass = (active) =>
  `min-h-10 rounded-md px-1 py-2 text-sm font-medium ${
    active ? 'bg-emerald-800 text-white' : 'bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50'
  }`

/**
 * 更換選手：列出先發打線，勾選要異動的那一棒，選擇代跑、代打、換人或守位交換。
 * 另外可以「臨時插入打者」：新球員插進打線的某一棒，後面的人依序往後移，打線多一人。
 * 兩隊可以一次送出；送出後更新目前的打線。
 * @param lineups  目前的打線 { away: [], home: [] }（已經套用過之前的換人）
 * @param retired  已經被換下場、不能再回場的球員
 * @param {(changes: object[]) => {ok: boolean, error?: string}} onSubmit
 */
export default function SubstitutionPanel({ game, lineups, retired, state, onSubmit, onClose }) {
  const battingSide = state.half === 'top' ? 'away' : 'home'
  const [side, setSide] = useState(battingSide)
  const [checked, setChecked] = useState({}) // 'away:3' → true
  const [drafts, setDrafts] = useState({}) // 'away:3' → { type, name, number, playerId, position, swapWith }
  const [inserts, setInserts] = useState({ away: null, home: null }) // 臨時插入的打者 { order, name, number, playerId, position }
  const [message, setMessage] = useState('')

  const lineup = lineups[side]
  const teamName = (s) => (s === 'away' ? game.away_team : game.home_team)
  const teamId = side === 'away' ? game.away_team_id : game.home_team_id
  const onBase = (s, order) => s === battingSide && state.bases.some((b) => b && b.order === order)
  const atBat = (s, order) => s === battingSide && state.nextBatter[s] === order
  const countOf = (s) => lineups[s].filter((slot) => checked[keyOf(s, slot.order)]).length + (inserts[s] ? 1 : 0)
  const total = countOf('away') + countOf('home')

  const defaultType = (s, slot) => (onBase(s, slot.order) ? 'pr' : atBat(s, slot.order) ? 'ph' : 'sub')

  function toggle(slot) {
    const k = keyOf(side, slot.order)
    const on = !checked[k]
    setChecked((c) => ({ ...c, [k]: on }))
    if (on) {
      setDrafts((d) =>
        d[k] ? d : { ...d, [k]: { type: defaultType(side, slot), name: '', number: '', playerId: null, position: '', swapWith: '' } }
      )
    }
    setMessage('')
  }

  const patch = (k, fields) => setDrafts((d) => ({ ...d, [k]: { ...d[k], ...fields } }))

  // 臨時插入打者：預設加在最後一棒，守位預設指定打擊（沒有守備）
  const insert = inserts[side]
  const openInsert = () =>
    setInserts((i) => ({ ...i, [side]: { order: String(lineup.length + 1), name: '', number: '', playerId: null, position: 'DH' } }))
  const closeInsert = () => setInserts((i) => ({ ...i, [side]: null }))
  const patchInsert = (fields) => setInserts((i) => ({ ...i, [side]: { ...i[side], ...fields } }))

  // 球隊名單裡已經不能選的人：現在在場上的、已經被換下場的、這次已經選了的
  const excludeIds = [
    ...lineup.map((slot) => slot.playerId),
    ...retired[side].map((p) => p.playerId),
    ...lineup.filter((slot) => checked[keyOf(side, slot.order)]).map((slot) => drafts[keyOf(side, slot.order)]?.playerId),
    insert?.playerId,
  ].filter(Boolean)

  function submit() {
    const changes = []
    for (const s of ['away', 'home']) {
      for (const slot of lineups[s]) {
        const k = keyOf(s, slot.order)
        if (!checked[k]) continue
        const d = drafts[k]
        changes.push({
          side: s,
          order: slot.order,
          type: d.type,
          name: d.name,
          number: d.number,
          playerId: d.playerId,
          position: d.position,
          swapWith: d.swapWith,
        })
      }
      const ins = inserts[s]
      if (ins) {
        changes.push({
          side: s,
          order: ins.order,
          type: 'ins',
          name: ins.name,
          number: ins.number,
          playerId: ins.playerId,
          position: ins.position,
        })
      }
    }
    const res = onSubmit(changes)
    if (!res.ok) return setMessage(res.error)
    onClose()
  }

  const tabClass = (active) =>
    `flex-1 rounded-md px-3 py-2 text-sm font-medium ${
      active ? 'bg-emerald-800 text-white' : 'bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50'
    }`

  return (
    <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-stone-900">更換選手</h3>
        <button type="button" onClick={onClose} aria-label="關閉" className="rounded px-2 py-1 text-stone-500 hover:bg-stone-100">✕</button>
      </div>

      <div className="flex gap-2">
        {['away', 'home'].map((s) => (
          <button key={s} type="button" aria-pressed={side === s} onClick={() => { setSide(s); setMessage('') }} className={tabClass(side === s)}>
            {s === 'away' ? '先攻' : '後攻'}：{teamName(s)}
            {s === battingSide && <span className="ml-1 text-xs opacity-80">（進攻中）</span>}
            {countOf(s) > 0 && <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-xs font-bold text-white">{countOf(s)}</span>}
          </button>
        ))}
      </div>

      {lineup.length === 0 ? (
        <p className="rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-600">
          這隊還沒設定先發名單，無法換人。請先回首頁按「先發」設定。
        </p>
      ) : (
        <>
        <ol className="space-y-2">
          {lineup.map((slot) => {
            const k = keyOf(side, slot.order)
            const on = !!checked[k]
            const d = drafts[k]
            const isOnBase = onBase(side, slot.order)
            return (
              <li key={k} className={`rounded-lg border ${on ? 'border-emerald-300 bg-white' : 'border-stone-200 bg-white'}`}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-5 text-right font-semibold tabular-nums text-stone-500">{slot.order}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-stone-900">
                      {hasNumber(slot.number) && <span className="mr-1.5 tabular-nums text-stone-500">#{slot.number}</span>}
                      {slot.name || (hasNumber(slot.number) ? '' : '（未填姓名）')}
                      <span className="ml-2 text-xs text-stone-500">{POSITION_NAMES[slot.position] ?? slot.position ?? ''}</span>
                    </p>
                    {(isOnBase || atBat(side, slot.order)) && (
                      <p className="mt-0.5 flex gap-1.5 text-xs">
                        {isOnBase && <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">壘上</span>}
                        {atBat(side, slot.order) && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">打擊中</span>}
                      </p>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(slot)}
                    aria-label={`異動第 ${slot.order} 棒`}
                    className="h-5 w-5 shrink-0 accent-emerald-800"
                  />
                </div>

                {on && d && (
                  <div className="space-y-3 border-t border-emerald-100 px-3 py-3">
                    <div role="group" aria-label="異動類型" className="grid grid-cols-4 gap-2">
                      {SUB_TYPE_OPTIONS.map((o) => {
                        const blocked = (o.value === 'pr' && !isOnBase) || (o.value === 'ph' && isOnBase)
                        return (
                          <button
                            key={o.value}
                            type="button"
                            aria-pressed={d.type === o.value}
                            disabled={blocked}
                            title={blocked ? (o.value === 'pr' ? '這位球員目前不在壘上' : '這位球員目前在壘上，請用代跑') : undefined}
                            onClick={() => patch(k, { type: o.value })}
                            className={`${chipClass(d.type === o.value)} disabled:cursor-not-allowed disabled:opacity-35`}
                          >
                            {o.label}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-stone-500">{TYPE_HINT[d.type]}</p>

                    {d.type === 'swap' ? (
                      <label className="flex items-center gap-2 text-sm text-stone-700">
                        和誰交換
                        <select
                          value={d.swapWith}
                          onChange={(e) => patch(k, { swapWith: e.target.value })}
                          className={`${fieldClass} min-w-0 flex-1`}
                        >
                          <option value="">請選擇</option>
                          {lineup
                            .filter((o) => o.order !== slot.order && !checked[keyOf(side, o.order)])
                            .map((o) => (
                              <option key={o.order} value={o.order}>
                                {o.order}. {runnerLabel(o)}（{POSITION_NAMES[o.position] ?? '未定'}）
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="999"
                            inputMode="numeric"
                            aria-label="新球員背號"
                            placeholder="背號"
                            value={d.number}
                            onChange={(e) => patch(k, { number: e.target.value, playerId: null })}
                            className={`${fieldClass} w-24`}
                          />
                          <input
                            type="text"
                            aria-label="新球員姓名"
                            placeholder="姓名（選填）"
                            value={d.name}
                            onChange={(e) => patch(k, { name: e.target.value, playerId: null })}
                            className={`${fieldClass} min-w-0 flex-1`}
                          />
                          {d.playerId && (
                            <span title="已連結球隊名單" aria-label="已連結球隊名單" className="text-emerald-800">✓</span>
                          )}
                        </div>

                        {d.type === 'sub' && (
                          <label className="flex items-center gap-2 text-sm text-stone-700">
                            守位
                            <select
                              value={d.position}
                              onChange={(e) => patch(k, { position: e.target.value })}
                              className={`${fieldClass} min-w-0 flex-1`}
                            >
                              <option value="">沿用原守位</option>
                              {POSITIONS.map((p) => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                              ))}
                            </select>
                          </label>
                        )}

                        {teamId && (
                          <details className="rounded-md border border-stone-200 p-2">
                            <summary className="cursor-pointer text-sm text-stone-700">從球隊名單選擇</summary>
                            <div className="mt-2" style={pickerVars}>
                              <PlayerPicker
                                teamId={teamId}
                                excludeIds={excludeIds}
                                onPick={(p) => patch(k, { playerId: p.id, name: p.name, number: p.jersey_number ?? '' })}
                              />
                            </div>
                          </details>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>

        {insert ? (
          <div className="space-y-3 rounded-lg border border-violet-300 bg-white p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-900">臨時插入打者</p>
              <button type="button" onClick={closeInsert} className="text-sm text-stone-500 hover:underline">取消插入</button>
            </div>

            <label className="flex items-center gap-2 text-sm text-stone-700">
              插入位置
              <select
                value={insert.order}
                onChange={(e) => patchInsert({ order: e.target.value })}
                className={`${fieldClass} min-w-0 flex-1`}
              >
                {Array.from({ length: lineup.length + 1 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n > lineup.length ? `最後一棒（第 ${n} 棒）` : `第 ${n} 棒（原第 ${n} 棒起往後移）`}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-stone-500">
              {Number(insert.order) === state.nextBatter[side]
                ? '這是這隊下一位要打的位置，新打者會是下一位上場的打者。'
                : `不影響這隊現在輪到誰打；輪到第 ${insert.order} 棒時，新打者才會上場。`}
            </p>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="999"
                inputMode="numeric"
                aria-label="插入打者背號"
                placeholder="背號"
                value={insert.number}
                onChange={(e) => patchInsert({ number: e.target.value, playerId: null })}
                className={`${fieldClass} w-24`}
              />
              <input
                type="text"
                aria-label="插入打者姓名"
                placeholder="姓名（選填）"
                value={insert.name}
                onChange={(e) => patchInsert({ name: e.target.value, playerId: null })}
                className={`${fieldClass} min-w-0 flex-1`}
              />
              {insert.playerId && (
                <span title="已連結球隊名單" aria-label="已連結球隊名單" className="text-emerald-800">✓</span>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-stone-700">
              守位
              <select
                value={insert.position}
                onChange={(e) => patchInsert({ position: e.target.value })}
                className={`${fieldClass} min-w-0 flex-1`}
              >
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </label>

            {teamId && (
              <details className="rounded-md border border-stone-200 p-2">
                <summary className="cursor-pointer text-sm text-stone-700">從球隊名單選擇</summary>
                <div className="mt-2" style={pickerVars}>
                  <PlayerPicker
                    teamId={teamId}
                    excludeIds={excludeIds}
                    onPick={(p) =>
                      patchInsert({
                        playerId: p.id,
                        name: p.name,
                        number: p.jersey_number ?? '',
                        position: p.primary_position && POSITIONS.some((o) => o.value === p.primary_position) ? p.primary_position : insert.position,
                      })
                    }
                  />
                </div>
              </details>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={openInsert}
            className="w-full rounded-md border border-dashed border-violet-400 bg-white px-4 py-2.5 text-sm font-medium text-violet-700 hover:bg-violet-50"
          >
            ＋ 臨時插入打者
          </button>
        )}
        </>
      )}

      {message && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={total === 0}
          className="flex-1 rounded-md bg-emerald-800 px-4 py-2.5 font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
        >
          送出異動{total > 0 ? `（${total}）` : ''}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-stone-700 hover:bg-stone-50"
        >
          取消
        </button>
      </div>
    </div>
  )
}