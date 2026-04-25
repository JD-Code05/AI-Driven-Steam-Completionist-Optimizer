import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import ProgressBar from './ProgressBar'

// Module-level cache so each app_id is only fetched once per session
const imageCache = new Map()

export default function GameCard({ game, playerGame, unlockedCount, totalAchievements }) {
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
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (!game.app_id) return
    // Already resolved for this app_id — skip fetch
    if (imageCache.has(game.app_id)) return

    let cancelled = false
    fetch(`/api/steamgriddb/grid/${game.app_id}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const url = data?.url || null
        imageCache.set(game.app_id, url)
        if (url) setImageUrl(url)
      })
      .catch(() => {
        if (!cancelled) imageCache.set(game.app_id, null)
      })

    return () => { cancelled = true }
  }, [game.app_id])

  const displayUrl = imgError ? fallbackUrl : imageUrl

  return (
    <Link
      to={`/games/${game.id}`}
      className="group block bg-surface-light rounded-xl overflow-hidden border border-gray-800 hover:border-steam-blue/50 transition-all duration-200 hover:shadow-lg hover:shadow-steam-blue/10"
    >
      {displayUrl ? (
        <div className="aspect-[2/3] overflow-hidden bg-gray-900">
          <img
            src={displayUrl}
            alt={game.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => {
              if (!imgError) {
                setImgError(true)
                setImageUrl(fallbackUrl)
              }
            }}
          />
        </div>
      ) : (
        <div className="aspect-[2/3] bg-gradient-to-br from-steam-dark to-steam-light flex items-center justify-center">
          <span className="text-4xl font-bold text-gray-500">{game.name?.[0] || '?'}</span>
        </div>
      )}
      <div className="p-4 text-left">
        <h3 className="font-semibold text-sm text-white truncate mb-2">{game.name}</h3>
        {total > 0 ? (
          <ProgressBar value={unlocked} max={total} size="sm" />
        ) : (
          <p className="text-xs text-gray-500">No achievements</p>
        )}
        {playerGame?.playtime_hours > 0 && (
          <p className="text-xs text-gray-500 mt-2">
            {playerGame.playtime_hours}h played
          </p>
        )}
      </div>
    </Link>
  )
}
