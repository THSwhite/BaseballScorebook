import { useEffect, useMemo, useState } from 'react'
import ResultButtons from './ResultButtons'
import PlaySheet from './PlaySheet'
import SubstitutionPanel from './SubstitutionPanel'
import { newId } from './offlineQueue'
import { RESULT_MAP, defaultHeight, defaultOutcome, evaluatePlateAppearance, kindOf } from '../../utils/plateAppearance'
import { parseFielding } from '../../utils/formatters'
import { normalizeChanges, validateSubstitutions } from '../../utils/lineup'
import {
  insertBefore,
  newPaRow,
  newSubRow,
  paPatch,
  rebuildTimeline,
  shiftForInsertions,
  stateAt,
  updateRow,
} from '../../utils/history'

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
        confirmLabel="加入修改（先不送出）"
        onConfirm={(details) => onSubmit(result, details)}
        onCancel={onCancel}
      />
    </div>
  )
}

/* ---------- 修改歷史 ---------- */
/**
 * 修改流程：所有修改先累積在「草稿」裡（不會馬上寫入），改完再按「檢查並送出」，
 * 看過重新計算後的衝突，確認沒問題才真正套用。
 *
 * @param events        目前全部紀錄（時間軸）
 * @param state         目前的比賽狀態
 * @param startLineups  原始先發名單
 * @param ctx           { initialSetSize, lineupSize }
 * @param {(rows: object[]) => void} onApply  確認後，把重新推算的整串紀錄寫回
 * @param dirtyRef      { current: boolean }  告訴父層「有尚未送出的修改」
 */
export default function HistoryPanel({ game, events, state, startLineups, ctx, onApply, onClose, dirtyRef }) {
  const teamNames = useMemo(() => ({ away: game.away_team, home: game.home_team }), [game.away_team, game.home_team])

  const [draft, setDraft] = useState(events) // 草稿：整串紀錄（含新增與修改，刪除的先留著，可以還原）
  const [marks, setMarks] = useState({}) // id → 'edited' | 'added'
  const [removed, setRemoved] = useState({}) // id → true（標記刪除）
  const [editor, setEditor] = useState(null) // { mode: 'choose' | 'insert' | 'sub' | 'edit', rowId?, at }
  const [review, setReview] = useState(null) // 檢查後的結果

  const changeCount = Object.keys(marks).length + Object.keys(removed).length

  useEffect(() => {
    if (dirtyRef) dirtyRef.current = changeCount > 0
  }, [changeCount, dirtyRef])
  useEffect(
    () => () => {
      if (dirtyRef) dirtyRef.current = false
    },
    [dirtyRef]
  )

  const activeRows = useMemo(() => draft.filter((r) => !removed[r.id]), [draft, removed])
  // 草稿重新推算後的樣子：列表顯示用（棒次、局數、說明都是最新的）
  const view = useMemo(
    () => rebuildTimeline(activeRows, startLineups, ctx, teamNames),
    [activeRows, startLineups, ctx, teamNames]
  )
  const rebuiltById = useMemo(() => new Map(view.rows.map((r) => [r.id, r])), [view])

  // 某一筆「之前」的局面（at = null 代表最後）。刪除標記的紀錄不算
  function stateFor(at) {
    const index = at ? draft.findIndex((r) => r.id === at) : -1
    const upTo = (index < 0 ? draft : draft.slice(0, index)).filter((r) => !removed[r.id])
    return stateAt(upTo, startLineups, ctx, teamNames)
  }

  const labelAt = (at) => {
    const row = at ? draft.find((r) => r.id === at) : null
    if (!row) return '加在最後'
    const seq = (rebuiltById.get(row.id) ?? row).seq
    return `在第 ${seq} 筆之前插入`
  }

  /* ---- 草稿操作 ---- */
  function insertRow(beforeId, row) {
    setDraft((rows) => {
      const next = insertBefore(rows, beforeId, row)
      const index = next.findIndex((r) => r.id === row.id)
      return kindOf(row) === 'sub' ? shiftForInsertions(next, index + 1, row, 1) : next
    })
    setMarks((m) => ({ ...m, [row.id]: 'added' }))
  }

  function handlePaSubmit(result, details) {
    if (editor.mode === 'edit') {
      setDraft((rows) => updateRow(rows, editor.rowId, paPatch(result, details)))
      setMarks((m) => ({ ...m, [editor.rowId]: m[editor.rowId] === 'added' ? 'added' : 'edited' }))
    } else {
      insertRow(editor.at, newPaRow(newId(), game.id, result, details))
    }
    setEditor(null)
  }

  // 換人面板送出：驗證後加進草稿
  function handleSubSubmit(rawChanges) {
    const before = stateFor(editor.at)
    const side = before.state.half === 'top' ? 'away' : 'home'
    const changes = normalizeChanges(rawChanges)
    const problem = validateSubstitutions(before.lineupState, { battingSide: side, bases: before.state.bases }, changes)
    if (problem) return { ok: false, error: problem }
    insertRow(editor.at, newSubRow(newId(), game.id, changes))
    setEditor(null)
    return { ok: true }
  }

  function deleteRow(row) {
    const isAdded = marks[row.id] === 'added'
    setDraft((rows) => {
      const index = rows.findIndex((r) => r.id === row.id)
      if (index < 0) return rows
      if (isAdded) {
        const next = rows.filter((r) => r.id !== row.id)
        return kindOf(row) === 'sub' ? shiftForInsertions(next, index, row, -1) : next
      }
      return kindOf(row) === 'sub' ? shiftForInsertions(rows, index + 1, row, -1) : rows
    })
    if (isAdded) {
      setMarks((m) => {
        const { [row.id]: _gone, ...rest } = m
        return rest
      })
    } else {
      setRemoved((m) => ({ ...m, [row.id]: true }))
    }
  }

  function restoreRow(row) {
    setDraft((rows) => {
      const index = rows.findIndex((r) => r.id === row.id)
      return kindOf(row) === 'sub' ? shiftForInsertions(rows, index + 1, row, 1) : rows
    })
    setRemoved((m) => {
      const { [row.id]: _gone, ...rest } = m
      return rest
    })
  }

  function discardAll() {
    if (changeCount > 0 && !window.confirm('確定要放棄所有尚未送出的修改嗎？')) return
    setDraft(events)
    setMarks({})
    setRemoved({})
    setEditor(null)
    setReview(null)
  }

  function handleClose() {
    if (changeCount > 0 && !window.confirm('有尚未送出的修改，確定要放棄並關閉嗎？')) return
    onClose()
  }

  function openReview() {
    setReview(rebuildTimeline(activeRows, startLineups, ctx, teamNames))
  }

  /* ---- 檢查衝突後的確認畫面 ---- */
  if (review) {
    const { rows, state: next, adjusted, dropped, warnings } = review
    const adjustedRows = rows.filter((r) => adjusted.includes(r.id))
    const clean = adjustedRows.length === 0 && dropped.length === 0 && warnings.length === 0
    return (
      <div className="space-y-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <h3 className="font-semibold text-stone-900">檢查結果：重新計算後的影響</h3>
        <ul className="space-y-1 text-sm text-stone-700">
          <li>
            比分：{game.away_team} {state.score.away} : {state.score.home} {game.home_team}
            <span className="mx-2 text-stone-400">→</span>
            <b>{next.score.away} : {next.score.home}</b>
          </li>
          <li>
            目前局面：{state.inning} 局{halfText(state.half)}
            <span className="mx-2 text-stone-400">→</span>
            <b>{next.inning} 局{halfText(next.half)}・{next.outs} 出局</b>
          </li>
          <li>紀錄筆數：{events.length}<span className="mx-2 text-stone-400">→</span><b>{rows.length}</b></li>
        </ul>

        {clean && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">沒有發現衝突，可以送出。</p>}

        {dropped.length > 0 && (
          <div className="text-sm">
            <p className="font-medium text-red-700">有 {dropped.length} 筆打席在新的局面下無法成立，送出後會被移除：</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-stone-700">
              {dropped.map(({ row, reason }) => (
                <li key={row.id}>
                  {row.description || RESULT_MAP[row.result]?.label || row.result}
                  <span className="ml-1 text-red-700">（{reason}）</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="text-sm">
            <p className="font-medium text-amber-800">有 {warnings.length} 筆換人在新的局面下有疑問（仍會保留，請確認）：</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-stone-700">
              {warnings.map(({ row, reason }) => (
                <li key={row.id}>
                  {row.description}
                  <span className="ml-1 text-amber-800">（{reason}）</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {adjustedRows.length > 0 && (
          <div className="text-sm">
            <p className="font-medium text-amber-800">
              有 {adjustedRows.length} 筆的跑者去向在新的局面下不成立，已改用預設推進：
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-stone-700">
              {adjustedRows.map((r) => (
                <li key={r.id}>#{r.seq}　{r.description}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onApply(review.rows)}
            className="flex-1 rounded-md bg-emerald-800 px-4 py-2.5 font-medium text-white hover:bg-emerald-900"
          >
            {dropped.length > 0 ? `仍要送出（會移除 ${dropped.length} 筆）` : '確認送出'}
          </button>
          <button
            type="button"
            onClick={() => setReview(null)}
            className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-stone-700 hover:bg-stone-50"
          >
            返回繼續修改
          </button>
        </div>
      </div>
    )
  }

  /* ---- 選擇要插入什麼 ---- */
  if (editor?.mode === 'choose') {
    return (
      <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
        <h3 className="font-semibold text-stone-900">{labelAt(editor.at)}</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setEditor({ mode: 'insert', at: editor.at })}
            className="rounded-md border border-stone-300 bg-white px-3 py-3 text-left hover:bg-stone-50"
          >
            <span className="block text-sm font-semibold text-stone-900">漏記的打席</span>
            <span className="block text-xs text-stone-500">補記一個打席</span>
          </button>
          <button
            type="button"
            onClick={() => setEditor({ mode: 'sub', at: editor.at })}
            className="rounded-md border border-violet-300 bg-white px-3 py-3 text-left hover:bg-violet-50"
          >
            <span className="block text-sm font-semibold text-violet-800">換人・插入球員</span>
            <span className="block text-xs text-stone-500">代跑、代打、換人、守位交換、插入打者</span>
          </button>
        </div>
        <button type="button" onClick={() => setEditor(null)} className="text-sm text-stone-600 hover:underline">
          取消
        </button>
      </div>
    )
  }

  /* ---- 插入換人／球員：沿用「更換選手」面板，局面是那個位置當時的樣子 ---- */
  if (editor?.mode === 'sub') {
    const before = stateFor(editor.at)
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-stone-800">
          {labelAt(editor.at)}・換人
          <span className="ml-2 text-xs font-normal text-stone-500">
            {before.state.inning} 局{halfText(before.state.half)}・{before.state.outs} 出局
          </span>
        </p>
        <SubstitutionPanel
          key={`sub-${editor.at ?? 'end'}`}
          game={game}
          lineups={before.lineupState.lineups}
          retired={before.lineupState.retired}
          state={before.state}
          onSubmit={handleSubSubmit}
          onClose={() => setEditor(null)}
        />
      </div>
    )
  }

  /* ---- 修改或插入打席 ---- */
  if (editor) {
    const row = editor.mode === 'edit' ? draft.find((r) => r.id === editor.rowId) : null
    const at = editor.mode === 'edit' ? editor.rowId : editor.at
    const title =
      editor.mode === 'edit' ? `修改第 ${(rebuiltById.get(row?.id) ?? row)?.seq} 筆` : labelAt(editor.at)
    return (
      <PaEditor
        key={`${editor.mode}-${at ?? 'end'}`}
        mode={editor.mode}
        row={row}
        before={stateFor(at)}
        ctx={ctx}
        title={title}
        onSubmit={handlePaSubmit}
        onCancel={() => setEditor(null)}
      />
    )
  }

  /* ---- 紀錄列表（草稿） ---- */
  const items = draft.map((r, i) => ({ r, next: draft[i + 1] ?? null })).reverse()
  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-stone-900">修改歷史</h3>
        <button type="button" onClick={handleClose} aria-label="關閉" className="rounded px-2 py-1 text-stone-500 hover:bg-stone-100">✕</button>
      </div>
      <p className="text-xs text-stone-500">
        可以連續修改、插入、刪除多筆，改的過程不會寫入。全部改完後按「檢查並送出」，再確認重新計算後有沒有衝突。
      </p>

      <button
        type="button"
        onClick={() => setEditor({ mode: 'choose', at: null })}
        className="w-full rounded-md border border-dashed border-emerald-400 bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
      >
        ＋ 在最後加入打席或換人
      </button>

      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-stone-500">還沒有任何紀錄。</p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-200 bg-white">
          {items.map(({ r, next }) => {
            const isRemoved = !!removed[r.id]
            const shown = isRemoved ? r : (rebuiltById.get(r.id) ?? r)
            const kind = kindOf(shown)
            const tag = KIND_TAG[kind]
            const badge = isRemoved
              ? ['刪除', 'bg-red-600']
              : marks[r.id] === 'added'
                ? ['新增', 'bg-emerald-700']
                : marks[r.id] === 'edited'
                  ? ['已修改', 'bg-amber-500']
                  : null
            return (
              <li key={r.id} className={`space-y-1.5 px-3 py-2.5 ${isRemoved ? 'bg-red-50/60' : badge ? 'bg-amber-50/50' : ''}`}>
                <div className="flex gap-2 text-sm">
                  <span className="w-8 shrink-0 tabular-nums text-stone-400">{isRemoved ? '–' : `#${shown.seq}`}</span>
                  <span className="w-10 shrink-0 text-stone-500">{shown.inning}{halfText(shown.half)}</span>
                  <span className={`min-w-0 break-words ${isRemoved ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
                    {badge && (
                      <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold text-white no-underline ${badge[1]}`}>{badge[0]}</span>
                    )}
                    {tag && (
                      <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold text-white ${tag[1]}`}>{tag[0]}</span>
                    )}
                    {shown.description || RESULT_MAP[shown.result]?.label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pl-8">
                  {isRemoved ? (
                    <button type="button" onClick={() => restoreRow(r)} className={smallBtn}>還原</button>
                  ) : (
                    <>
                      {kind === 'pa' && (
                        <button type="button" onClick={() => setEditor({ mode: 'edit', rowId: r.id })} className={smallBtn}>
                          修改
                        </button>
                      )}
                      <button type="button" onClick={() => setEditor({ mode: 'choose', at: r.id })} className={smallBtn}>
                        前面插入
                      </button>
                      <button type="button" onClick={() => setEditor({ mode: 'choose', at: next?.id ?? null })} className={smallBtn}>
                        後面插入
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRow(r)}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        刪除
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-emerald-200 pt-3">
        <span className="mr-auto text-sm text-stone-700">
          {changeCount > 0 ? `已修改 ${changeCount} 處（尚未送出）` : '尚未修改'}
        </span>
        <button
          type="button"
          onClick={discardAll}
          disabled={changeCount === 0}
          className="rounded-md px-3 py-2 text-sm text-stone-600 hover:bg-white disabled:opacity-40"
        >
          放棄全部修改
        </button>
        <button
          type="button"
          onClick={openReview}
          disabled={changeCount === 0}
          className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-40"
        >
          檢查並送出
        </button>
      </div>
    </div>
  )
}