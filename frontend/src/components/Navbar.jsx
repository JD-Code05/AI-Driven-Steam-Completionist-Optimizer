import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemeSwitch from './ThemeSwitch'

export default function Navbar() {
  const { player, logout } = useAuth()

  return (
    <nav className="bg-surface border-b border-border">
      <div className="max-w-[1160px] mx-auto px-5 py-3 flex items-center gap-6 max-[520px]:gap-3 max-[520px]:px-4">
        <Link to="/dashboard" aria-label="Achievement Optimizer" className="font-bold tracking-[-0.01em] text-text">
          <span className="max-[520px]:hidden">Achievement Optimizer</span>
          <span className="hidden max-[520px]:inline">AO</span>
        </Link>
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `font-medium ${isActive ? 'text-text' : 'text-muted hover:text-text'}`}
        >
          Dashboard
        </NavLink>
        <div className="ml-auto flex items-center gap-3.5 max-[520px]:gap-3">
          <ThemeSwitch />
          {player && (
            <>
              <img
                src={player.avatar_url}
                alt=""
                className="w-7 h-7 rounded-md bg-border-strong max-[520px]:hidden"
              />
              <button type="button" onClick={logout} className="font-medium text-muted hover:text-text whitespace-nowrap cursor-pointer">
                Log out
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
