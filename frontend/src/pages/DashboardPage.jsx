import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { syncAPI, playerGamesAPI, playerAchievementsAPI } from '../services/api'
import Layout from '../components/Layout'
import GameCard from '../components/GameCard'
import GameCarousel from '../components/GameCarousel'
import AchievementRow from '../components/AchievementRow'
import ProgressBar from '../components/ProgressBar'
import { dashboardStats, inProgress, perfectGames } from '../utils/stats'
import { timeAgo } from '../utils/format'

const PRIVATE_MESSAGE = 'No games found or profile is private'
const focusCls = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const secondaryBtn = `cursor-pointer rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-hover ${focusCls}`

export default function DashboardPage() {
  const { player } = useAuth()
  const [playerGames, setPlayerGames] = useState([])
  const [recent, setRecent] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [notice, setNotice] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    if (player) loadData()
  }, [player])

  async function loadData() {
    setLoading(true)
    setLoadFailed(false)
    try {
      const { data: pgData } = await playerGamesAPI.list()
      setPlayerGames(pgData)

      // Top 3 unlocks per tracked game so one busy game can't dominate, then the overall top 8.
      const perGame = await Promise.all(
        pgData.filter((pg) => pg.is_tracked && pg.game?.id).map(async (pg) => {
          try {
            const { data } = await playerAchievementsAPI.list(pg.game.id)
            return data
              .filter((pa) => pa.unlocked && pa.unlock_time)
              .sort((a, b) => new Date(b.unlock_time) - new Date(a.unlock_time))
              .slice(0, 3)
              .map((pa) => ({ ...pa, game_name: pg.game.name }))
          } catch {
            return []
          }
        })
      )
      setRecent(perGame.flat().sort((a, b) => new Date(b.unlock_time) - new Date(a.unlock_time)).slice(0, 8))
    } catch (err) {
      console.error('Failed to load dashboard data:', err)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setNotice('')
    try {
      const { data } = await syncAPI.syncGames()
      if (data?.message === PRIVATE_MESSAGE) {
        setNotice("Steam returned no games. Make sure your game details are public in Steam's privacy settings.")
      }
      await loadData()
    } catch (err) {
      console.error('Sync failed:', err)
      setNotice('Sync failed. Try again.')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <Layout>
        <p className="py-32 text-center text-muted" role="status">Loading…</p>
      </Layout>
    )
  }

  const stats = dashboardStats(playerGames)
  const carouselItems = inProgress(playerGames)
  const perfect = perfectGames(playerGames)
  const cells = [
    { value: stats.owned.toLocaleString(), label: 'Games owned' },
    { value: `${Math.round(stats.hours).toLocaleString()} h`, label: 'Played' },
    { value: `${stats.unlockedPct}%`, label: 'Achievements unlocked', bar: true },
    { value: stats.perfect.toLocaleString(), label: 'Perfect games', href: perfect.length ? '#perfect-games' : undefined },
  ]
  const allGamesBtn = (
    <button type="button" onClick={() => setShowAll(true)} className={secondaryBtn}>All games</button>
  )

  return (
    <Layout>
      <div className="mb-6 flex items-end gap-4">
        <img src={player.avatar_url} alt="" className="size-14 flex-none rounded-[10px] bg-border-strong" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-[-0.02em]">{player.persona_name}</h1>
          <p className="mt-0.5 text-muted">
            {stats.lastSynced ? `Synced ${timeAgo(stats.lastSynced)}` : 'Not synced yet'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className={`ml-auto flex-none cursor-pointer rounded-[7px] bg-ink px-3.5 py-2 text-[13px] font-semibold text-on-ink transition-transform duration-[120ms] ease-[var(--ease-out)] enabled:active:scale-[.97] disabled:opacity-60 motion-reduce:transition-none ${focusCls}`}
        >
          {syncing ? 'Syncing…' : 'Sync Steam'}
        </button>
      </div>

      {notice && (
        <p role="status" className="mb-6 rounded-lg bg-warn-bg px-3.5 py-2.5 text-warn">{notice}</p>
      )}

      {loadFailed && (
        <p role="alert" className="mb-6 rounded-lg bg-warn-bg px-3.5 py-2.5 text-warn">Couldn't load your games. Try again.</p>
      )}

      {playerGames.length === 0 ? (
        !notice && !loadFailed && <p className="py-12 text-center text-muted">Sync your Steam library to get started.</p>
      ) : (
        <>
          <div className="mb-7 grid grid-cols-4 rounded-[10px] border border-border bg-surface max-[640px]:grid-cols-2">
            {cells.map((c) => {
              const Cell = c.href ? 'a' : 'div'
              return (
                <Cell
                  key={c.label}
                  href={c.href}
                  aria-label={c.href && `${c.value} ${c.label}`}
                  className={`border-l border-border px-4 py-3.5 first:border-l-0 max-[640px]:nth-3:border-l-0 max-[640px]:nth-[n+3]:border-t ${c.href ? `transition-colors duration-150 hover:bg-hover motion-reduce:transition-none ${focusCls}` : ''}`}
                >
                  <div className="text-[22px] font-semibold tracking-[-0.02em]">{c.value}</div>
                  <div className="text-xs text-muted">{c.label}</div>
                  {c.bar && <div className="mt-2"><ProgressBar value={stats.unlockedPct} max={100} /></div>}
                </Cell>
              )
            })}
          </div>

          {perfect.length > 0 && (
            <GameCarousel
              id="perfect-games"
              items={perfect}
              title={<>Perfect games <span className="ml-1 text-ultra">{perfect.length}</span></>}
            />
          )}

          {carouselItems.length > 0 ? (
            <GameCarousel items={carouselItems}>{allGamesBtn}</GameCarousel>
          ) : (
            <div className="mb-7">
              <div className="mb-2.5 flex items-center justify-between">
                <h2 className="text-[13px] font-semibold text-muted">In progress</h2>
                {allGamesBtn}
              </div>
              <p className="text-muted">Open a game and press Sync to load its achievements, or Track it to keep it here.</p>
            </div>
          )}

          <section>
            <h2 className="mb-2.5 text-[13px] font-semibold text-muted">Recently unlocked</h2>
            {recent.length > 0 ? (
              <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
                {recent.map((pa) => (
                  <AchievementRow
                    key={pa.id}
                    achievement={pa.achievement}
                    unlocked={pa.unlocked}
                    unlockTime={pa.unlock_time}
                    gameName={pa.game_name}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted">Unlocks from your tracked games show up here.</p>
            )}
          </section>
        </>
      )}

      {showAll && <AllGamesDialog playerGames={playerGames} onClose={() => setShowAll(false)} />}
    </Layout>
  )
}

function AllGamesDialog({ playerGames, onClose }) {
  const ref = useRef(null)
  useEffect(() => { ref.current.showModal() }, []) // native modal: focus trap, Escape, inert background

  return (
    <dialog
      ref={ref}
      aria-labelledby="all-games-title"
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }} // backdrop click
      className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-[1100px] overflow-y-auto rounded-[10px] border border-border bg-surface p-0 text-text backdrop:bg-scrim"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-3.5">
        <h2 id="all-games-title" className="text-[15px] font-semibold">All games ({playerGames.length})</h2>
        <button type="button" onClick={() => ref.current.close()} className={secondaryBtn}>Close</button>
      </div>
      <div className="grid grid-cols-5 gap-4 p-5 max-[900px]:grid-cols-4 max-[700px]:grid-cols-3 max-[520px]:grid-cols-2">
        {playerGames.map((pg) => (
          <GameCard key={pg.id} game={pg.game} unlockedCount={pg.unlocked_count} totalAchievements={pg.game.total_achievements} />
        ))}
      </div>
    </dialog>
  )
}
