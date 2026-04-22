export default function ProgressBar({ value, max = 100, size = 'md', showLabel = true }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0

  const heights = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' }

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>{value} / {max}</span>
          <span>{percent}%</span>
        </div>
      )}
      <div className={`w-full bg-gray-700 rounded-full overflow-hidden ${heights[size] || heights.md}`}>
        <div
          className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-steam-blue to-steam-accent"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
