import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { player, loading } = useAuth()
  // The auth callback reports failures as ?error= on the return URL; carry it to the login page.
  const error = new URLSearchParams(useLocation().search).get('error')

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-2 border-steam-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!player) {
    return <Navigate to={error ? `/login?error=${encodeURIComponent(error)}` : '/login'} replace />
  }

  return children
}
