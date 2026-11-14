import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import ProtectedRoute from './features/auth/ProtectedRoute'
import HomePage from './pages/HomePage'
import LivePage from './pages/LivePage'

// 只有記錄員會用到的頁面：用到時才下載，觀眾看轉播不用載入這些程式碼
const ScorePage = lazy(() => import('./pages/ScorePage'))
const NewGamePage = lazy(() => import('./pages/NewGamePage'))
const TeamsPage = lazy(() => import('./pages/TeamsPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))

const pageLoading = <p className="py-16 text-center text-stone-500">載入中…</p>

export default function App() {
  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />
      <Suspense fallback={pageLoading}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/game/:id" element={<LivePage />} />
          <Route path="/game/:id/score" element={<ProtectedRoute><ScorePage /></ProtectedRoute>} />
          <Route path="/games/new" element={<ProtectedRoute><NewGamePage /></ProtectedRoute>} />
          <Route path="/teams" element={<ProtectedRoute><TeamsPage /></ProtectedRoute>} />
          <Route path="*" element={<p className="py-16 text-center text-stone-500">找不到這個頁面。</p>} />
        </Routes>
      </Suspense>
    </div>
  )
}
