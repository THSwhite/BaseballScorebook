import { useMemo, useState } from 'react'
import ResultButtons from './ResultButtons'
import PlaySheet from './PlaySheet'
import { newId } from './offlineQueue'
import { RESULT_MAP, defaultHeight, defaultOutcome, evaluatePlateAppearance } from '../../utils/plateAppearance'
import { parseFielding } from '../../utils/formatters'
import { insertBefore, newPaRow, paPatch, rebuildTimeline, removeRow, stateBefore, updateRow } from '../../utils/history'

const KIND_TAG = {
  note: ['備註', 'bg-sky-600'],
  set: ['設定', 'bg-stone-700'],
  sub: ['換人', 'bg-violet-600'],
}

const smallBtn =
  'rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50'

const halfText = (half) => (half === 'top' ? '上' : '下')

/* ---------- 修改或插入一個打席：先選結果，再用確認畫面填細節 ---------- */
function PaEditor({ mode, row, before, ctx, title, onSubmit, onCancel }) {
  const [result, setResult] = useState(mode === 'edit' ? row.result : '')
  const [changing, setChanging] = useState(mode === 'insert')
  const { state, batter } = before

  const preview = (res, movements, batterTo, extras) =>
    evaluatePlateAppearance(state, { result: res, batter, movements, batterTo, ...extras }, ctx)

  const situation = `${state.inning} 局${halfText(state.half)}・${state.outs} 出局`

  if (!result || changing) {
    return (
      <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
        <div>
          <h3 className="font-semibold text-stone-900">{title}：選擇結果</h3>
          <p className="text-xs text-stone-500">這個位置的局面：{situation}</p>
        </div>
        <ResultButtons state={state} onPick={(code) => { setResult(code); setChanging(false) }} />
        <button
          type="button"
          onClick={() => (result ? setChanging(false) : onCancel())}
          className="text-sm text-stone-600 hover:underline"
        >
          {result ? '返回' : '取消'}
        </button>
      </div>
    )
  }

  // 修改且結果沒換：帶入原本的資料；其他情況用預設值
  const occupied = [1, 2, 3].filter((b) => state.bases[b - 1])
  const rowMovements = (row?.runners ?? []).map((r) => ({ from: r.from, to: r.to }))
  const sameRunners =
    mode === 'edit' &&
    result === row.result &&
    rowMovements.length === occupied.length &&
    rowMovements.every((m) => occupied.includes(m.from))

  const outcome = defaultOutcome(result, state.bases)
  const initial = sameRunners
    ? {
        movements: rowMovements,
        batterTo: row.batter_to,
        direction: row.hit_direction ?? '',
        height: row.hit_type ?? '',
        withError: !!row.with_error,
        withFc: !!row.with_fc,
        fielding: parseFielding(row.fielding),
        errorBy: row.error_by ?? '',
        errorKind: row.error_kind ?? '',
      }
    : mode === 'edit' && result === row.result
      ? { ...outcome, direction: row.hit_direction ?? '', height: row.hit_type ?? defaultHeight(result) }
      : { ...outcome, direction: '', height: defaultHeight(result) }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-stone-800">
          {title}・{RESULT_MAP[result]?.label ?? result}
          <span className="ml-2 text-xs font-normal text-stone-500">{situation}</span>
        </p>
        <button type="button" onClick={() => setChanging(true)} className="text-sm text-emerald-800 hover:underline">
          更換結果
        </button>
      </div>
      <PlaySheet
        key={`${mode}-${row?.id ?? 'new'}-${result}`}
        result={result}
        bases={state.bases}
        batter={batter}
        initial={initial}
        preview={preview}
        confirmLabel="下一步：預覽影響"
        onConfirm={(details) => onSubmit(result, details)}
        onCancel={onCancel}
      />
    </div>
  )
}

/* ---------- 修改歷史 ---------- */
/**
 * @param events        目前全部紀錄（時間軸）
 * @param state         目前的比賽狀態
 * @param startLineups  原始先發名單
 * @param ctx           { innings, initialSetSize, lineupSize }
 * @param {(rows: object[]) => void} onApply  確認後，把重新推算的整串紀錄寫回
 */
export default function HistoryPanel({ game, events, state, startLineups, ctx, onApply, onClose }) {
  const teamNames = useMemo(() => ({ away: game.away_team, home: game.home_team }), [game.away_team, game.home_team])
  const [editor, setEditor] = useState(null) // { mode: 'edit' | 'insert', rowId?, at }  at = 在哪一筆之前（null = 最後）
  const [pending, setPending] = useState(null) // 預覽中的修改結果

  function propose(rows, title) {
    setPending({ ...rebuildTimeline(rows, startLineups, ctx, teamNames), title })
    setEditor(null)
  }

  function handleSubmit(result, details) {
    if (editor.mode === 'edit') {
      propose(updateRow(events, editor.rowId, paPatch(result, details)), '修改打席')
    } else {
      const row = newPaRow(newId(), game.id, result, details)
      propose(insertBefore(events, editor.at, row), '插入打席')
    }
  }

  function handleDelete(e) {
    if (!window.confirm(`確定要刪除第 ${e.seq} 筆嗎？後面的紀錄會依照新的局面重新計算。`)) return
    setEditor(null)
    propose(removeRow(events, e.id), '刪除紀錄')
  }

  function apply() {
    onApply(pending.rows)
    setPending(null)
  }

  // ---- 預覽畫面 ----
  if (pending) {
    const { rows, state: next, adjusted, dropped, title } = pending
    const adjustedRows = rows.filter((r) => adjusted.includes(r.id))
    return (
      <div className="space-y-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <h3 className="font-semibold text-stone-900">{title}：確認重新計算</h3>
        <ul className="space-y-1 text-sm text-stone-700">
          <li>
            比分：{game.away_team} {state.score.away} : {state.score.home} {game.home_team}
            <span className="mx-2 text-stone-400">→</span>
            <b>{next.score.away} : {next.score.home}</b>
          </li>
          <li>
            目前局面：{state.inning} 局{halfText(state.half)}
            <span className="mx-2 text-stone-400">→</span>
            <b>{next.inning} 局{halfText(next.half)}・{next.outs} 出局{next.over ? '・比賽結束' : ''}</b>
          </li>
          <li>紀錄筆數：{events.length}<span className="mx-2 text-stone-400">→</span><b>{rows.length}</b></li>
        </ul>

        {adjustedRows.length > 0 && (
          <div className="text-sm">
            <p className="font-medium text-amber-800">
              有 {adjustedRows.length} 筆的跑者去向，在新的局面下不成立，已改用預設推進：
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-stone-700">
              {adjustedRows.map((r) => (
                <li key={r.id}>#{r.seq}　{r.description}</li>
              ))}
            </ul>
          </div>
        )}

        {dropped.length > 0 && (
          <div className="text-sm">
            <p className="font-medium text-red-700">有 {dropped.length} 筆在新的局面下無法成立，套用後會被移除：</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-stone-700">
              {dropped.map((r) => (
                <li key={r.id}>{r.description}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={apply}
            className="flex-1 rounded-md bg-emerald-800 px-4 py-2.5 font-medium text-white hover:bg-emerald-900"
          >
            套用修改
          </button>
          <button
            type="button"
            onClick={() => setPending(null)}
            className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-stone-700 hover:bg-stone-50"
          >
            放棄
          </button>
        </div>
      </div>
    )
  }

  // ---- 編輯畫面 ----
  if (editor) {
    const row = editor.mode === 'edit' ? events.find((e) => e.id === editor.rowId) : null
    const at = editor.mode === 'edit' ? editor.rowId : editor.at
    const atRow = events.find((e) => e.id === at)
    const title =
      editor.mode === 'edit'
        ? `修改第 ${row?.seq} 筆`
        : atRow
          ? `在第 ${atRow.seq} 筆之前插入`
          : '加在最後'
    return (
      <PaEditor
        key={`${editor.mode}-${at ?? 'end'}`}
        mode={editor.mode}
        row={row}
        before={stateBefore(events, at, startLineups, ctx, teamNames)}
        ctx={ctx}
        title={title}
        onSubmit={handleSubmit}
        onCancel={() => setEditor(null)}
      />
    )
  }

  // ---- 紀錄列表 ----
  const items = events.map((e, i) => ({ e, next: events[i + 1] ?? null })).reverse()
  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-stone-900">修改歷史</h3>
        <button type="button" onClick={onClose} aria-label="關閉" className="rounded px-2 py-1 text-stone-500 hover:bg-stone-100">✕</button>
      </div>
      <p className="text-xs text-stone-500">
        選擇要修改的紀錄，或在它前後插入漏記的打席。修改後，後面的打者、跑者、出局數與比分會自動重新計算，確認前會先預覽影響。
      </p>

      {events.length === 0 ? (
        <p className="py-4 text-center text-sm text-stone-500">還沒有任何紀錄。</p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-200 bg-white">
          {items.map(({ e, next }) => {
            const kind = e.kind ?? 'pa'
            const tag = KIND_TAG[kind]
            return (
              <li key={e.id} className="space-y-1.5 px-3 py-2.5">
                <div className="flex gap-2 text-sm">
                  <span className="w-8 shrink-0 tabular-nums text-stone-400">#{e.seq}</span>
                  <span className="w-10 shrink-0 text-stone-500">{e.inning}{halfText(e.half)}</span>
                  <span className="min-w-0 break-words text-stone-800">
                    {tag && (
                      <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold text-white ${tag[1]}`}>{tag[0]}</span>
                    )}
                    {e.description}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pl-8">
                  {kind === 'pa' && (
                    <button type="button" onClick={() => setEditor({ mode: 'edit', rowId: e.id })} className={smallBtn}>
                      修改
                    </button>
                  )}
                  <button type="button" onClick={() => setEditor({ mode: 'insert', at: e.id })} className={smallBtn}>
                    前面插入
                  </button>
                  <button type="button" onClick={() => setEditor({ mode: 'insert', at: next?.id ?? null })} className={smallBtn}>
                    後面插入
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(e)}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    刪除
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}