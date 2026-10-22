import { Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import ProtectedRoute from './features/auth/ProtectedRoute'
import HomePage from './pages/HomePage'
import LivePage from './pages/LivePage'
import ScorePage from './pages/ScorePage'
import NewGamePage from './pages/NewGamePage'
import TeamsPage from './pages/TeamsPage'
import LoginPage from './pages/LoginPage'

export default function App() {
  return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/game/:id" element={<LivePage />} />
        <Route path="/game/:id/score" element={<ProtectedRoute><ScorePage /></ProtectedRoute>} />
        <Route path="/games/new" element={<ProtectedRoute><NewGamePage /></ProtectedRoute>} />
        <Route path="/teams" element={<ProtectedRoute><TeamsPage /></ProtectedRoute>} />
        <Route path="*" element={<p className="py-16 text-center text-stone-500">找不到這個頁面。</p>} />
      </Routes>
    </div>
  )
}