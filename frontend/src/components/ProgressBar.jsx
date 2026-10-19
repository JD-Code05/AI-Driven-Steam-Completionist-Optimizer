const tones = {
  ink: 'bg-ink', ultra: 'bg-ultra', common: 'bg-common', uncommon: 'bg-uncommon', rare: 'bg-rare',
}

export default function ProgressBar({ value, max, tone = 'ink' }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="h-1 w-full overflow-hidden rounded-[2px] bg-track">
      <i className={`block h-full ${tones[tone] || tones.ink}`} style={{ width: `${percent}%` }} />
    </div>
  )
}
