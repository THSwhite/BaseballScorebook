import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import LoginForm from '../features/auth/LoginForm'
import { useAuth } from '../features/auth/AuthContext'

export default function LoginPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const from = useLocation().state?.from ?? '/'

  if (!loading && user) return <Navigate to={from} replace />

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold text-stone-900">記錄員登入</h1>
      <p className="mb-6 text-sm text-stone-500">只有記錄員需要登入。觀看轉播不用登入。</p>
      <LoginForm onSuccess={() => navigate(from, { replace: true })} />
    </main>
  )
}