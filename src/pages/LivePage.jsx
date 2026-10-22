import { Link, useParams } from 'react-router-dom'

// 佔位頁：之後換成 Scoreboard + LiveFeed
export default function LivePage() {
  const { id } = useParams()
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p className="text-stone-600">比賽 {id} 的文字轉播頁，施工中。</p>
      <Link to="/" className="mt-4 inline-block text-emerald-800 hover:underline">回到比賽列表</Link>
    </main>
  )
}