import { useEffect, useId, useState } from 'react'
import { readStoredTheme, resolveTheme, setTheme } from '../utils/theme'

// Sun/moon switch. All visuals and motion come from data-theme on <html> (see .theme-switch in index.css).
export default function ThemeSwitch() {
  const maskId = useId()
  const [theme, setThemeState] = useState(() => document.documentElement.dataset.theme)

  // With no stored choice, follow live changes to the system setting.
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => {
      if (readStoredTheme()) return
      const next = resolveTheme(null, e.matches)
      document.documentElement.dataset.theme = next
      setThemeState(next)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const toggle = (e) => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    setTheme(next, e.currentTarget)
    setThemeState(next)
  }

  return (
    <button
      type="button"
      className="theme-switch"
      role="switch"
      aria-checked={theme === 'dark'}
      aria-label="Dark mode"
      onClick={toggle}
    >
      <span className="star" /><span className="star" /><span className="star" />
      <span className="cloud" />
      <span className="knob">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect x="-6" y="-6" width="36" height="36" fill="white" />
              <circle className="mask-dot" cx="26" cy="2" r="7" fill="black" />
            </mask>
          </defs>
          <g className="rays">
            <line x1="12" y1="1.5" x2="12" y2="3.5" /><line x1="12" y1="20.5" x2="12" y2="22.5" />
            <line x1="1.5" y1="12" x2="3.5" y2="12" /><line x1="20.5" y1="12" x2="22.5" y2="12" />
            <line x1="4.6" y1="4.6" x2="6" y2="6" /><line x1="18" y1="18" x2="19.4" y2="19.4" />
            <line x1="4.6" y1="19.4" x2="6" y2="18" /><line x1="18" y1="6" x2="19.4" y2="4.6" />
          </g>
          <circle className="core" cx="12" cy="12" r="5" mask={`url(#${maskId})`} />
        </svg>
      </span>
    </button>
  )
}
