import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

// 沒登入就導向登入頁，登入後會回到原本要去的頁面
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p className="py-16 text-center text-stone-500">確認登入狀態中…</p>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}