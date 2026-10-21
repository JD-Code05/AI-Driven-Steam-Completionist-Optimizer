import { useState, useEffect, useRef } from 'react'
import { HiXMark } from 'react-icons/hi2'
import { aiAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import RarityBadge from './RarityBadge'
import ProgressBar from './ProgressBar'
import AchievementTipRenderer from './AchievementTipRenderer'
import { parseAchievementTip } from '../utils/achievementTipParser'
import { formatDate } from '../utils/format'

const focusCls = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const inkBtn = `cursor-pointer rounded-[7px] bg-ink px-3.5 py-2 text-[13px] font-semibold text-on-ink transition-transform duration-[120ms] ease-[var(--ease-out)] active:scale-[.97] motion-reduce:transition-none ${focusCls}`
const linkBtn = `cursor-pointer text-xs text-muted underline underline-offset-[3px] ${focusCls}`
const tipKey = (playerId, achievementId) => `achievement-tip-${playerId}-${achievementId}`

export default function AchievementPanel({ achievement, unlocked, unlockTime, game, open, onClose }) {
  const ref = useRef(null)
  const { player } = useAuth()
  const [guide, setGuide] = useState({ status: 'empty' }) // empty | loading | error | ready
  const currentId = useRef(null)
  const [iconFailed, setIconFailed] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (open && !d.open) d.showModal() // native modal: focus trap, inert background, Escape
    if (!open && d.open) d.close()
  }, [open])

  useEffect(() => {
    currentId.current = achievement?.id
    setIconFailed(false)
    if (!achievement || !player) return
    const md = localStorage.getItem(tipKey(player.id, achievement.id))
    setGuide(md ? { status: 'ready', tip: parseAchievementTip(md) } : { status: 'empty' })
  }, [achievement?.id, player?.id])

  // Slide out, then close for real; the 400ms timer covers a missed transitionend.
  function requestClose() {
    const d = ref.current
    if (!d.open || d.classList.contains('closing')) return
    d.classList.add('closing')
    const onEnd = (e) => { if (e.target === d && !e.pseudoElement) done() }
    const timer = setTimeout(done, 400)
    function done() {
      clearTimeout(timer)
      d.removeEventListener('transitionend', onEnd)
      d.classList.remove('closing')
      d.close()
    }
    d.addEventListener('transitionend', onEnd)
  }

  async function writeGuide() {
    const id = achievement.id
    setGuide({ status: 'loading' })
    try {
      const { data } = await aiAPI.getAchievementTip(id)
      if (currentId.current === id) setGuide({ status: 'ready', tip: parseAchievementTip(data.tip_md) })
      try { localStorage.setItem(tipKey(player.id, id), data.tip_md) } catch { /* storage full or blocked: the guide still shows */ }
    } catch (err) {
      const message = typeof err.response?.data?.error === 'string' ? err.response.data.error : "Couldn't write a guide right now."
      if (currentId.current === id) setGuide({ status: 'error', message })
    }
  }

  const a = achievement
  const iconSrc = a && (unlocked ? a.icon_url : (a.icon_gray_url || a.icon_url))
  const pct = Number(a?.global_percent ?? 0)

  return (
    <dialog
      ref={ref}
      aria-labelledby="ach-panel-title"
      className="ach-panel"
      onCancel={(e) => { e.preventDefault(); requestClose() }}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) requestClose() }} // backdrop click
    >
      {a && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <span className="truncate text-xs text-muted">{game?.name}</span>
            <button
              type="button"
              aria-label="Close"
              onClick={requestClose}
              className={`grid size-8 flex-none cursor-pointer place-items-center rounded-[7px] text-muted transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-hover [@media(hover:hover)_and_(pointer:fine)]:hover:text-text ${focusCls}`}
            >
              <HiXMark className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-7">
            <div className="flex items-start gap-3.5">
              <span className={`grid size-16 flex-none place-items-center overflow-hidden rounded-[10px] bg-track text-lg font-bold text-muted ${unlocked ? '' : 'opacity-50'}`}>
                {iconSrc && !iconFailed
                  ? <img src={iconSrc} alt="" className="size-full object-cover" onError={() => setIconFailed(true)} />
                  : (a.display_name?.[0] || '?')}
              </span>
              <div className="min-w-0">
                <h2 id="ach-panel-title" className="mb-1.5 text-xl font-semibold leading-tight tracking-[-0.02em]">{a.display_name}</h2>
                <div className="flex flex-wrap gap-1.5">
                  <RarityBadge tier={a.rarity_tier} />
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${unlocked ? 'bg-uncommon-bg text-uncommon' : 'bg-track text-muted'}`}>
                    {unlocked ? (unlockTime ? `Unlocked ${formatDate(unlockTime)}` : 'Unlocked') : 'Locked'}
                  </span>
                </div>
                <p className="mt-2 text-muted">{a.description || 'Hidden achievement'}</p>
              </div>
            </div>

            <div className="mt-[18px] mb-[22px] rounded-[10px] border border-border px-3.5 py-3">
              <b className="text-lg">{pct.toFixed(1)}%</b>{' '}
              <span className="text-[13px] text-muted">of {game?.name} players have this</span>
              <div className="mt-2"><ProgressBar value={pct} max={100} tone="ultra" /></div>
            </div>

            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold">Guide</h3>
              {guide.status === 'ready' && <button type="button" onClick={writeGuide} className={linkBtn}>Rewrite</button>}
            </div>

            {guide.status === 'empty' && (
              <div className="rounded-[10px] border border-dashed border-border-strong p-5 text-center">
                <b>No guide yet</b>
                <p className="mt-1.5 mb-3.5 text-[13px] text-muted">Gemini writes a step-by-step guide for this achievement.</p>
                <button type="button" onClick={writeGuide} className={inkBtn}>Write a guide</button>
              </div>
            )}

            {guide.status === 'loading' && (
              <div role="status">
                <p className="mb-4 text-xs text-muted">Writing your guide…</p>
                {[92, 78, 85, 60].map((w) => <div key={w} className="skel" style={{ width: `${w}%` }} />)}
              </div>
            )}

            {guide.status === 'error' && (
              <div role="alert" className="rounded-[10px] border border-border p-4">
                <p className="mb-3 text-[13px] text-muted">{guide.message}</p>
                <button type="button" onClick={writeGuide} className={inkBtn}>Try again</button>
              </div>
            )}

            {guide.status === 'ready' && (
              <>
                <p className="mb-4 text-xs text-muted">
                  {game?.app_id === 413150 ? 'Based on the Stardew Valley Wiki. Written by Gemini.' : 'Written by Gemini.'}
                </p>
                <AchievementTipRenderer parsedTip={guide.tip} />
                <div className="flex gap-4 border-t border-border pt-3.5 text-[13px]">
                  <a
                    href={`https://steamcommunity.com/app/${game?.app_id}/guides/?searchtext=${encodeURIComponent(a.display_name)}`}
                    target="_blank" rel="noopener noreferrer" className={`text-muted underline ${focusCls}`}
                  >
                    Steam guides for this
                  </a>
                  <a
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${game?.name} ${a.display_name} Guide How to`)}`}
                    target="_blank" rel="noopener noreferrer" className={`text-muted underline ${focusCls}`}
                  >
                    Search YouTube
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </dialog>
  )
}
