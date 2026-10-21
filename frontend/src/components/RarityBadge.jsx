const tiers = {
  'ultra-rare': { label: 'Ultra rare', cls: 'text-ultra bg-ultra-bg' },
  rare: { label: 'Rare', cls: 'text-rare bg-rare-bg' },
  uncommon: { label: 'Uncommon', cls: 'text-uncommon bg-uncommon-bg' },
  common: { label: 'Common', cls: 'text-common bg-common-bg' },
}

export default function RarityBadge({ tier }) {
  const { label, cls } = tiers[tier] || tiers.common
  return (
    <span className={`justify-self-start whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}
