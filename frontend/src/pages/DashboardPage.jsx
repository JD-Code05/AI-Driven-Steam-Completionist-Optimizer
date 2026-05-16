import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { syncAPI, playerGamesAPI, playerAchievementsAPI } from '../services/api'
import Layout from '../components/Layout'
import GameCard from '../components/GameCard'
import ProgressRing from '../components/ProgressRing'
import AchievementCard from '../components/AchievementCard'
import { HiArrowPath, HiTrophy, HiCpuChip, HiSparkles } from 'react-icons/hi2'
import { Link } from 'react-router-dom'

export default function DashboardPage() {
  const { player } = useAuth()
  const [playerGames, setPlayerGames] = useState([])
  const [recentAchievements, setRecentAchievements] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showAllGames, setShowAllGames] = useState(false)

  useEffect(() => {
    if (player) loadData()
  }, [player])

  async function loadData() {
    setLoading(true)
    try {
      const { data: pgData } = await playerGamesAPI.list(player.id)

      // Fetch achievements for all games concurrently
      const playerAchievementsPromises = pgData.map(async (pg) => {
        if (pg.game?.id) {
          const { data: paData } = await playerAchievementsAPI.list(player.id, pg.game.id)
          return { gameId: pg.game.id, unlockedCount: paData.filter((pa) => pa.unlocked).length }
        }
        return { gameId: pg.game?.id, unlockedCount: 0 }
      })

      const allPlayerAchievements = await Promise.all(playerAchievementsPromises)
      const achievementMap = new Map(allPlayerAchievements.map(item => [item.gameId, item.unlockedCount]));

      const playerGamesWithAchievements = pgData.map(pg => ({
        ...pg,
        unlockedCount: achievementMap.get(pg.game?.id) || 0,
        totalAchievements: pg.game?.total_achievements || 0,
      }))

      setPlayerGames(playerGamesWithAchievements)

      // Load recent achievements from ALL tracked games
      // Run all fetches in parallel, then take the 3 most recent per game
      // so no single game crowds out the others in the combined sorted list
      const tracked = pgData.filter((pg) => pg.is_tracked)
      const perGameResults = await Promise.all(
        tracked.map(async (pg) => {
          if (!pg.game?.id) return []
          try {
            const { data: paData } = await playerAchievementsAPI.list(player.id, pg.game.id)
            return paData
              .filter((pa) => pa.unlocked && pa.unlock_time)
              .sort((a, b) => new Date(b.unlock_time) - new Date(a.unlock_time))
              .slice(0, 3) // cap per game so one active game can't dominate
              .map((pa) => ({ ...pa, game_name: pg.game?.name }))
          } catch {
            return []
          }
        })
      )
      const recentAchs = perGameResults
        .flat()
        .sort((a, b) => new Date(b.unlock_time) - new Date(a.unlock_time))
      setRecentAchievements(recentAchs.slice(0, 8))
    } catch (err) {
      console.error('Failed to load dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await syncAPI.syncGames()
      await loadData()
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }

  // Calculate stats
  const trackedGames = playerGames.filter((pg) => pg.is_tracked)
  const totalGames = playerGames.length
  const totalPlaytime = playerGames.reduce((sum, pg) => sum + (pg.playtime_hours || 0), 0)

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <div className="animate-spin w-8 h-8 border-2 border-steam-accent border-t-transparent rounded-full" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* ===== Z-PATTERN LAYOUT ===== */}

      {/* ROW 1: Profile (left) + Completion Summary (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Top-left: Player Profile */}
        <div className="lg:col-span-2 bg-surface-light rounded-xl border border-gray-800 p-6">
          <div className="flex items-center gap-4 mb-4">
            <img
              src={player.avatar_url}
              alt={player.persona_name}
              className="w-16 h-16 rounded-xl border-2 border-steam-blue/30"
            />
            <div>
              <h1 className="text-2xl font-bold text-white">{player.persona_name}</h1>
              <p className="text-sm text-gray-400">
                {totalGames} games · {Math.round(totalPlaytime)}h played · {trackedGames.length} tracked
              </p>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 bg-steam-blue/10 hover:bg-steam-blue/20 text-steam-accent text-sm font-medium rounded-lg border border-steam-blue/20 transition-colors disabled:opacity-50"
            >
              <HiArrowPath className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Steam'}
            </button>
          </div>

          {/* Quick stats row */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setShowAllGames(true)}
              className="bg-surface rounded-lg p-3 border border-gray-800/50 hover:border-steam-blue/30 transition-colors cursor-pointer"
            >
              <div className="text-lg mb-1 text-amber-400"><HiTrophy /></div>
              <p className="text-xl font-bold text-white text-left">{totalGames}</p>
              <p className="text-xs text-gray-500 text-left">Games Owned</p>
            </button>
            <StatCard icon={<HiSparkles />} label="Tracked" value={trackedGames.length} color="text-blue-400" />
            <StatCard icon={<HiCpuChip />} label="Total Hours" value={Math.round(totalPlaytime)} color="text-purple-400" />
          </div>
        </div>

        {/* Top-right: Overall Completion */}
        <div className="bg-surface-light rounded-xl border border-gray-800 p-6 flex flex-col items-center justify-center">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Overall Completion</h2>
          <ProgressRing
            value={trackedGames.length}
            max={Math.max(totalGames, 1)}
            size={140}
          />
          <p className="text-xs text-gray-500 mt-3">Games Being Tracked</p>
        </div>
      </div>

      {/* ROW 2 (diagonal): Tracked Games Grid */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            {trackedGames.length > 0 ? 'Tracked Games' : 'Your Games'}
          </h2>
          {totalGames === 0 && (
            <p className="text-sm text-gray-500">Click "Sync Steam" to load your games</p>
          )}
        </div>

        {(trackedGames.length > 0 ? trackedGames : playerGames.slice(0, 12)).length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {(trackedGames.length > 0 ? trackedGames : playerGames.slice(0, 12)).map((pg) => (
              <GameCard
                key={pg.id}
                game={pg.game}
                playerGame={pg}
                unlockedCount={pg.unlockedCount}
                totalAchievements={pg.totalAchievements}
              />
            ))}
          </div>
        ) : (
          <div className="bg-surface-light rounded-xl border border-gray-800 p-12 text-center">
            <HiTrophy className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500">No games yet. Sync your Steam library to get started.</p>
          </div>
        )}
      </div>

      {/* ROW 3: Recent Achievements (left) + AI CTA (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bottom-left: Recent Achievements Timeline */}
        <div className="lg:col-span-2 bg-surface-light rounded-xl border border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Achievements</h2>
          {recentAchievements.length > 0 ? (
            <div className="space-y-2">
              {recentAchievements.map((pa) => (
                <div key={pa.id} className="relative">
                  {pa.game_name && (
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider">{pa.game_name}</span>
                  )}
                  <AchievementCard
                    achievement={pa.achievement}
                    unlocked={pa.unlocked}
                    unlockTime={pa.unlock_time}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">
                {trackedGames.length > 0
                  ? 'Sync achievements from a game to see them here'
                  : 'Track games and sync achievements to see recent unlocks'}
              </p>
            </div>
          )}
        </div>

        {/* Bottom-right: AI Optimization CTA */}
        <div className="bg-gradient-to-br from-purple-900/20 to-steam-dark rounded-xl border border-purple-500/20 p-6 flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/10 rounded-full border border-purple-500/20 mb-4">
              <HiCpuChip className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-medium text-purple-400">AI Powered</span>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Achievement Optimizer</h2>
            <p className="text-sm text-gray-400 mb-6">
              Get AI-generated optimization routes tailored to your progress. Find the fastest path to 100% completion.
            </p>
          </div>
          {trackedGames.length > 0 ? (
            <Link
              to={`/games/${trackedGames[0]?.game?.id}`}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 font-medium rounded-lg transition-colors text-sm"
            >
              <HiSparkles className="w-4 h-4" />
              Optimize a Game
            </Link>
          ) : (
            <p className="text-xs text-gray-600">Track a game to enable AI optimization</p>
          )}
        </div>
      </div>

      {/* Modal: All Games */}
      {showAllGames && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-light rounded-xl border border-gray-800 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-surface-light border-b border-gray-800 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">All Games ({playerGames.length})</h2>
              <button
                onClick={() => setShowAllGames(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Games Grid */}
            <div className="p-6">
              {playerGames.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {playerGames.map((pg) => (
                    <GameCard
                      key={pg.id}
                      game={pg.game}
                      playerGame={pg}
                      unlockedCount={pg.unlockedCount}
                      totalAchievements={pg.totalAchievements}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <HiTrophy className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                  <p className="text-gray-500">No games found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className="bg-surface rounded-lg p-3 border border-gray-800/50">
      <div className={`text-lg mb-1 ${color}`}>{icon}</div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}
