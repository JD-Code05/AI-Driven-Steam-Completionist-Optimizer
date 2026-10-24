import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { HiArrowPath, HiBookmark, HiOutlineBookmark } from 'react-icons/hi2'
import { gamesAPI, achievementsAPI, playerAchievementsAPI, playerGamesAPI, syncAPI } from '../services/api'
import Layout from '../components/Layout'
import AchievementRow from '../components/AchievementRow'
import AchievementPanel from '../components/AchievementPanel'
import GuidesCard from '../components/GuidesCard'
import ProgressBar from '../components/ProgressBar'
import { rarityBreakdown } from '../utils/stats'
import { timeAgo } from '../utils/format'

const focusCls = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const btn = `inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] border px-3.5 py-2 text-[13px] font-semibold transition-[transform,background-color] duration-[120ms,150ms] ease-[var(--ease-out)] enabled:active:scale-[.97] disabled:opacity-60 motion-reduce:transition-none ${focusCls}`
const control = 'rounded-lg border border-border-strong bg-surface text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink'
const tiers = [
  ['ultra-rare', 'Ultra rare', 'ultra'],
  ['rare', 'Rare', 'rare'],
  ['uncommon', 'Uncommon', 'uncommon'],
  ['common', 'Common', 'common'],
]
const tierText = { ultra: 'text-ultra', rare: 'text-rare', uncommon: 'text-uncommon', common: 'text-common' }
const sorts = {
  rare: (a, b) => a.global_percent - b.global_percent,
  easy: (a, b) => b.global_percent - a.global_percent,
  recent: (a, b) => (Date.parse(b.pa?.unlock_time) || 0) - (Date.parse(a.pa?.unlock_time) || 0),
}

export default function GameDetailPage() {
  const { gameId } = useParams()
  const filterKey = `game-${gameId}-filter`
  const selectedKey = `game-${gameId}-selected-achievement`

  const [game, setGame] = useState(null)
  const [achievements, setAchievements] = useState([])
  const [playerAchs, setPlayerAchs] = useState([])
  const [playerGame, setPlayerGame] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('rare')
  const [selectedId, setSelectedId] = useState(null)
  const [heroIdx, setHeroIdx] = useState(0)

  useEffect(() => {
    // drop the previous game's data so a failed load can't show it under the new URL
    setGame(null)
    setAchievements([])
    setPlayerAchs([])
    setPlayerGame(null)
    setNotice('')
    setLoading(true)
    setFilter(localStorage.getItem(filterKey) || 'all')
    setSelectedId(null)
    setHeroIdx(0)
    loadData(true)
  }, [gameId])

  async function loadData(restoreSelection = false) {
    setNotFound(false)
    try {
      const [gameRes, achRes, paRes, pgRes] = await Promise.all([
        gamesAPI.get(gameId),
        achievementsAPI.list(gameId),
        playerAchievementsAPI.list(gameId),
        playerGamesAPI.list(),
      ])
      setGame(gameRes.data)
      setAchievements(achRes.data)
      setPlayerAchs(paRes.data)
      setPlayerGame(pgRes.data.find((pg) => pg.game_id === Number(gameId)) || null)
      if (restoreSelection) {
        const saved = Number(localStorage.getItem(selectedKey))
        if (achRes.data.some((a) => a.id === saved)) setSelectedId(saved)
      }
    } catch (err) {
      if (err.response?.status === 404) { setGame(null); setNotFound(true) }
      else setNotice("Couldn't load this game. Try again.")
    } finally {
      setLoading(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setNotice('')
    try {
      const { data } = await syncAPI.syncAchievements(game.app_id)
      await loadData()
      if (data?.synced === 0 && data.message) setNotice(data.message)
    } catch {
      setNotice('Sync failed. Try again.')
    } finally {
      setSyncing(false)
    }
  }

  async function handleToggleTrack() {
    try {
      await playerGamesAPI.update(playerGame.id, { is_tracked: !playerGame.is_tracked })
      setPlayerGame((pg) => ({ ...pg, is_tracked: !pg.is_tracked }))
    } catch {
      setNotice("Couldn't change tracking. Try again.")
    }
  }

  function chooseFilter(f) {
    setFilter(f)
    localStorage.setItem(filterKey, f)
  }

  function select(achievement) {
    setSelectedId(achievement.id)
    localStorage.setItem(selectedKey, achievement.id)
  }

  function closePanel() {
    // The dialog restores focus itself, but not where the click didn't focus the row (Safari) or after a reload.
    document.querySelector('main [aria-current="true"]')?.focus()
    setSelectedId(null)
    localStorage.removeItem(selectedKey)
  }

  if (loading) {
    return (
      <Layout>
        <div role="status" aria-label="Loading">
          <div className="mt-7 aspect-[1920/620] max-h-[240px] rounded-xl bg-track" />
          <div className="my-[18px] h-7 w-56 rounded-md bg-track" />
          <div className="mb-6 h-[74px] rounded-[10px] bg-track" />
          <div className="h-80 rounded-[10px] bg-track" />
        </div>
      </Layout>
    )
  }

  if (!game) {
    return (
      <Layout>
        <div className="py-32 text-center">
          <p role={notFound ? undefined : 'alert'} className="text-muted">{notFound ? 'Game not found' : "Couldn't load this game. Try again."}</p>
          <Link to="/dashboard" className={`mt-2 inline-block font-medium underline underline-offset-[3px] ${focusCls}`}>Back to Dashboard</Link>
        </div>
      </Layout>
    )
  }

  const paById = new Map(playerAchs.map((pa) => [pa.achievement_id, pa]))
  const unlockedIds = new Set(playerAchs.filter((pa) => pa.unlocked).map((pa) => pa.achievement_id))
  const total = achievements.length
  const done = achievements.filter((a) => unlockedIds.has(a.id)).length
  const breakdown = rarityBreakdown(achievements, unlockedIds)
  const counts = { all: total, locked: total - done, unlocked: done }
  const q = query.trim().toLowerCase()
  const rows = achievements
    .filter((a) => filter === 'all' || (filter === 'unlocked') === unlockedIds.has(a.id))
    .filter((a) => !q || `${a.display_name} ${a.description || ''}`.toLowerCase().includes(q))
    .map((a) => ({ ...a, pa: paById.get(a.id) }))
    .sort(sorts[sort])
  const selected = achievements.find((a) => a.id === selectedId)
  const heroes = ['library_hero.jpg', 'header.jpg']

  return (
    <Layout>
      <Link to="/dashboard" className={`mb-3 inline-block text-[13px] text-muted ${focusCls}`}>← Dashboard</Link>

      {heroIdx < heroes.length && (
        <img
          key={heroes[heroIdx]}
          src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.app_id}/${heroes[heroIdx]}`}
          alt=""
          onError={() => setHeroIdx((i) => i + 1)}
          className="block aspect-[1920/620] max-h-[240px] w-full rounded-xl bg-track object-cover"
        />
      )}

      <div className="my-[18px] flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em]">{game.name}</h1>
          {playerGame && (
            <p className="mt-1 text-muted">
              {Math.round(playerGame.playtime_hours || 0).toLocaleString()} h played · {playerGame.last_synced ? `Synced ${timeAgo(playerGame.last_synced)}` : 'Not synced yet'}
            </p>
          )}
        </div>
        <div className="ml-auto flex gap-2 max-[860px]:ml-0">
          {playerGame && (
            <button
              type="button"
              aria-pressed={playerGame.is_tracked}
              onClick={handleToggleTrack}
              className={`${btn} border-border-strong ${playerGame.is_tracked ? 'bg-hover' : 'bg-surface'}`}
            >
              {playerGame.is_tracked ? <HiBookmark className="size-[15px]" /> : <HiOutlineBookmark className="size-[15px]" />}
              {playerGame.is_tracked ? 'Tracking' : 'Track'}
            </button>
          )}
          <button type="button" onClick={handleSync} disabled={syncing} className={`${btn} border-ink bg-ink text-on-ink`}>
            <HiArrowPath className="size-[15px]" />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>

      {notice && <p role="status" className="mb-6 rounded-lg bg-warn-bg px-3.5 py-2.5 text-warn">{notice}</p>}

      <div className="mb-6 grid grid-cols-[1.3fr_repeat(4,1fr)] rounded-[10px] border border-border bg-surface max-[860px]:grid-cols-4">
        <div className="px-4 py-3 max-[860px]:col-span-full max-[860px]:border-b max-[520px]:px-3 max-[520px]:py-2.5">
          <b className="text-[22px] font-semibold tracking-[-0.02em] max-[520px]:text-lg">{done}</b>{' '}
          <span className="font-medium text-muted">/ {total} · {total ? Math.round((done / total) * 100) : 0}%</span>
          <small className="block text-xs text-muted">Achievements unlocked</small>
          <div className="mt-2"><ProgressBar value={done} max={total} /></div>
        </div>
        {tiers.map(([tier, label, tone]) => (
          <div key={tier} className="border-l border-border px-4 py-3 max-[860px]:nth-2:border-l-0 max-[520px]:px-3 max-[520px]:py-2.5">
            <b className={`text-[22px] font-semibold tracking-[-0.02em] max-[520px]:text-lg ${tierText[tone]}`}>{breakdown[tier].got}</b>{' '}
            <span className="font-medium text-muted">/ {breakdown[tier].total}</span>
            <small className="block text-xs text-muted">{label}</small>
            <div className="mt-2"><ProgressBar value={breakdown[tier].got} max={breakdown[tier].total} tone={tone} /></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_300px] items-start gap-6 max-[860px]:grid-cols-1">
        <section className="min-w-0">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Filter" className="inline-flex rounded-lg border border-border-strong bg-surface p-0.5">
              {['all', 'locked', 'unlocked'].map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => chooseFilter(f)}
                  className={`cursor-pointer rounded-md px-2.5 py-[5px] text-[13px] capitalize transition-colors duration-150 ${filter === f ? 'bg-ink text-on-ink' : 'text-muted'} ${focusCls}`}
                >
                  {f} <span className="opacity-70">{counts[f]}</span>
                </button>
              ))}
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search achievements"
              aria-label="Search achievements"
              className={`min-w-[140px] flex-1 px-2.5 py-[7px] placeholder:text-faint ${control}`}
            />
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className={`px-2 py-[7px] ${control}`}>
              <option value="rare">Rarest first</option>
              <option value="easy">Most common first</option>
              <option value="recent">Recently unlocked</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
            <div aria-hidden="true" className="grid grid-cols-[1fr_90px_100px_110px] gap-3 border-b border-border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[.05em] text-faint max-[860px]:grid-cols-[1fr_70px]">
              <span>Achievement</span><span className="text-right">Players</span>
              <span className="max-[860px]:hidden">Rarity</span><span className="max-[860px]:hidden">Status</span>
            </div>
            {rows.length > 0 ? rows.map((a) => (
              <AchievementRow
                key={a.id}
                achievement={a}
                unlocked={unlockedIds.has(a.id)}
                unlockTime={a.pa?.unlock_time}
                current={a.id === selectedId}
                onSelect={select}
              />
            )) : (
              <p className="m-0 p-5 text-muted">{total === 0 ? 'Sync this game to load its achievements.' : 'Nothing matches.'}</p>
            )}
          </div>
        </section>

        <aside>
          <GuidesCard gameId={gameId} />
        </aside>
      </div>

      <AchievementPanel
        achievement={selected}
        unlocked={selected ? unlockedIds.has(selected.id) : false}
        unlockTime={selected && paById.get(selected.id)?.unlock_time}
        game={game}
        open={!!selected}
        onClose={closePanel}
      />
    </Layout>
  )
}
