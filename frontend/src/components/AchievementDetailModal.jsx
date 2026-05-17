import { useState, useEffect } from 'react'
import { aiAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import RarityBadge from './RarityBadge'
import AchievementTipRenderer from './AchievementTipRenderer'
import { parseAchievementTip } from '../utils/achievementTipParser'
import {
  HiXMark, HiLockOpen, HiLockClosed, HiSparkles, HiArrowPath,
  HiTrophy, HiGlobeAlt, HiPlayCircle, HiBookOpen, HiLink,
} from 'react-icons/hi2'
import { SiYoutube } from 'react-icons/si'

export default function AchievementDetailModal({
  achievement,
  unlocked,
  unlockTime,
  isTracked,
  onClose,
  initialTip,       // cached tip from parent, persists across open/close
  onTipGenerated,   // callback(achievementId, tipMd) to save tip in parent
  game,             // game object for app_id + name (for resource links)
  dataSources,      // existing scraped sources for this game
}) {
  const { player } = useAuth()
  const [tipRaw, setTipRaw] = useState(initialTip || null)
  const [tipParsed, setTipParsed] = useState(initialTip ? parseAchievementTip(initialTip) : null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Load cached tip from localStorage on mount or when achievement/player changes
  useEffect(() => {
    if (!player || !achievement) return

    const cacheKey = `achievement-tip-${player.id}-${achievement.id}`
    const cachedTip = localStorage.getItem(cacheKey)

    if (cachedTip && !initialTip) {
      setTipRaw(cachedTip)
      setTipParsed(parseAchievementTip(cachedTip))
    }
  }, [player?.id, achievement?.id, initialTip])

  // Close on Escape key
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleGetTip() {
    setLoading(true)
    setError(null)
    try {
      const { data } = await aiAPI.getAchievementTip(achievement.id)
      setTipRaw(data.tip_md)
      setTipParsed(parseAchievementTip(data.tip_md))

      // Save to localStorage for persistence
      if (player) {
        const cacheKey = `achievement-tip-${player.id}-${achievement.id}`
        localStorage.setItem(cacheKey, data.tip_md)
      }

      onTipGenerated?.(achievement.id, data.tip_md)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate tip. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const iconSrc = unlocked
    ? achievement.icon_url
    : (achievement.icon_gray_url || achievement.icon_url)

  // Resource link helpers
  const ytQuery = encodeURIComponent(
    `${game?.name || ''} ${achievement.display_name} achievement guide`
  )
  const ytUrl = `https://www.youtube.com/results?search_query=${ytQuery}`
  const steamGuidesUrl = game?.app_id
    ? `https://steamcommunity.com/app/${game.app_id}/guides/?searchtext=${encodeURIComponent(achievement.display_name)}`
    : null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Centered dialog */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div 
          className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >

          {/* Sticky header */}
          <div className="bg-gray-900/95 backdrop-blur border-b border-gray-800 px-6 py-4 flex items-center justify-between shrink-0">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Achievement Detail</span>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-800"
            >
              <HiXMark className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1">

            {/* Achievement hero */}
            <div className={`px-6 py-6 flex items-start gap-5 border-b border-gray-800 ${
              unlocked ? 'bg-steam-blue/5' : 'bg-gray-900'
            }`}>
              {/* Icon */}
              <div className={`shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 ${
                unlocked ? 'border-steam-blue/40' : 'border-gray-700'
              } bg-gray-800 flex items-center justify-center`}>
                {iconSrc ? (
                  <img
                    src={iconSrc}
                    alt={achievement.display_name}
                    className={`w-full h-full object-cover ${!unlocked ? 'grayscale opacity-50' : ''}`}
                    onError={(e) => { e.target.src = ''; e.target.className = 'hidden' }}
                  />
                ) : (
                  <HiTrophy className={`w-10 h-10 ${unlocked ? 'text-steam-accent' : 'text-gray-600'}`} />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-white mb-1 leading-tight">{achievement.display_name}</h2>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <RarityBadge tier={achievement.rarity_tier} percent={achievement.global_percent} />
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${
                    unlocked
                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                      : 'bg-gray-700/30 text-gray-500 border-gray-700'
                  }`}>
                    {unlocked
                      ? <><HiLockOpen className="w-3 h-3" /> Unlocked</>
                      : <><HiLockClosed className="w-3 h-3" /> Locked</>
                    }
                  </span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {achievement.description || 'Hidden achievement — description not available.'}
                </p>
                {unlocked && unlockTime && (
                  <p className="text-xs text-steam-accent mt-2">
                    ✅ Unlocked on {new Date(unlockTime).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric'
                    })}
                  </p>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="px-6 py-3 flex items-center gap-6 border-b border-gray-800 bg-gray-900/60">
              <div className="flex items-center gap-2 text-sm">
                <HiGlobeAlt className="w-4 h-4 text-gray-500" />
                <span className="text-gray-400">Global unlock rate:</span>
                <span className="text-white font-semibold">{achievement.global_percent}%</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-400">Rarity:</span>{' '}
                <span className="text-white font-semibold capitalize">{achievement.rarity_tier?.replace('-', ' ')}</span>
              </div>
            </div>

            {/* AI Tip Section */}
            <div className="px-6 py-6">
              {!tipParsed && !loading && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                    <HiSparkles className="w-7 h-7 text-purple-400" />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-1">AI Achievement Guide</h3>
                  <p className="text-sm text-gray-500 mb-6 max-w-xs">
                    {isTracked
                      ? 'Get step-by-step AI instructions tailored to this achievement.'
                      : 'Track this game first to enable AI tips.'}
                  </p>
                  {isTracked && (
                    <button
                      onClick={handleGetTip}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 font-medium rounded-xl border border-purple-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <HiSparkles className="w-4 h-4" />
                      Get AI Tip
                    </button>
                  )}
                </div>
              )}

              {loading && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-10 h-10 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-purple-300 font-medium">Generating tip...</p>
                  <p className="text-xs text-gray-500 mt-1">This usually takes 5–15 seconds</p>
                </div>
              )}

              {error && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 mb-4">
                  <p className="text-sm text-red-400">{error}</p>
                  <button
                    onClick={handleGetTip}
                    className="mt-2 text-xs text-red-400 hover:text-red-300 underline flex items-center gap-1"
                  >
                    <HiArrowPath className="w-3 h-3" /> Try again
                  </button>
                </div>
              )}

              {tipParsed && (
                <div>
                  {/* AI guide header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <HiSparkles className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-semibold text-white">AI Guide</span>
                    </div>
                    <button
                      onClick={handleGetTip}
                      disabled={loading}
                      className="text-xs text-gray-500 hover:text-purple-400 transition-colors flex items-center gap-1 disabled:opacity-50"
                      title="Regenerate tip"
                    >
                      <HiArrowPath className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                      Regenerate
                    </button>
                  </div>

                  {/* Structured tip renderer */}
                  <AchievementTipRenderer parsedTip={tipParsed} />

                  {/* ── Resources section ── */}
                  <div className="mt-6 pt-5 border-t border-gray-800">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <HiLink className="w-3.5 h-3.5" />
                      Find More Resources
                    </h4>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {/* YouTube search */}
                      <a
                        href={ytUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 text-xs font-medium rounded-lg border border-red-500/20 transition-colors"
                      >
                        <SiYoutube className="w-4 h-4" />
                        Search on YouTube
                      </a>

                      {/* Steam Community Guides */}
                      {steamGuidesUrl && (
                        <a
                          href={steamGuidesUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-2 bg-steam-blue/10 hover:bg-steam-blue/20 text-steam-accent text-xs font-medium rounded-lg border border-steam-blue/20 transition-colors"
                        >
                          <HiBookOpen className="w-3.5 h-3.5" />
                          Steam Community Guides
                        </a>
                      )}
                    </div>

                    {/* Scraped data sources for this game */}
                    {dataSources?.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-gray-600 mb-2">Saved sources for this game:</p>
                        {dataSources.map((src) => (
                          <a
                            key={src.id}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 transition-colors group"
                          >
                            <HiLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-steam-accent shrink-0" />
                            <span className="text-xs text-gray-300 group-hover:text-white truncate">
                              {src.title || src.url}
                            </span>
                            <span className="text-xs text-gray-600 capitalize shrink-0">{src.source_type}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>{/* end scrollable */}
        </div>
      </div>
    </>
  )
}
