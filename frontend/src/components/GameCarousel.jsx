import { useCallback, useEffect, useId, useRef, useState } from 'react'
import GameCard from './GameCard'

const arrowCls = 'grid size-8 cursor-pointer place-items-center rounded-lg border border-border-strong bg-surface text-text transition-[opacity,transform] duration-150 enabled:active:scale-[.94] disabled:cursor-default disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none'
const icon = { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', className: 'size-4', 'aria-hidden': true }

// items are player-games; children render at the end of the heading row (e.g. an "All games" button).
export default function GameCarousel({ items, children, title = 'In progress', id }) {
  const headingId = useId()
  const track = useRef(null)
  const [edge, setEdge] = useState({ start: true, end: true })

  const update = useCallback(() => {
    const el = track.current
    if (!el) return
    setEdge({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 })
  }, [])

  useEffect(() => {
    update()
    const ro = new ResizeObserver(update)
    ro.observe(track.current)
    return () => ro.disconnect()
  }, [update, items.length])

  const page = (dir) => track.current.scrollBy({ left: dir * track.current.clientWidth })

  return (
    <section id={id} className="mb-7 scroll-mt-4">
      <div className="mb-2.5 flex items-center gap-2">
        <h2 id={headingId} className="mr-auto text-[13px] font-semibold text-muted">{title}</h2>
        {children}
        <button type="button" aria-label="Previous games" disabled={edge.start} onClick={() => page(-1)} className={arrowCls}>
          <svg {...icon}><path d="M10 3 5 8l5 5" /></svg>
        </button>
        <button type="button" aria-label="Next games" disabled={edge.end} onClick={() => page(1)} className={arrowCls}>
          <svg {...icon}><path d="m6 3 5 5-5 5" /></svg>
        </button>
      </div>
      {/* -mx-1/px-1 keep the focus outline of the first and last cover from being clipped by overflow */}
      <div
        ref={track}
        role="region"
        aria-labelledby={headingId}
        tabIndex={0}
        onScroll={update}
        className="-mx-1 flex snap-x snap-mandatory scroll-px-1 gap-3 overflow-x-auto overscroll-x-contain scroll-smooth px-1 pt-1 pb-2 [--per:5] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-[900px]:[--per:3.3] max-[520px]:[--per:2.2] motion-reduce:scroll-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {items.map((pg) => (
          <div key={pg.id} className="flex-[0_0_calc((100%-(var(--per)-1)*12px)/var(--per))] min-w-0 snap-start">
            <GameCard game={pg.game} unlockedCount={pg.unlocked_count} totalAchievements={pg.game.total_achievements} />
          </div>
        ))}
      </div>
    </section>
  )
}
