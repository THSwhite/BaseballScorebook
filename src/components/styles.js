/**
 * styles.js
 * 共用的 Tailwind class：按鈕、輸入框、提示文字
 * 顏色用 emerald（主色）與 stone（中性色），index.css 換色盤時會一起跟著變
 */

export const inputClass =
  'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/30'

export const labelClass = 'mb-1 block text-sm font-medium text-stone-700'

const buttonBase = 'rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60'

export const buttonClass = {
  primary: `${buttonBase} bg-emerald-800 text-white hover:bg-emerald-900`,
  secondary: `${buttonBase} border border-stone-300 bg-white text-stone-700 hover:bg-stone-100`,
  danger: `${buttonBase} text-red-700 hover:bg-red-50`,
}

export const errorClass = 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700'

export const mutedClass = 'text-sm text-stone-500'
