const tierConfig = {
  'ultra-rare': { label: 'Ultra Rare', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  'rare':       { label: 'Rare',       color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  'uncommon':   { label: 'Uncommon',   color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  'common':     { label: 'Common',     color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
}

export default function RarityBadge({ tier, percent }) {
  const config = tierConfig[tier] || tierConfig.common
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${config.color}`}>
      {config.label}
      {percent != null && <span className="opacity-75">({percent}%)</span>}
    </span>
  )
}
