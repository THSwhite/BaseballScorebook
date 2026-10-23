import { GROUP_LIST, RESULT_LIST, isAvailable } from '../../utils/plateAppearance'

const STYLE = {
  hit: 'bg-emerald-800 text-white hover:bg-emerald-900',
  reach: 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200',
  out: 'bg-stone-200 text-stone-900 hover:bg-stone-300',
  other: 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50',
}

/**
 * 打席結果按鈕
 * @param {object} state     目前比賽狀態（用來停用不合理的選項，例如沒人上壘就不能記野選）
 * @param {boolean} disabled 比賽結束時整組停用
 * @param {(code: string) => void} onPick
 */
export default function ResultButtons({ state, disabled = false, onPick }) {
  return (
    <div className="space-y-4">
      {GROUP_LIST.map((group) => (
        <section key={group.key}>
          <h3 className="mb-1.5 text-xs font-semibold text-stone-500">{group.label}</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {RESULT_LIST.filter((r) => r.group === group.key).map((r) => (
              <button
                key={r.code}
                type="button"
                disabled={disabled || !isAvailable(r.code, state)}
                onClick={() => onPick(r.code)}
                className={`min-h-12 rounded-md px-2 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-35 ${STYLE[group.key]}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}