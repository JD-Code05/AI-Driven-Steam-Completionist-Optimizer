import { Link } from 'react-router-dom'
import ProgressBar from './ProgressBar'

export default function GameCard({ game, playerGame, unlockedCount }) {
  const total = game.total_achievements || 0
  const unlocked = unlockedCount ?? 0
  // Use logo URL if available, fall back to icon URL
  const imageUrl = game.img_logo_url || game.img_icon_url

  return (
    <Link
      to={`/games/${game.id}`}
      className="group block bg-surface-light rounded-xl overflow-hidden border border-gray-800 hover:border-steam-blue/50 transition-all duration-200 hover:shadow-lg hover:shadow-steam-blue/10"
    >
      {imageUrl ? (
        <div className="h-48 overflow-hidden bg-gray-900">
          <img
            src={imageUrl}
            alt={game.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              e.target.style.display = 'none'
            }}
          />
        </div>
      ) : (
        <div className="h-48 bg-gradient-to-br from-steam-dark to-steam-light flex items-center justify-center">
          <span className="text-4xl font-bold text-gray-500">{game.name?.[0] || '?'}</span>
        </div>
      )}
      <div className="p-4">
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
