import { Link } from 'react-router-dom'
import { useState } from 'react'
import ProgressBar from './ProgressBar'
import api from '../services/api'

// SteamGridDB lookups, cached per app_id for the session
const gridCache = new Map()
const steamCover = (appId) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`

export default function GameCard({ game, unlockedCount, totalAchievements }) {
  const total = totalAchievements ?? 0
  const unlocked = unlockedCount ?? 0

  // Official Steam cover first (community grid art can be low quality); SteamGridDB only when Steam has none
  const [src, setSrc] = useState(game.app_id ? steamCover(game.app_id) : null)

  function loadGridArt() {
    if (gridCache.has(game.app_id)) return setSrc(gridCache.get(game.app_id))
    setSrc(null) // placeholder while the (slow) lookup runs, instead of a broken image
    api.get(`/steamgriddb/grid/${game.app_id}`)
      .then(({ data }) => { gridCache.set(game.app_id, data?.url || null); setSrc(data?.url || null) })
      .catch(() => { gridCache.set(game.app_id, null); setSrc(null) })
  }

  const perfect = total > 0 && unlocked >= total

  return (
    <Link to={`/games/${game.id}`} className="group block min-w-0 text-left focus-visible:outline-none">
      <div className="aspect-[2/3] overflow-hidden rounded-md bg-track transition-[transform,box-shadow] duration-200 ease-[var(--ease-out)] group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ink motion-safe:[@media(hover:hover)_and_(pointer:fine)]:group-hover:-translate-y-[3px] motion-safe:[@media(hover:hover)_and_(pointer:fine)]:group-hover:shadow-[0_8px_18px_rgba(0,0,0,.18)]">
        {src ? (
          <img
            src={src}
            alt=""
            className="size-full object-cover"
            // Steam cover missing -> SteamGridDB; that failing too -> initial placeholder
            onError={() => (src === steamCover(game.app_id) ? loadGridArt() : setSrc(null))}
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
            {perfect ? <span className="font-semibold text-ultra">Perfect</span> : <span>{Math.floor((unlocked / total) * 100)}%</span>}
          </div>
          <div className="mt-2"><ProgressBar value={unlocked} max={total} tone={perfect ? 'ultra' : 'ink'} /></div>
        </>
      ) : (
        <p className="text-xs text-muted">Not synced yet</p>
      )}
    </Link>
  )
}
