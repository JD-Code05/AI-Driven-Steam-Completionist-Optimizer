import { Navigate, useSearchParams } from 'react-router-dom'
import { useSyncExternalStore } from 'react'
import { SiSteam } from 'react-icons/si'
import { HiStar } from 'react-icons/hi2'
import { useAuth } from '../context/AuthContext'
import ThemeSwitch from '../components/ThemeSwitch'

const APP_IDS = [413150, 1145360, 367520, 504230, 646570, 105600, 1245620, 1794680, 2379780, 1868140, 892970, 1086940]
const DURATIONS = ['70s', '90s', '80s', '95s']
const NARROW = '(max-width: 820px)'

const ERRORS = {
  steam_validation_failed: "Couldn't reach Steam to confirm your sign-in. Try again.",
  invalid_steam_login: "Steam didn't confirm that sign-in. Try again.",
  no_steam_id: "Steam didn't send an account ID. Try again.",
}

const STEPS = [
  ['01', 'Sync your library.', 'Games, hours and every achievement.'],
  ['02', "See what's left.", 'Sorted by how rare each one is.'],
  ['03', 'Get a route.', 'An AI plan built from real guides for that game.'],
]

const subscribeNarrow = (cb) => {
  const m = matchMedia(NARROW)
  m.addEventListener('change', cb)
  return () => m.removeEventListener('change', cb)
}

export default function LoginPage() {
  const { player, loading, login } = useAuth()
  const [params] = useSearchParams()
  const cols = useSyncExternalStore(subscribeNarrow, () => (matchMedia(NARROW).matches ? 4 : 3))
  const errorCode = params.get('error')

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin motion-reduce:animate-none w-8 h-8 border-2 border-muted border-t-transparent rounded-full" />
      </div>
    )
  }

  if (player) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="relative grid min-h-screen min-[821px]:grid-cols-[minmax(360px,5fr)_6fr]">
      <main className="flex flex-col px-4 pt-5 pb-6 min-[821px]:px-12 min-[821px]:py-7">
        <div className="absolute top-4 left-4 right-4 z-[2] flex items-center justify-between min-[821px]:static">
          <span className="font-bold tracking-[-.01em] text-base bg-surface px-2.5 py-1 rounded-[7px] min-[821px]:bg-transparent min-[821px]:p-0">
            Steam Achievement Optimizer
          </span>
          <ThemeSwitch />
        </div>

        <div className="my-auto max-w-[420px] py-7 min-[821px]:py-12">
          <h1 className="font-bold leading-[1.05] tracking-[-.035em] mb-4 text-[clamp(34px,4.4vw,52px)]">
            Finish the games you started.
          </h1>
          <p className="text-muted text-[17px] mb-7">
            Steam Achievement Optimizer reads your Steam achievements, shows which ones are rarest, and plans the shortest route to 100%.
          </p>

          {errorCode && (
            <p role="alert" className="max-w-[360px] mb-3.5 rounded-lg border border-warn/30 bg-warn-bg text-warn px-3 py-2 text-[13px]">
              {ERRORS[errorCode] ?? "Sign-in didn't finish. Try again."}
            </p>
          )}

          <button
            type="button"
            onClick={login}
            className="inline-flex items-center gap-2.5 rounded-[9px] bg-ink text-on-ink px-5 py-[13px] text-[15px] font-semibold cursor-pointer transition-transform duration-[120ms] ease-(--ease-out) active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ink"
          >
            <SiSteam className="w-5 h-5" aria-hidden="true" />
            Sign in through Steam
          </button>
          <p className="text-muted text-[13px] mt-3.5 max-w-[360px]">
            Steam handles the sign-in, so your password never reaches us. Your game details need to be public on Steam for syncing to work.
          </p>

          <ol className="list-none p-0 mt-7 min-[821px]:mt-10 border-t border-border">
            {STEPS.map(([n, title, rest]) => (
              <li key={n} className="grid grid-cols-[28px_1fr] py-[11px] border-b border-border text-sm">
                <span className="text-faint">{n}</span>
                <div><b className="font-semibold">{title}</b> <em className="not-italic text-muted">{rest}</em></div>
              </li>
            ))}
          </ol>
        </div>

        <p className="text-faint text-xs">Not affiliated with Valve. Uses the Steam Web API.</p>
      </main>

      <aside className="wall" aria-hidden="true">
        {Array.from({ length: cols }, (_, c) => {
          const mine = APP_IDS.filter((_, i) => i % cols === c)
          // Covers appear twice so translateY(-50%) loops seamlessly.
          return (
            <div key={`${cols}-${c}`} className="wall-col" style={{ '--dur': DURATIONS[c] }}>
              {[...mine, ...mine].map((id, i) => (
                <img key={i} src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`} alt="" loading="lazy" />
              ))}
            </div>
          )
        })}
        <div className="absolute left-1/2 bottom-[14%] -translate-x-1/2 flex items-center gap-3 w-[min(340px,80%)] bg-surface border border-border rounded-xl px-3.5 py-3 shadow-[0_12px_32px_rgba(0,0,0,.22)] max-[820px]:hidden">
          <div className="grid place-items-center flex-none w-10 h-10 rounded-lg bg-ultra text-on-ink">
            <HiStar className="w-5 h-5" />
          </div>
          <div>
            <b className="block text-sm">Master Angler</b>
            <span className="text-muted text-xs">Stardew Valley · just now</span>
          </div>
          <div className="ml-auto text-ultra font-semibold text-[13px] whitespace-nowrap">4.2% of players</div>
        </div>
      </aside>
    </div>
  )
}
