import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { HiOutlineBars3, HiXMark } from 'react-icons/hi2'
import { SiSteam } from 'react-icons/si'

export default function Navbar() {
  const { player, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard' },
  ]

  const isActive = (path) => location.pathname === path

  return (
    <nav className="sticky top-0 z-50 bg-surface/80 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 text-white font-bold text-lg">
            <SiSteam className="w-6 h-6 text-steam-accent" />
            <span className="hidden sm:inline">Achievement Optimizer</span>
            <span className="sm:hidden">AO</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`text-sm font-medium transition-colors ${
                  isActive(link.to) ? 'text-steam-accent' : 'text-gray-400 hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* User menu */}
          <div className="hidden md:flex items-center gap-3">
            {player && (
              <>
                <img
                  src={player.avatar_url}
                  alt={player.persona_name}
                  className="w-8 h-8 rounded-full border border-gray-700"
                />
                <span className="text-sm text-gray-300">{player.persona_name}</span>
                <button
                  onClick={logout}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors ml-2"
                >
                  Logout
                </button>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-gray-400 hover:text-white"
          >
            {mobileOpen ? <HiXMark className="w-6 h-6" /> : <HiOutlineBars3 className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-800 bg-surface">
          <div className="px-4 py-3 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive(link.to)
                    ? 'bg-steam-blue/10 text-steam-accent'
                    : 'text-gray-400 hover:text-white hover:bg-surface-light'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {player && (
              <div className="flex items-center gap-3 px-3 py-2 border-t border-gray-800 mt-2 pt-3">
                <img src={player.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                <span className="text-sm text-gray-300 flex-1">{player.persona_name}</span>
                <button onClick={logout} className="text-xs text-red-400">Logout</button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
