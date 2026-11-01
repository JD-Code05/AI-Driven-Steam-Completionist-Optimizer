import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { aiAPI, achievementsAPI, gamesAPI, playerAchievementsAPI } from '../services/api'
import AchievementPanel from '../components/AchievementPanel'
import Layout from '../components/Layout'
import ProgressBar from '../components/ProgressBar'
import RouteTree from '../components/RouteTree'
import { buildRouteView } from '../utils/routeTree'

const focusCls = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const inkBtn = `cursor-pointer rounded-[9px] bg-ink px-4 py-2.5 text-sm font-semibold text-on-ink transition-transform duration-[120ms] ease-[var(--ease-out)] enabled:active:scale-[.97] disabled:opacity-60 motion-reduce:transition-none ${focusCls}`
const secondaryBtn = `cursor-pointer rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 disabled:opacity-60 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-hover ${focusCls}`

const steamArt = (appId, file) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/${file}`

export default function OptimizationPage() {
  const { gameId } = useParams()
  const [game, setGame] = useState(null)
  const [achievements, setAchievements] = useState([])
  const [playerAchs, setPlayerAchs] = useState([])
  const [route, setRoute] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | notFound | failed
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [selectedApi, setSelectedApi] = useState(null)
  const [bannerFailed, setBannerFailed] = useState(false)
  const currentGame = useRef(gameId)

  useEffect(() => {
    currentGame.current = gameId
    let stale = false
    setStatus('loading')
    setGame(null)
    setAchievements([])
    setPlayerAchs([])
    setRoute(null)
    setError('')
    setGenerating(false)
    setSelectedApi(null)
    setBannerFailed(false)

    async function load() {
      try {
        const [gameRes, achRes, paRes, savedRoute] = await Promise.all([
          gamesAPI.get(gameId),
          achievementsAPI.list(gameId),
          playerAchievementsAPI.list(gameId),
          aiAPI.getRoute(gameId).then((r) => r.data.route).catch((err) => {
            if (err.response?.status === 404) return null
            throw err
          }),
        ])
        if (stale) return
        setGame(gameRes.data)
        setAchievements(achRes.data)
        setPlayerAchs(paRes.data)
        setRoute(savedRoute)
        setStatus('ready')
      } catch (err) {
        if (!stale) setStatus(err.response?.status === 404 ? 'notFound' : 'failed')
      }
    }
    load()
    return () => { stale = true }
  }, [gameId])

  async function handleGenerate() {
    const forGame = gameId
    setGenerating(true)
    setError('')
    try {
      const { data } = await aiAPI.generateRoute(forGame)
      if (currentGame.current === forGame) setRoute(data.route)
    } catch (err) {
      if (currentGame.current !== forGame) return
      const message = err.response?.data?.error
      setError(typeof message === 'string' ? message : "Couldn't write a route right now. Try again.")
    } finally {
      if (currentGame.current === forGame) setGenerating(false)
    }
  }

  const paById = useMemo(() => new Map(playerAchs.map((pa) => [pa.achievement_id, pa])), [playerAchs])
  const view = useMemo(() => {
    if (!route) return null
    const unlockedIds = new Set(playerAchs.filter((pa) => pa.unlocked).map((pa) => pa.achievement_id))
    return buildRouteView(route, achievements, unlockedIds)
  }, [route, achievements, playerAchs])

  if (status === 'loading') {
    return (
      <Layout>
        <p role="status" className="py-32 text-center text-muted">Loading…</p>
      </Layout>
    )
  }

  if (!game) {
    return (
      <Layout>
        <div className="py-32 text-center">
          <p role={status === 'notFound' ? undefined : 'alert'} className="text-muted">{status === 'notFound' ? 'Game not found' : "Couldn't load this game. Try again."}</p>
          <Link to="/dashboard" className={`mt-2 inline-block font-medium underline underline-offset-[3px] ${focusCls}`}>Back to Dashboard</Link>
        </div>
      </Layout>
    )
  }

  const selectedStep = view?.branches.flatMap((b) => b.steps).find((s) => s.achievement.api_name === selectedApi)
  const selected = selectedStep?.achievement ?? null
  const selectedPa = selected && paById.get(selected.id)

  return (
    <Layout>
      <div className="route-hero">
        {!bannerFailed && <img src={steamArt(game.app_id, 'library_hero.jpg')} alt="" onError={() => setBannerFailed(true)} />}
      </div>

      <div className="relative z-[1] -mt-[170px] mb-7">
        <Link to={`/games/${gameId}`} className={`mb-3 inline-block text-[13px] ${focusCls}`}>← {game.name}</Link>
        <div className="grid items-end gap-x-10 gap-y-4 min-[861px]:grid-cols-[1fr_minmax(0,440px)]">
          <h1 className="text-balance text-[clamp(34px,4.6vw,52px)] font-bold leading-[1.04] tracking-[-0.035em]">Your route to 100%</h1>
          {view && (
            <div>
              <p className="max-w-[58ch] text-[15px] leading-[1.55]">{view.message}</p>
              <div className="mt-3.5"><ProgressBar value={view.done} max={view.total} tone="uncommon" /></div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted tabular-nums">
                <span>{view.done} of {view.total} done</span>
                <button type="button" onClick={handleGenerate} disabled={generating} className={secondaryBtn}>Rewrite</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div aria-live="polite">
        {generating && <p className="mb-5 rounded-lg bg-hover px-3.5 py-2.5 text-center">Mapping your achievements… this can take up to a minute.</p>}
      </div>

      {error && (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warn-bg px-3.5 py-2.5 text-warn">
          <span>{error}</span>
          <button type="button" onClick={handleGenerate} disabled={generating} className={secondaryBtn}>Try again</button>
        </div>
      )}

      {achievements.length === 0 ? (
        <div className="py-16 text-center">
          <Link to={`/games/${gameId}`} className={`font-medium underline underline-offset-[3px] ${focusCls}`}>Sync this game's achievements first</Link>
        </div>
      ) : view ? (
        <>
          <RouteTree view={view} game={game} onSelect={setSelectedApi} />
          <p className="mt-2 text-center text-[13px] text-muted">This route is written by AI and can be wrong.</p>
        </>
      ) : !generating && !error && (
        <div className="py-16 text-center">
          <button type="button" onClick={handleGenerate} className={inkBtn}>Map this game</button>
        </div>
      )}

      <AchievementPanel
        achievement={selected}
        unlocked={!!selectedPa?.unlocked}
        unlockTime={selectedPa?.unlock_time}
        game={game}
        open={!!selected}
        onClose={() => setSelectedApi(null)}
        missableNote={selectedStep?.missableNote}
      />
    </Layout>
  )
}
