import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

export default function Navbar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <header className="border-b border-stone-200 bg-white">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-bold text-emerald-900">棒球文字轉播</Link>
        <div className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link to="/games/new" className="text-stone-700 hover:underline">建立比賽</Link>
              <span className="hidden text-stone-500 sm:inline">{user.email}</span>
              <button type="button" onClick={handleSignOut} className="text-stone-700 hover:underline">登出</button>
            </>
          ) : (
            <Link to="/login" className="rounded-md bg-emerald-800 px-3 py-1.5 text-white hover:bg-emerald-900">記錄員登入</Link>
          )}
        </div>
      </nav>
    </header>
  )
}