import RarityBadge from './RarityBadge'
import { HiLockClosed, HiLockOpen } from 'react-icons/hi2'

export default function AchievementCard({ achievement, unlocked, unlockTime }) {
  return (
    <div className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
      unlocked
        ? 'bg-surface-light border-steam-blue/20'
        : 'bg-surface border-gray-800 opacity-70'
    }`}>
      <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gray-800">
        <img
          src={unlocked ? achievement.icon_url : (achievement.icon_gray_url || achievement.icon_url)}
          alt={achievement.display_name}
          className="w-full h-full object-cover"
          onError={(e) => { e.target.src = '' ; e.target.className = 'hidden' }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h4 className="text-sm font-semibold text-white truncate">{achievement.display_name}</h4>
          <RarityBadge tier={achievement.rarity_tier} percent={achievement.global_percent} />
        </div>
        <p className="text-xs text-gray-400 truncate">{achievement.description || 'Hidden achievement'}</p>
        {unlocked && unlockTime && (
          <p className="text-xs text-steam-accent mt-0.5">
            Unlocked {new Date(unlockTime).toLocaleDateString()}
          </p>
        )}
      </div>

      <div className="shrink-0">
        {unlocked ? (
          <HiLockOpen className="w-5 h-5 text-steam-accent" />
        ) : (
          <HiLockClosed className="w-5 h-5 text-gray-600" />
        )}
      </div>
    </div>
  )
}
