import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authAPI } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [player, setPlayer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // Check for token in URL (Steam callback redirect)
  useEffect(() => {
    const tokenFromUrl = searchParams.get('token')
    if (tokenFromUrl) {
      localStorage.setItem('token', tokenFromUrl)
      searchParams.delete('token')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Load player from token
  const loadPlayer = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }
    try {
      const { data } = await authAPI.me()
      setPlayer(data)
    } catch {
      localStorage.removeItem('token')
      setPlayer(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPlayer()
  }, [loadPlayer])

  const login = () => {
    const returnUrl = window.location.origin + '/dashboard'
    window.location.href = `/api/auth/login?return_url=${encodeURIComponent(returnUrl)}`
  }

  const logout = async () => {
    try {
      await authAPI.logout()
    } catch { /* ignore */ }
    
    // Clear all achievement tips from localStorage for current player
    const keysToDelete = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('achievement-tip-')) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => localStorage.removeItem(key))
    
    localStorage.removeItem('token')
    setPlayer(null)
    navigate('/login')
  }

  return (
    <AuthContext.Provider value={{ player, loading, login, logout, loadPlayer }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
