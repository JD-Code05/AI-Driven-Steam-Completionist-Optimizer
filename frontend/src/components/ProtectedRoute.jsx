import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { player, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-2 border-steam-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!player) {
    return <Navigate to="/login" replace />
  }

  return children
}
