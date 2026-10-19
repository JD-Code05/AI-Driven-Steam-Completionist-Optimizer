import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import ProgressBar from './ProgressBar'
import api from '../services/api'

// Module-level cache so each app_id is only fetched once per session
const imageCache = new Map()

export default function GameCard({ game, unlockedCount, totalAchievements }) {
  const total = totalAchievements ?? 0
  const unlocked = unlockedCount ?? 0

  // Steam CDN fallback chain
  const fallbackUrl = game.img_capsule_url || game.img_logo_url || game.img_icon_url

  const [imageUrl, setImageUrl] = useState(() => {
    // Use cached value immediately if available (avoids flicker on re-renders)
    if (game.app_id && imageCache.has(game.app_id)) {
      return imageCache.get(game.app_id) || fallbackUrl
    }
    return fallbackUrl
  })
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!game.app_id) return
    // Already resolved for this app_id — skip fetch
    if (imageCache.has(game.app_id)) return

    let cancelled = false
    api.get(`/steamgriddb/grid/${game.app_id}`)
      .then(({ data }) => {
        if (cancelled) return
        const url = data?.url || null
        imageCache.set(game.app_id, url)
        if (url) { setImageUrl(url); setFailed(false) }
      })
      .catch(() => {
        if (!cancelled) imageCache.set(game.app_id, null)
      })

    return () => { cancelled = true }
  }, [game.app_id])

  const displayUrl = failed ? null : imageUrl
  const perfect = total > 0 && unlocked >= total

  return (
    <Link to={`/games/${game.id}`} className="group block text-left focus-visible:outline-none">
      <div className="aspect-[2/3] overflow-hidden rounded-md bg-track transition-[transform,box-shadow] duration-200 ease-[var(--ease-out)] group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ink motion-safe:[@media(hover:hover)_and_(pointer:fine)]:group-hover:-translate-y-[3px] motion-safe:[@media(hover:hover)_and_(pointer:fine)]:group-hover:shadow-[0_8px_18px_rgba(0,0,0,.18)]">
        {displayUrl ? (
          <img
            src={displayUrl}
            alt=""
            className="size-full object-cover"
            onError={() => {
              // grid art failed -> Steam CDN fallback; fallback failed -> initial placeholder
              if (fallbackUrl && imageUrl !== fallbackUrl) setImageUrl(fallbackUrl)
              else setFailed(true)
            }}
          />
        ) : (
          <div className="grid size-full place-items-center text-4xl font-bold text-faint">{game.name?.[0] || '?'}</div>
        )}
      </div>
      <h3 className="mt-1.5 truncate font-medium">{game.name}</h3>
      {total > 0 ? (
        <>
          <div className="flex justify-between text-xs text-muted">
            <span>{unlocked} / {total}</span>
            {perfect ? <span className="font-semibold text-ultra">Perfect</span> : <span>{Math.round((unlocked / total) * 100)}%</span>}
          </div>
          <div className="mt-2"><ProgressBar value={unlocked} max={total} tone={perfect ? 'ultra' : 'ink'} /></div>
        </>
      ) : (
        <p className="text-xs text-muted">No achievements</p>
      )}
    </Link>
  )
}
