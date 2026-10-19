import { useState } from 'react'
import RarityBadge from './RarityBadge'
import { formatDate } from '../utils/format'

export default function AchievementRow({ achievement, unlocked, unlockTime, gameName, current, onSelect }) {
  const [imgFailed, setImgFailed] = useState(false)
  const src = unlocked ? achievement.icon_url : (achievement.icon_gray_url || achievement.icon_url)
  const pct = achievement.global_percent
  const Tag = onSelect ? 'button' : 'div'

  return (
    <Tag
      {...(onSelect && { type: 'button', onClick: () => onSelect(achievement) })}
      aria-current={current ? 'true' : undefined}
      className={`grid w-full grid-cols-[1fr_90px_100px_110px] items-center gap-3 border-b border-border px-3.5 py-[9px] text-left transition-colors duration-150 last:border-b-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink max-[860px]:grid-cols-[1fr_70px] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-hover ${current ? 'bg-hover shadow-[inset_2px_0_0_var(--ink)]' : ''} ${onSelect ? 'cursor-pointer' : ''}`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className={`grid size-[34px] flex-none place-items-center overflow-hidden rounded-md bg-track text-xs font-bold text-muted ${unlocked ? '' : 'opacity-45'}`}>
          {src && !imgFailed
            ? <img src={src} alt="" className="size-full object-cover" onError={() => setImgFailed(true)} />
            : (achievement.display_name?.[0] || '?')}
        </span>
        <span className="min-w-0">
          {gameName && <span className="block truncate text-[11px] text-faint">{gameName}</span>}
          <span className={`block truncate font-medium ${unlocked ? '' : 'text-muted'}`}>{achievement.display_name}</span>
          <span className="block truncate text-xs text-muted">{achievement.description || 'Hidden achievement'}</span>
        </span>
      </span>
      <span className="text-right">{pct == null ? '' : `${Number(pct).toFixed(1)}%`}</span>
      <span className="flex max-[860px]:hidden"><RarityBadge tier={achievement.rarity_tier} /></span>
      <span className={`whitespace-nowrap text-xs max-[860px]:hidden ${unlocked ? 'text-text' : 'text-muted'}`}>
        {unlocked ? (unlockTime ? formatDate(unlockTime) : 'Unlocked') : 'Locked'}
      </span>
    </Tag>
  )
}
