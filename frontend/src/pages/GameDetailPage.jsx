import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { gamesAPI, achievementsAPI, playerAchievementsAPI, playerGamesAPI, syncAPI, dataSourcesAPI, aiAPI } from '../services/api'
import Layout from '../components/Layout'
import AchievementCard from '../components/AchievementCard'
import AchievementDetailModal from '../components/AchievementDetailModal'
import ProgressBar from '../components/ProgressBar'
import ProgressRing from '../components/ProgressRing'
import {
  HiArrowPath, HiPlus, HiTrash, HiPencil, HiCheck, HiXMark,
  HiSparkles, HiEye, HiBookmark, HiBookmarkSlash,
} from 'react-icons/hi2'

export default function GameDetailPage() {
  const { gameId } = useParams()
  const { player } = useAuth()

  const [game, setGame] = useState(null)
  const [achievements, setAchievements] = useState([])
  const [playerAchs, setPlayerAchs] = useState([])
  const [playerGame, setPlayerGame] = useState(null)
  const [dataSources, setDataSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState('all') // all | locked | unlocked
  const [showAddSource, setShowAddSource] = useState(false)
  const [newSource, setNewSource] = useState({ url: '', title: '', source_type: 'other' })
  const [discovering, setDiscovering] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [selectedAchievement, setSelectedAchievement] = useState(null)
  const [tipCache, setTipCache] = useState({}) // achievement.id → tip_md

  useEffect(() => {
    loadData()
    // Restore filter from localStorage when game changes
    const savedFilter = localStorage.getItem(`game-${gameId}-filter`) || 'all'
    setFilter(savedFilter)
  }, [gameId])

  // Restore selected achievement from localStorage after data loads
  useEffect(() => {
    console.log('Restoration effect triggered. achievements:', achievements.length, 'playerAchs:', playerAchs.length)
    if (achievements.length > 0 && playerAchs.length > 0) {
      const savedAchievementId = localStorage.getItem(`game-${gameId}-selected-achievement`)
      console.log('Saved achievement ID from localStorage:', savedAchievementId)
      if (savedAchievementId) {
        const achId = parseInt(savedAchievementId)
        const ach = achievements.find(a => a.id === achId)
        console.log('Found achievement:', ach)
        if (ach) {
          const pa = playerAchs.find(pa => pa.achievement_id === achId)
          console.log('Restoring achievement:', achId, 'with player data:', pa)
          setSelectedAchievement({
            achievement: ach,
            unlocked: pa?.unlocked || false,
            unlockTime: pa?.unlock_time || null,
          })
        }
      }
    }
  }, [achievements, playerAchs, gameId])

  // Save selected achievement to localStorage whenever it changes
  useEffect(() => {
    if (selectedAchievement) {
      console.log('Saving effect - saving achievement:', selectedAchievement.achievement.id)
      localStorage.setItem(`game-${gameId}-selected-achievement`, selectedAchievement.achievement.id)
    }
    // Note: Don't clear localStorage here - only clear in onClose handler to prevent race conditions
  }, [selectedAchievement, gameId])

  // Save filter to localStorage whenever it changes
  useEffect(() => {
    console.log('Saving filter to localStorage:', filter)
    localStorage.setItem(`game-${gameId}-filter`, filter)
  }, [filter, gameId])

  async function loadData() {
    setLoading(true)
    try {
      const [gameRes, achRes] = await Promise.all([
        gamesAPI.get(gameId),
        achievementsAPI.list(gameId),
      ])
      setGame(gameRes.data)
      setAchievements(achRes.data)

      if (player) {
        const [paRes, pgRes, dsRes] = await Promise.all([
          playerAchievementsAPI.list(player.id, gameId),
          playerGamesAPI.list(player.id),
          dataSourcesAPI.list(gameId),
        ])
        setPlayerAchs(paRes.data)
        const pg = pgRes.data.find((p) => p.game_id === parseInt(gameId))
        setPlayerGame(pg || null)
        setDataSources(dsRes.data)
      }
    } catch (err) {
      console.error('Failed to load game data:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSyncAchievements() {
    if (!game) return
    setSyncing(true)
    try {
      await syncAPI.syncAchievements(game.app_id)
      await loadData()
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }

  async function handleToggleTrack() {
    if (!playerGame) return
    try {
      await playerGamesAPI.update(playerGame.id, { is_tracked: !playerGame.is_tracked })
      await loadData()
    } catch (err) {
      console.error('Toggle track failed:', err)
    }
  }

  async function handleAddSource(e) {
    e.preventDefault()
    if (!newSource.url) return
    try {
      await dataSourcesAPI.create({ ...newSource, game_id: parseInt(gameId) })
      setNewSource({ url: '', title: '', source_type: 'other' })
      setShowAddSource(false)
      const { data } = await dataSourcesAPI.list(gameId)
      setDataSources(data)
    } catch (err) {
      console.error('Failed to add source:', err)
    }
  }

  async function handleDeleteSource(sourceId) {
    try {
      await dataSourcesAPI.delete(sourceId)
      setDataSources((prev) => prev.filter((s) => s.id !== sourceId))
    } catch (err) {
      console.error('Failed to delete source:', err)
    }
  }

  async function handleAutoDiscover() {
    setDiscovering(true)
    try {
      const { data } = await dataSourcesAPI.autoDiscover(gameId)
      setDataSources(data.sources || [])
    } catch (err) {
      console.error('Auto-discover failed:', err)
    } finally {
      setDiscovering(false)
    }
  }

  async function handleScrapeSource(sourceId) {
    try {
      await dataSourcesAPI.scrape(sourceId)
      const { data } = await dataSourcesAPI.list(gameId)
      setDataSources(data)
    } catch (err) {
      console.error('Scrape failed:', err)
    }
  }

  async function handleGenerateAI() {
    setGenerating(true)
    try {
      await aiAPI.generate(gameId)
    } catch (err) {
      console.error('AI generation failed:', err)
    } finally {
      setGenerating(false)
    }
  }

  // Build lookup for player achievement status
  const paMap = {}
  playerAchs.forEach((pa) => { paMap[pa.achievement_id] = pa })

  const unlockedCount = playerAchs.filter((pa) => pa.unlocked).length
  const totalCount = achievements.length

  // Filter achievements
  const filtered = achievements.filter((ach) => {
    if (filter === 'unlocked') return paMap[ach.id]?.unlocked
    if (filter === 'locked') return !paMap[ach.id]?.unlocked
    return true
  })

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <div className="animate-spin w-8 h-8 border-2 border-steam-accent border-t-transparent rounded-full" />
        </div>
      </Layout>
    )
  }

  if (!game) {
    return (
      <Layout>
        <div className="text-center py-32">
          <p className="text-gray-500">Game not found</p>
          <Link to="/dashboard" className="text-steam-accent text-sm mt-2 inline-block">Back to Dashboard</Link>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* Game Header */}
      <div className="bg-surface-light rounded-xl border border-gray-800 overflow-hidden mb-6">
        {game.img_capsule_url && (
          <div className="h-48 overflow-hidden">
            <img src={game.img_capsule_url} alt={game.name} className="w-full h-full object-cover opacity-60" />
          </div>
        )}
        <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white mb-1">{game.name}</h1>
            <p className="text-sm text-gray-400">
              App ID: {game.app_id} · {totalCount} achievements
              {playerGame && ` · ${playerGame.playtime_hours}h played`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {playerGame && (
              <button
                onClick={handleToggleTrack}
                className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
                  playerGame.is_tracked
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-surface border-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                {playerGame.is_tracked ? <HiBookmarkSlash className="w-4 h-4" /> : <HiBookmark className="w-4 h-4" />}
                {playerGame.is_tracked ? 'Untrack' : 'Track'}
              </button>
            )}
            <button
              onClick={handleSyncAchievements}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-3 py-2 bg-steam-blue/10 hover:bg-steam-blue/20 text-steam-accent text-sm rounded-lg border border-steam-blue/20 transition-colors disabled:opacity-50"
            >
              <HiArrowPath className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main: Achievements List */}
        <div className="lg:col-span-2">
          {/* Progress + Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
            <div className="flex-1 w-full sm:w-auto">
              <ProgressBar value={unlockedCount} max={totalCount} />
            </div>
            <div className="flex gap-1 bg-surface rounded-lg p-1 border border-gray-800">
              {['all', 'locked', 'unlocked'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                    filter === f
                      ? 'bg-steam-blue/20 text-steam-accent'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {f} {f === 'unlocked' ? `(${unlockedCount})` : f === 'locked' ? `(${totalCount - unlockedCount})` : `(${totalCount})`}
                </button>
              ))}
            </div>
          </div>

          {/* Achievement List */}
          <div className="space-y-2">
            {filtered.length > 0 ? (
              filtered.map((ach) => (
                <AchievementCard
                  key={ach.id}
                  achievement={ach}
                  unlocked={paMap[ach.id]?.unlocked || false}
                  unlockTime={paMap[ach.id]?.unlock_time}
                  onClick={() => {
                    const selectedAch = {
                      achievement: ach,
                      unlocked: paMap[ach.id]?.unlocked || false,
                      unlockTime: paMap[ach.id]?.unlock_time || null,
                    }
                    console.log('Achievement clicked, saving to localStorage:', ach.id)
                    localStorage.setItem(`game-${gameId}-selected-achievement`, ach.id)
                    setSelectedAchievement(selectedAch)
                  }}
                />
              ))
            ) : (
              <div className="bg-surface-light rounded-xl border border-gray-800 p-8 text-center">
                <p className="text-gray-500 text-sm">
                  {totalCount === 0
                    ? 'Click "Sync" to load achievements from Steam'
                    : 'No achievements match this filter'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Completion Ring */}
          <div className="bg-surface-light rounded-xl border border-gray-800 p-6 flex flex-col items-center">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Completion</h3>
            <ProgressRing value={unlockedCount} max={Math.max(totalCount, 1)} size={130} />
          </div>

          {/* Rarity Breakdown */}
          {achievements.length > 0 && (
            <div className="bg-surface-light rounded-xl border border-gray-800 p-6">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Rarity Breakdown</h3>
              <div className="space-y-2">
                {[
                   { tier: 'common',    label: 'Common (30%+)',    color: 'bg-gray-500' },
                   { tier: 'uncommon',  label: 'Uncommon (<30%)',  color: 'bg-blue-500' },
                   { tier: 'rare',      label: 'Rare (<15%)',      color: 'bg-amber-500' },
                   { tier: 'ultra-rare',label: 'Ultra Rare (<5%)', color: 'bg-purple-500' },
                ].map(({ tier, label, color }) => {
                  const count = achievements.filter((a) => a.rarity_tier === tier).length
                  return (
                    <div key={tier} className="flex items-center gap-2 text-sm">
                      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                      <span className="text-gray-400 flex-1">{label}</span>
                      <span className="text-white font-medium">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Data Sources */}
          <div className="bg-surface-light rounded-xl border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-400">Data Sources</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAutoDiscover}
                  disabled={discovering}
                  className="text-xs text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-50"
                  title="Auto-discover guides"
                >
                  {discovering ? <HiArrowPath className="w-3.5 h-3.5 animate-spin" /> : 'Discover'}
                </button>
                <button
                  onClick={() => setShowAddSource(!showAddSource)}
                  className="text-steam-accent hover:text-white transition-colors"
                >
                  {showAddSource ? <HiXMark className="w-4 h-4" /> : <HiPlus className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {showAddSource && (
              <form onSubmit={handleAddSource} className="mb-4 space-y-2">
                <input
                  type="url"
                  placeholder="URL"
                  value={newSource.url}
                  onChange={(e) => setNewSource((s) => ({ ...s, url: e.target.value }))}
                  required
                  className="w-full px-3 py-2 bg-surface border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-steam-blue"
                />
                <input
                  type="text"
                  placeholder="Title (optional)"
                  value={newSource.title}
                  onChange={(e) => setNewSource((s) => ({ ...s, title: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-steam-blue"
                />
                <select
                  value={newSource.source_type}
                  onChange={(e) => setNewSource((s) => ({ ...s, source_type: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-steam-blue"
                >
                  <option value="wiki">Wiki</option>
                  <option value="article">Article</option>
                  <option value="blog">Blog</option>
                  <option value="youtube">YouTube</option>
                  <option value="other">Other</option>
                </select>
                <button
                  type="submit"
                  className="w-full px-3 py-2 bg-steam-blue/20 hover:bg-steam-blue/30 text-steam-accent text-sm rounded-lg border border-steam-blue/20 transition-colors"
                >
                  Add Source
                </button>
              </form>
            )}

            {dataSources.length > 0 ? (
              <div className="space-y-2">
                {dataSources.map((source) => (
                  <div key={source.id} className="flex items-start gap-2 group">
                    <div className="flex-1 min-w-0">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-steam-accent hover:text-white transition-colors truncate block"
                      >
                        {source.title || source.url}
                      </a>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-600 uppercase">{source.source_type}</span>
                        {source.has_content && (
                          <span className="text-[10px] text-green-500">● scraped</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-0.5">
                      {!source.has_content && (
                        <button
                          onClick={() => handleScrapeSource(source.id)}
                          className="text-gray-500 hover:text-steam-accent transition-colors"
                          title="Scrape content"
                        >
                          <HiArrowPath className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteSource(source.id)}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <HiTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600">No sources yet. Add guides, wikis, or videos.</p>
            )}
          </div>
        </div>
      </div>

      {/* Achievement Detail Modal */}
      {selectedAchievement && (
        <AchievementDetailModal
          achievement={selectedAchievement.achievement}
          unlocked={selectedAchievement.unlocked}
          unlockTime={selectedAchievement.unlockTime}
          isTracked={playerGame?.is_tracked || false}
          onClose={() => {
            console.log('Modal closed, clearing localStorage')
            localStorage.removeItem(`game-${gameId}-selected-achievement`)
            setSelectedAchievement(null)
          }}
          initialTip={tipCache[selectedAchievement.achievement.id] || null}
          onTipGenerated={(achId, tipMd) =>
            setTipCache((prev) => ({ ...prev, [achId]: tipMd }))
          }
          game={game}
          dataSources={dataSources}
        />
      )}
    </Layout>
  )
}
