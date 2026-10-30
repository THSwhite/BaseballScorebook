const COLS = [
  { key: 'ab', label: '打數' },
  { key: 'h', label: '安打' },
  { key: 'rbi', label: '打點' },
  { key: 'r', label: '得分' },
  { key: 'bb', label: '四死' },
  { key: 'k', label: '三振' },
]

const hasNumber = (n) => n !== null && n !== undefined && n !== ''

function TeamTable({ name, rows }) {
  const totals = COLS.reduce((acc, c) => ({ ...acc, [c.key]: rows.reduce((sum, r) => sum + r[c.key], 0) }), {})

  return (
    <section className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <h3 className="bg-stone-100 px-3 py-2 font-semibold text-stone-900">{name}</h3>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-sm text-stone-500">還沒有打擊資料。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-center text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-stone-500">
                <th className="px-3 py-2 text-left font-medium">棒次・球員</th>
                <th className="px-2 py-2 font-medium">守位</th>
                {COLS.map((c) => (
                  <th key={c.key} className="px-2 py-2 font-medium">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-stone-100">
                  <td className="px-3 py-2 text-left">
                    {r.role ? (
                      <span className="mr-2 ml-4 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">{r.role}</span>
                    ) : (
                      <span className="mr-2 text-stone-400">{r.order}</span>
                    )}
                    <span className="font-medium text-stone-900">
                      {r.name || (hasNumber(r.number) ? `#${r.number}` : '—')}
                    </span>
                    {r.name && hasNumber(r.number) && <span className="ml-1.5 text-xs text-stone-500">#{r.number}</span>}
                  </td>
                  <td className="px-2 py-2 text-stone-600">{r.position || '–'}</td>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-2 py-2">{r[c.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200 bg-stone-50 font-semibold text-stone-900">
                <td className="px-3 py-2 text-left">合計</td>
                <td />
                {COLS.map((c) => (
                  <td key={c.key} className="px-2 py-2">{totals[c.key]}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}

/** 單場打擊成績：先攻、後攻各一張表 */
export default function GameBoxScore({ game, boxScore }) {
  return (
    <div className="space-y-4">
      <TeamTable name={`${game.away_team}（先攻）`} rows={boxScore.away} />
      <TeamTable name={`${game.home_team}（後攻）`} rows={boxScore.home} />
    </div>
  )
}