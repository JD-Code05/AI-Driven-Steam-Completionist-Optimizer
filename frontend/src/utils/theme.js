// Theme choice: 'light' | 'dark' stored under THEME_KEY; nothing stored means follow the system.
// index.html has an inline no-flash copy of resolveTheme — keep the two in sync.
// Nothing here touches document/localStorage at import time, so Node tests can import it.

export const THEME_KEY = 'theme'

export function readStoredTheme(storage = localStorage) {
  try {
    const value = storage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function resolveTheme(stored, systemDark) {
  return stored ?? (systemDark ? 'dark' : 'light')
}

export function setTheme(theme, originEl) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch { /* blocked storage: the theme still applies to this page */ }

  const root = document.documentElement
  const apply = () => { root.dataset.theme = theme }
  if (!originEl || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply() // CSS crossfades body colors in this case
    return
  }

  // Circle reveal of the new theme, growing from the switch until it covers the far corner.
  const r = originEl.getBoundingClientRect()
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  const easing = getComputedStyle(root).getPropertyValue('--ease-in-out').trim()
  document.startViewTransition(apply).ready.then(() => root.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
    { duration: 650, easing, pseudoElement: '::view-transition-new(root)' },
  ))
}
