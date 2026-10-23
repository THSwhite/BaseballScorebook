import { runnerLabel } from '../../utils/formatters'

// 壘包座標（viewBox 260 x 170）
const POINTS = {
  1: { x: 180, y: 95 },
  2: { x: 130, y: 45 },
  3: { x: 80, y: 95 },
}

const short = (text) => (text.length > 5 ? `${text.slice(0, 5)}…` : text)

/**
 * 壘包狀態與出局數
 * @param {Array} bases  [一壘, 二壘, 三壘]，每格為跑者物件或 null
 * @param {number} outs  目前出局數
 */
export default function BaseDiamond({ bases, outs }) {
  const occupiedText = bases
    .map((b, i) => (b ? `${['一', '二', '三'][i]}壘有人` : null))
    .filter(Boolean)
    .join('、')

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        viewBox="0 0 260 170"
        className="w-full max-w-[280px]"
        role="img"
        aria-label={`${occupiedText || '壘上無人'}，${outs} 出局`}
      >
        <polygon points="130,145 180,95 130,45 80,95" className="fill-stone-100 stroke-stone-300" strokeWidth="2" />

        {/* 本壘 */}
        <polygon points="122,138 138,138 138,146 130,153 122,146" className="fill-white stroke-stone-400" strokeWidth="1.5" />

        {[1, 2, 3].map((n) => {
          const { x, y } = POINTS[n]
          const runner = bases[n - 1]
          return (
            <g key={n}>
              <rect
                x={x - 12}
                y={y - 12}
                width="24"
                height="24"
                transform={`rotate(45 ${x} ${y})`}
                className={runner ? 'fill-emerald-700 stroke-emerald-900' : 'fill-white stroke-stone-400'}
                strokeWidth="2"
              />
              {runner && (
                <text
                  x={n === 1 ? x + 20 : n === 3 ? x - 20 : x}
                  y={n === 2 ? y - 22 : y + 5}
                  textAnchor={n === 1 ? 'start' : n === 3 ? 'end' : 'middle'}
                  fontSize="14"
                  className="fill-stone-800"
                >
                  {short(runnerLabel(runner))}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      <div className="flex items-center gap-2 text-sm text-stone-700">
        <span>出局</span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`h-4 w-4 rounded-full border ${i < outs ? 'border-red-700 bg-red-600' : 'border-stone-400 bg-white'}`}
          />
        ))}
      </div>
    </div>
  )
}