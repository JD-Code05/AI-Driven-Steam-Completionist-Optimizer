import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import GameDetailPage from './pages/GameDetailPage'
import OptimizationPage from './pages/OptimizationPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/games/:gameId"
        element={
          <ProtectedRoute>
            <GameDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/games/:gameId/optimize"
        element={
          <ProtectedRoute>
            <OptimizationPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
