# Security Fixes and UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two security holes, then rebuild the login, dashboard and game pages in the new light/dark design with the sun/moon switch.

**Architecture:** Part A (Tasks 1–2) changes only the Flask backend plus the frontend's API calls, on branch `fix/lock-down-api`. Part B (Tasks 3–9) branches from Part A as `feat/ui-redesign`: one backend addition (`unlocked_count`), then a token-based theme in `index.css`, shared components, and the three page rewrites. Pure logic goes in small `src/utils/*.js` modules so it can be tested without a browser.

**Tech Stack:** Flask 3.1 + SQLAlchemy (tests: stdlib `unittest` on in-memory SQLite), React 19, Vite 6, Tailwind v4, react-router 7 (tests: Node's built-in `node --test`).

**Spec:** `docs/superpowers/specs/2026-10-19-ui-redesign-design.md` (mockups in `docs/superpowers/specs/mockups/`). Part A implements finding #1 and #2 from the audit, as summarized in the spec's owner decision 1.

## Global Constraints

- No new runtime or dev dependencies, frontend or backend.
- App name: "Steam Achievement Optimizer" in full; navbar shows "Achievement Optimizer", and "AO" under 520px. Never "Completionist".
- Colors only from the spec's token table, defined once in `frontend/src/index.css`; no `dark:` variants, no gradients, glows, purple, or emoji in UI.
- Motion: `--ease-out: cubic-bezier(0.23,1,0.32,1)`, `--ease-in-out: cubic-bezier(0.77,0,0.175,1)`, `--ease-drawer: cubic-bezier(0.32,0.72,0,1)`; every animation has a `prefers-reduced-motion` variant; hover motion only under `(hover: hover) and (pointer: fine)`.
- Works at 375px wide with no horizontal scroll.
- Backend test command (mounts local code, no DB needed): `docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --no-deps backend python -m unittest discover -s tests -v`
- Frontend test command: `node --test frontend/src/utils/`
- Frontend build check: `docker compose build frontend` (fails on any import/syntax error).
- No `Co-Authored-By` trailer in commit messages (owner instruction, 2026-10-19).

## Review Focus

1. **Brand-new or private Steam account (zero games):** dashboard shows plain empty states, stats read 0 and 0%, never `NaN`. Test: `dashboardStats([])` in Task 7.
2. **Games with zero achievements, or not yet synced (`total_achievements = 0`):** they never count toward "% unlocked" or "perfect", and divide-by-zero never happens. Test: `dashboardStats` and `rarityBreakdown` cases in Tasks 7–8.
3. **Storage blocked (private window, `localStorage` throws):** theme still follows the system and the switch still works for the session. Test: `readStoredTheme` with a throwing storage in Task 4.
4. **Missing art (no `library_hero.jpg`, no cover):** hero falls back to `header.jpg` and then to no banner; covers fall back like today's GameCard. Never a broken-image icon. Manual check in Tasks 5 and 8.
5. **Very long names** (game "Warhammer 40,000: Dawn of War II – Retribution", long achievement descriptions): ellipsis, no overflow at 375px. Manual check in Task 9 with a temporary long name.

---

## Part A: Security (branch `fix/lock-down-api` from `main`)

### Task 1: Backend test harness and safe login redirect

**Files:**
- Create: `backend/tests/__init__.py` (empty), `backend/tests/base.py`, `backend/tests/test_auth.py`
- Modify: `backend/app/config.py`, `backend/app/routes/auth.py:14-23,40-54,90-92`, `docker-compose.yml` (backend env), `.env.example`, `k8s/configmap.yaml`

**Interfaces:**
- Produces: `tests.base.BaseTestCase` with `self.app`, `self.client`, `make_player(steam_id: str) -> Player`, `make_game(app_id: int, name: str) -> Game`, `auth(player) -> dict` (the `Authorization` header). `TestConfig(Config)` with `SQLALCHEMY_DATABASE_URI = 'sqlite://'`, `TESTING = True`, `SECRET_KEY = 'test-secret'`, `FRONTEND_URL = 'http://localhost:3000'`. `setUp` calls `db.create_all()` inside a pushed app context; `tearDown` calls `db.drop_all()`.
- Produces: `Config.FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')`.

- [ ] **Step 1: Create the branch** — `git switch -c fix/lock-down-api`

- [ ] **Step 2: Write `tests/base.py` and the failing tests in `tests/test_auth.py`**

```python
from urllib.parse import urlparse, parse_qs
from unittest.mock import patch
from tests.base import BaseTestCase

def _return_to(resp):
    """The return_url our login embeds inside openid.return_to."""
    q = parse_qs(urlparse(resp.headers['Location']).query)
    return parse_qs(urlparse(q['openid.return_to'][0]).query)['return_url'][0]

class LoginRedirectTests(BaseTestCase):
    def test_keeps_frontend_return_url(self):
        r = self.client.get('/api/auth/login?return_url=http://localhost:3000/dashboard')
        self.assertEqual(_return_to(r), 'http://localhost:3000/dashboard')

    def test_replaces_foreign_return_url(self):
        r = self.client.get('/api/auth/login?return_url=https://evil.example/steal')
        self.assertEqual(_return_to(r), 'http://localhost:3000/dashboard')

    def test_rejects_lookalike_host(self):
        r = self.client.get('/api/auth/login?return_url=http://localhost:3000.evil.example/')
        self.assertEqual(_return_to(r), 'http://localhost:3000/dashboard')

    @patch('app.routes.auth.requests.post')
    def test_callback_never_redirects_off_site(self, post):
        post.return_value.text = 'is_valid:false'
        r = self.client.get('/api/auth/callback?return_url=https://evil.example/')
        self.assertTrue(r.headers['Location'].startswith('http://localhost:3000/'))
```

- [ ] **Step 3: Run the backend test command.** Expected: 4 failures (`evil.example` returned).

- [ ] **Step 4: Implement `_safe_return_url(url: str | None) -> str` in `backend/app/routes/auth.py`** and use it for `return_url` in both `login()` and `callback()`. Allowed: `url == base` or `url.startswith(base + '/')`, where `base = current_app.config['FRONTEND_URL'].rstrip('/')`. Otherwise return `base + '/dashboard'`. Add `FRONTEND_URL` to `Config`, to the backend `environment` in `docker-compose.yml` (`${FRONTEND_URL:-http://localhost:3000}`), to `.env.example`, and to `k8s/configmap.yaml` (`"http://localhost:3000"`, which matches `deploy.sh`).

- [ ] **Step 5: Run the backend test command.** Expected: 4 passed.

- [ ] **Step 6: Commit** — `git add backend/tests backend/app/config.py backend/app/routes/auth.py docker-compose.yml .env.example k8s/configmap.yaml && git commit -m "fix: only redirect logins back to the configured frontend"`

### Task 2: Require login on data endpoints and remove unused ones

**Files:**
- Delete: `backend/app/routes/players.py` (and its import and registration in `backend/app/__init__.py`)
- Modify: `backend/app/routes/games.py`, `achievements.py`, `player_games.py`, `player_achievements.py`, `data_sources.py`, `steamgriddb.py`
- Modify: `frontend/src/services/api.js`, `frontend/src/pages/DashboardPage.jsx`, `frontend/src/pages/GameDetailPage.jsx`, `frontend/src/components/GameCard.jsx`
- Modify: `backend/backend-README.md` (endpoint tables at about lines 77–81 and 291–318), `README.md:414`
- Test: `backend/tests/test_access.py`

**Interfaces:**
- Consumes: `BaseTestCase`, `auth_required` (sets `request.player_id`).
- Produces (backend routes that remain, all `@auth_required`): `GET /api/games/<id>`, `GET /api/games`, `GET /api/achievements?game_id=`, `GET /api/player-games[?tracked=true]`, `PUT /api/player-games/<id>` (only `is_tracked` is writable), `GET /api/player-achievements?game_id=[&unlocked=true]`, `GET|POST /api/data-sources`, `PUT|DELETE /api/data-sources/<id>`, `GET /api/steamgriddb/grid/<app_id>`. Player-scoped routes use `request.player_id` and ignore any `player_id` query parameter.
- Produces (frontend): `playerGamesAPI.list(tracked?)`, `playerGamesAPI.update(id, data)`, `playerAchievementsAPI.list(gameId)`; `optimizationAPI` is removed (it calls a backend that does not exist).

- [ ] **Step 1: Write failing tests in `tests/test_access.py`**

```python
class AccessTests(BaseTestCase):
    PROTECTED = [('GET', '/api/games/1'), ('GET', '/api/achievements?game_id=1'),
                 ('GET', '/api/player-games'), ('PUT', '/api/player-games/1'),
                 ('GET', '/api/player-achievements?game_id=1'), ('GET', '/api/data-sources?game_id=1'),
                 ('POST', '/api/data-sources'), ('DELETE', '/api/data-sources/1'),
                 ('GET', '/api/steamgriddb/grid/1')]
    REMOVED = [('GET', '/api/players'), ('DELETE', '/api/players/1'), ('POST', '/api/games'),
               ('DELETE', '/api/games/1'), ('POST', '/api/achievements'),
               ('DELETE', '/api/player-games/1'), ('POST', '/api/player-achievements')]

    def test_protected_routes_need_login(self):
        for method, path in self.PROTECTED:
            with self.subTest(path=path):
                self.assertEqual(self.client.open(path, method=method).status_code, 401)

    def test_removed_routes_are_gone(self):
        a = self.make_player('1')
        for method, path in self.REMOVED:
            with self.subTest(path=path):
                self.assertIn(self.client.open(path, method=method, headers=self.auth(a)).status_code, (404, 405))

    def test_player_games_only_lists_callers_games(self):
        # a owns game 10, b owns game 20; a asks for b's list via the old parameter
        ...  # create PlayerGame rows for both
        r = self.client.get(f'/api/player-games?player_id={b.id}', headers=self.auth(a))
        self.assertEqual([pg['game_id'] for pg in r.json], [game_a.id])

    def test_cannot_track_someone_elses_game(self):
        r = self.client.put(f'/api/player-games/{pg_b.id}', json={'is_tracked': True}, headers=self.auth(a))
        self.assertEqual(r.status_code, 404)

    def test_player_achievements_are_callers_only(self):
        # b has an unlocked achievement in a game a also owns
        r = self.client.get(f'/api/player-achievements?game_id={game.id}&player_id={b.id}', headers=self.auth(a))
        self.assertEqual(r.json, [])

    def test_data_source_writes_need_game_in_library(self):
        r = self.client.post('/api/data-sources', json={'game_id': game_b.id, 'url': 'https://x.example'},
                             headers=self.auth(a))
        self.assertEqual(r.status_code, 404)
```

(`...` marks fixture setup the implementer writes with `make_player` / `make_game` / `PlayerGame` / `Achievement` / `PlayerAchievement`.)

- [ ] **Step 2: Run the backend test command.** Expected: the new tests fail (200s instead of 401s, and other players' data visible).

- [ ] **Step 3: Implement.** Delete the listed routes. Add `@auth_required` to every remaining handler in the six files. Filter `player_games`/`player_achievements` by `request.player_id`. `PUT /player-games/<id>` returns 404 unless `pg.player_id == request.player_id`, and only accepts `is_tracked`. Data-source `POST/PUT/DELETE` return 404 unless the caller has a `PlayerGame` for that game. Mark that rule with `# shortcut: any owner of the game can edit its sources (no per-player owner column); add an owner column if sources get abused`.

- [ ] **Step 4: Update the frontend callers.** In `api.js`: remove `optimizationAPI`, drop the `playerId` parameter from `playerGamesAPI.list` and `playerAchievementsAPI.list`. In `DashboardPage.jsx` and `GameDetailPage.jsx`: update the calls. In `GameCard.jsx`: replace the raw `fetch('/api/steamgriddb/grid/…')` with `api.get(...)`, so the token is sent.

- [ ] **Step 5: Run the backend tests; then run `docker compose build frontend`.** Expected: all tests pass; build succeeds.

- [ ] **Step 6: Smoke test.** Run `docker compose up -d --build`, sign in with Steam in a browser, sync, open a game, toggle Track. Each must work as before. Then `curl -s -o /dev/null -w "%{http_code}" localhost:5000/api/player-games` → `401`.

- [ ] **Step 7: Update docs.** In `backend/backend-README.md`, the endpoint tables list only the remaining routes with "Auth: Yes", and `players.py` is removed from the tree. In `README.md:414`, change steamgriddb to "Yes".

- [ ] **Step 8: Commit** — `git commit -am "fix: require login on data endpoints and remove unused CRUD routes"` (plus `git add backend/tests/test_access.py` and the `players.py` deletion).

---

## Part B: Redesign (branch `feat/ui-redesign` from `fix/lock-down-api`)

### Task 3: `unlocked_count` on the player-games list

**Files:** Modify `backend/app/routes/player_games.py` (`list_player_games`). Test: `backend/tests/test_player_games.py`

**Interfaces:**
- Produces: each item of `GET /api/player-games` is `PlayerGame.to_dict()` plus `unlocked_count: int`.

- [ ] **Step 1: `git switch -c feat/ui-redesign`**
- [ ] **Step 2: Failing test** `test_unlocked_count_per_game`. The player owns game X (3 achievements, 2 unlocked, 1 locked) and game Y (none). Assert X's item has `unlocked_count == 2` and Y's has `unlocked_count == 0`. A second player's unlocks in X must not count.
- [ ] **Step 3: Run backend tests.** Expected: KeyError `unlocked_count`.
- [ ] **Step 4: Implement.** One grouped query: `Achievement.game_id, count(*)` joined to `PlayerAchievement` where `player_id == request.player_id` and `unlocked`, grouped by `game_id`, turned into a dict. Load `PlayerGame.game` with `joinedload` so `to_dict()` does not query per row.
- [ ] **Step 5: Run backend tests.** Expected: pass.
- [ ] **Step 6: Commit** — `feat: return unlocked_count with each player game`

### Task 4: Theme foundation, sun/moon switch and navbar

**Files:**
- Modify: `frontend/index.html`, `frontend/src/index.css` (rewrite), `frontend/src/components/Navbar.jsx` (rewrite), `frontend/src/components/Layout.jsx`
- Create: `frontend/src/utils/theme.js`, `frontend/src/utils/theme.test.js`, `frontend/src/components/ThemeSwitch.jsx`

**Interfaces:**
- Produces in `utils/theme.js`:
  - `THEME_KEY = 'theme'`
  - `readStoredTheme(storage = localStorage): 'light' | 'dark' | null`. Returns null for any other value or if `getItem` throws.
  - `resolveTheme(stored: string | null, systemDark: boolean): 'light' | 'dark'`
  - `setTheme(theme: 'light' | 'dark', originEl?: Element): void`. Stores the choice (ignores storage errors) and sets `document.documentElement.dataset.theme`, wrapped in `document.startViewTransition` with the circle reveal from `originEl` (650ms, `--ease-in-out` curve, on `::view-transition-new(root)`) when supported and reduced motion is off.
- Produces Tailwind utilities from `@theme inline`: colors `bg, surface, hover, border, border-strong, text, muted, faint, ink, on-ink, track, common, common-bg, uncommon, uncommon-bg, rare, rare-bg, ultra, ultra-bg, warn, warn-bg, scrim`, giving classes like `bg-surface`, `text-muted`, `border-border`, `bg-ink text-on-ink`, `text-ultra bg-ultra-bg`. Plus `--font-sans: Geist, system-ui, sans-serif`.
- Produces: `<ThemeSwitch />` (no props).

- [ ] **Step 1: Failing tests in `theme.test.js`** (`node:test` + `node:assert/strict`):
  - `resolveTheme('dark', false) === 'dark'`, `resolveTheme('light', true) === 'light'`, `resolveTheme(null, true) === 'dark'`, `resolveTheme(null, false) === 'light'`
  - `readStoredTheme({ getItem: () => 'dark' }) === 'dark'`, `readStoredTheme({ getItem: () => 'blue' }) === null`, `readStoredTheme({ getItem: () => { throw new Error('blocked') } }) === null`
- [ ] **Step 2: Run `node --test frontend/src/utils/`.** Expected: fail (module not found).
- [ ] **Step 3: Implement `theme.js`.** It must not touch `document` or `localStorage` at import time, so Node can import it.
- [ ] **Step 4: Run the frontend tests.** Expected: pass.
- [ ] **Step 5: Rewrite `index.css`.** Use the token table from the spec under `[data-theme="light"]` / `[data-theme="dark"]`, with `color-scheme` set for each. Add `@theme inline` mapping, the motion tokens, `body` using `bg`/`text`/Geist/tabular-nums, `* { border-color: var(--border) }` in `@layer base`, and `::view-transition-old(root), ::view-transition-new(root) { animation: none; mix-blend-mode: normal; }`. Add the 300ms color crossfade on `body` when `startViewTransition` is unsupported. Add the `.theme-switch` / `.knob` / `.core` / `.mask-dot` / `.rays` / `.star` / `.cloud` rules and their reduced-motion block, copied from `docs/superpowers/specs/mockups/motion-v2.html`. Delete the old `@theme` block and the webkit scrollbar rules.
- [ ] **Step 6: In `index.html`:** add the Geist Google Fonts `<link>` (weights 400;500;600;700, `display=swap`). Add an inline `<script>` in `<head>` that sets `document.documentElement.dataset.theme` from `localStorage['theme']` (in try/catch), else from `matchMedia('(prefers-color-scheme: dark)')`. Comment it as the no-flash copy of `resolveTheme`. Remove the `bg-gray-950 text-gray-100` body classes.
- [ ] **Step 7: Implement `ThemeSwitch.jsx`.** Use the markup from the mockup (`role="switch"`, `aria-checked`, `aria-label="Dark mode"`). The SVG `<mask>` needs a unique id per instance (`useId`). Click calls `setTheme(next, buttonEl)`. When nothing is stored, follow `matchMedia` change events.
- [ ] **Step 8: Rewrite `Navbar.jsx` and `Layout.jsx`** per the spec's Navbar section: surface background, bottom border, brand, "Dashboard" link (active = `text`), `ThemeSwitch`, avatar, "Log out" text button. At ≤520px: gap 12px, 16px padding, avatar hidden, brand "AO". Layout: `max-w-[1160px] mx-auto px-5 pt-4 pb-12`, page background from `bg`.
- [ ] **Step 9: Verify in the browser.** `docker compose up -d --build frontend`. Visit `/dashboard`. The switch toggles with the circle reveal. Reload in each stored theme: no flash. Clear the `theme` key: it follows the OS. At 375px the navbar fits (`document.documentElement.scrollWidth === 375`).
- [ ] **Step 10: Commit** — `feat: add light/dark theme tokens and sun/moon switch`

### Task 5: Shared building blocks

**Files:**
- Modify: `frontend/src/components/ProgressBar.jsx`, `RarityBadge.jsx`, `GameCard.jsx`
- Create: `frontend/src/components/AchievementRow.jsx`, `frontend/src/utils/format.js`, `frontend/src/utils/format.test.js`

**Interfaces:**
- `ProgressBar({ value: number, max: number, tone?: 'ink' | 'ultra' | 'common' | 'uncommon' | 'rare' })`: a 4px bar only (no labels), `track` background, `max <= 0` renders 0%.
- `RarityBadge({ tier })`: a pill using `<tier>`/`<tier>-bg` tokens. Labels: `'ultra-rare'` → "Ultra rare", `'rare'` → "Rare", `'uncommon'` → "Uncommon", `'common'` → "Common". The `percent` prop is removed (grep callers).
- `GameCard({ game, unlockedCount, totalAchievements })`: 2:3 cover with radius 6, then the title (ellipsis), then a muted line with `got / total` and either `NN%` or a gold "Perfect", then `ProgressBar` (tone `ultra` when perfect). It keeps today's SteamGridDB lookup, image cache and fallback chain. Hover lift is 3px with a shadow, 200ms `--ease-out`, pointer devices only. With no achievements it shows "No achievements".
- `AchievementRow({ achievement, unlocked, unlockTime, gameName?, current?, onSelect? })`: the grid row from `game-v1.html` (icon, name and one-line description, `NN.N%` right-aligned, `RarityBadge`, date or "Locked"). Locked rows dim the icon to 45% and use the gray Steam icon. It renders a `<button>` when `onSelect` is given, else a `<div>`. `current` sets `aria-current="true"`. `gameName` shows as a small label above the name. Under 860px the rarity and status columns are hidden.
- `utils/format.js`: `timeAgo(iso: string | null, now = Date.now()): string` and `formatDate(iso: string): string` (e.g. "Mar 12, 2026", `en-US`).

- [ ] **Step 1: Failing tests in `format.test.js`.** With `now = Date.parse('2026-10-19T12:00:00Z')`: `timeAgo(null, now) === 'never'`; 30s ago → `'just now'`; 4 min → `'4 min ago'`; 2 h → `'2 h ago'`; 3 days → `'3 days ago'`; 1 day → `'1 day ago'`. `formatDate('2026-03-12T10:00:00Z') === 'Mar 12, 2026'`.
- [ ] **Step 2: Run the frontend tests.** Expected: fail.
- [ ] **Step 3: Implement `format.js`.**
- [ ] **Step 4: Run the frontend tests.** Expected: pass.
- [ ] **Step 5: Restyle `ProgressBar`, `RarityBadge`, `GameCard`; create `AchievementRow`** with only token classes.
- [ ] **Step 6: Run `docker compose build frontend`.** Expected: success. In the browser, a card whose SteamGridDB and Steam images both fail shows the name-initial placeholder on `track`, not a broken image.
- [ ] **Step 7: Commit** — `feat: restyle shared cards, badges and bars; add AchievementRow`

### Task 6: Login page

**Files:** Modify `frontend/src/pages/LoginPage.jsx` (rewrite). CSS for the wall's `drift` keyframes and the reduced-motion rule goes in `index.css`.

**Interfaces:** Consumes `ThemeSwitch`, `useAuth().login`.

- [ ] **Step 1: Rewrite** to match `mockups/login-v1.html`, with the name changed to "Steam Achievement Optimizer". The copy is exact:
  - h1 "Finish the games you started."
  - lead "Steam Achievement Optimizer reads your Steam achievements, shows which ones are rarest, and plans the shortest route to 100%."
  - button "Sign in through Steam" (`SiSteam` icon) → `login()`
  - fine print "Steam handles the sign-in, so your password never reaches us. Your game details need to be public on Steam for syncing to work."
  - steps "01 Sync your library. Games, hours and every achievement." / "02 See what's left. Sorted by how rare each one is." / "03 Get a route. An AI plan built from real guides for that game."
  - footer "Not affiliated with Valve. Uses the Steam Web API."
  - Wall app IDs: `[413150, 1145360, 367520, 504230, 646570, 105600, 1245620, 1794680, 2379780, 1868140, 892970, 1086940]`, `library_600x900.jpg`, 3 columns at 70s/90s/80s (4 under 820px), the middle column reversed, `contain: size`, top/bottom mask fade, `aria-hidden`.
  - Unlock card "Master Angler / Stardew Valley · just now / 4.2% of players".
- [ ] **Step 2: Show the `?error=` message above the button** (role="alert", `warn` colors): `steam_validation_failed` → "Couldn't reach Steam to confirm your sign-in. Try again.", `invalid_steam_login` → "Steam didn't confirm that sign-in. Try again.", `no_steam_id` → "Steam didn't send an account ID. Try again." Unknown values → "Sign-in didn't finish. Try again." A signed-in visitor is redirected to `/dashboard` as today.
- [ ] **Step 3: Verify in the browser** at 1280px and 375px in both themes, and with `/login?error=invalid_steam_login`. With reduced motion emulated, the wall is still.
- [ ] **Step 4: Commit** — `feat: redesign login page`

### Task 7: Dashboard

**Files:**
- Modify: `frontend/src/pages/DashboardPage.jsx` (rewrite)
- Create: `frontend/src/components/GameCarousel.jsx`, `frontend/src/utils/stats.js`, `frontend/src/utils/stats.test.js`
- Delete: `frontend/src/components/ProgressRing.jsx`

**Interfaces:**
- Consumes: `playerGamesAPI.list()` items with `unlocked_count` (Task 3), `GameCard`, `AchievementRow`, `ProgressBar`, `timeAgo`.
- Produces in `utils/stats.js`:
  - `dashboardStats(playerGames): { owned: number, hours: number, unlockedPct: number, perfect: number, lastSynced: string | null }`. `unlockedPct` is a rounded integer over games with `game.total_achievements > 0`. `perfect` counts those with `unlocked_count === total_achievements`. `lastSynced` is the max `last_synced`.
  - `inProgress(playerGames): PlayerGame[]`. Returns tracked games if any; otherwise games with `total_achievements > 0` that aren't perfect, sorted by completion % descending.
- Produces: `GameCarousel({ items })`, where items are player-games. It uses native scroll-snap with smooth scroll and prev/next buttons (`aria-label` "Previous games"/"Next games") that `scrollBy(±clientWidth)` and disable at the ends (1px tolerance). It shows 5 per view, 3.3 under 900px and 2.2 under 520px, with a 12px gap. The track is `role="region"` with `aria-labelledby` set to its heading and `tabIndex=0`. Reduced motion uses `scroll-behavior: auto`.

- [ ] **Step 1: Failing tests in `stats.test.js`:**
  - `dashboardStats([])` deep-equals `{ owned: 0, hours: 0, unlockedPct: 0, perfect: 0, lastSynced: null }`
  - Games A (10/10), B (5/20), C (0 achievements, 12.5 h) → `unlockedPct === 50` (15/30), `perfect === 1`, `owned === 3`, `hours` sums `playtime_hours`
  - `inProgress` with one tracked game returns just that game; with none tracked it returns B before any game with a lower %, and excludes A (perfect) and C (no achievements)
- [ ] **Step 2: Run the frontend tests.** Expected: fail.
- [ ] **Step 3: Implement `stats.js`.**
- [ ] **Step 4: Run the frontend tests.** Expected: pass.
- [ ] **Step 5: Implement `GameCarousel`, then rewrite `DashboardPage`** per the spec's Dashboard section:
  - profile row with "Synced {timeAgo(lastSynced)}" (or "Not synced yet" when `lastSynced` is null) and the ink "Sync Steam" button
  - the 4-cell stat strip (2×2 under 640px)
  - "In progress" carousel, with "All games" opening the restyled all-games overlay (closes on Escape and on backdrop click)
  - "Recently unlocked" built from `AchievementRow` with `gameName`, using today's logic: per tracked game, top 3 by `unlock_time`, then the overall top 8
  - empty states in plain text. No games → "Sync your Steam library to get started." Sync result "No games found or profile is private" → "Steam returned no games. Make sure your game details are public in Steam's privacy settings." Nothing unlocked yet → "Unlocks from your tracked games show up here."

  Delete the per-owned-game `/player-achievements` requests (use `unlocked_count`). Delete `ProgressRing.jsx`.
- [ ] **Step 6: Verify in the browser** with real data at 1280px and 375px, in both themes. Arrows page through and disable at the ends; keyboard Tab reaches arrows and covers. In the network panel, a dashboard load makes one `/player-games` request plus one per tracked game.
- [ ] **Step 7: Commit** — `feat: redesign dashboard with stat strip and game carousel`

### Task 8: Game page, guides card and achievement panel

**Files:**
- Modify: `frontend/src/pages/GameDetailPage.jsx` (rewrite), `frontend/src/components/AchievementTipRenderer.jsx` (restyle)
- Create: `frontend/src/components/AchievementPanel.jsx`, `frontend/src/components/GuidesCard.jsx`, `frontend/src/utils/sourceType.js`, `frontend/src/utils/sourceType.test.js`
- Modify: `frontend/src/utils/stats.js` + `stats.test.js` (add `rarityBreakdown`)
- Delete: `frontend/src/components/AchievementDetailModal.jsx`, `frontend/src/components/AchievementCard.jsx`

**Interfaces:**
- `inferSourceType(url: string): 'youtube' | 'wiki' | 'article'` in `utils/sourceType.js`.
- `rarityBreakdown(achievements, unlockedIds: Set<number>): Record<'ultra-rare'|'rare'|'uncommon'|'common', { got: number, total: number }>`. Every tier key is always present.
- `GuidesCard({ gameId })`: owns list/add/delete through `dataSourcesAPI`. Add takes a URL only and sends `source_type: inferSourceType(url)`. Rows show a type label (Wiki / Video / Guide) and a link, with an always-visible delete icon button labeled "Remove guide". There is no "Read …" status line.
- `AchievementPanel({ achievement, unlocked, unlockTime, game, open, onClose })`: a native `<dialog>` with `showModal()`. Tip loading moves here from `AchievementDetailModal` (same API call, same localStorage key `achievement-tip-${player.id}-${achievement.id}`, `parseAchievementTip`). There is no tracked-game requirement.
- `AchievementTipRenderer({ parsedTip })`: four sections. "How to unlock" (ordered list), "Time" (bold value), "Watch out" (`warn` box, only if there are warnings), "Tips" (ordered list). Section headings are 11px uppercase `faint`. Sections are wrapped in a `.reveal` container (stagger: 50ms steps, 260ms `--ease-out`, 6px rise; reduced motion is opacity only).

- [ ] **Step 1: Failing tests.** In `sourceType.test.js`: `https://www.youtube.com/watch?v=x`, `https://youtu.be/x` and `https://m.youtube.com/watch?v=x` → `youtube`; `https://stardewvalleywiki.com/Fish` and `https://hollowknight.fandom.com/wiki/Grubs` → `wiki`; `https://steamcommunity.com/sharedfiles/filedetails/?id=1` and `not a url` → `article`. In `stats.test.js`: `rarityBreakdown([], new Set())` has all four keys at `{ got: 0, total: 0 }`; a mixed list counts per tier, with `got` only for IDs in the set.
- [ ] **Step 2: Run the frontend tests.** Expected: fail.
- [ ] **Step 3: Implement `sourceType.js` and `rarityBreakdown`.**
- [ ] **Step 4: Run the frontend tests.** Expected: pass.
- [ ] **Step 5: Implement `AchievementPanel`.**
  - **Desktop:** fixed to the right, `min(460px, 100vw)` wide, enters from `translateX(100%)` over 380ms with `--ease-drawer`. Use `[open]` plus `@starting-style` for the entrance. Close adds a `closing` class, waits for `transitionend` (with a 400ms fallback timer), then calls `dialog.close()`. The `::backdrop` uses `scrim` and fades over 300ms. Under 860px it becomes a bottom sheet, 88vh tall, rounded top corners, entering from `translateY(100%)`. Reduced motion: opacity only, 200ms.
  - **Behavior:** Escape and a backdrop click close it. Focus returns to the row that opened it. Swapping achievements while open does not re-animate.
  - **Content order:** header bar (game name and a close button labeled "Close"), then the hero (64px icon, name, `RarityBadge`, "Locked" or "Unlocked {formatDate}", description), then the "players have this" box with a `ProgressBar` (tone `ultra`), then "Guide" with "Rewrite" when a tip exists.
  - **Guide states:**
    - empty: dashed box, "No guide yet", the line "Gemini writes a step-by-step guide for this achievement.", and an ink "Write a guide" button
    - loading: "Writing your guide…" plus 4 pulsing skeleton lines at widths 92/78/85/60%
    - error: the message plus "Try again"
    - ready: the basis line, then `AchievementTipRenderer`, then the "Steam guides for this" and "Search YouTube" links (today's URLs)
  - **Basis line:** "Written by Gemini." For `app_id === 413150` it reads "Based on the Stardew Valley Wiki. Written by Gemini." (owner decision 2).
- [ ] **Step 6: Implement `GuidesCard` and rewrite `GameDetailPage`** per the spec's Game page section:
  - **Hero:** `library_hero.jpg`, then `header.jpg`, then hidden, with `max-height: 240px` and radius 12.
  - **Header:** title, "{h} h played · Synced {timeAgo}", and Track (`aria-pressed`, label "Tracking"/"Track") plus ink Sync buttons.
  - **Progress strip:** built from `rarityBreakdown`.
  - **Toolbar:**
    - segmented filter, default `all`, remembered in localStorage per game as today
    - search over name and description
    - sort select: Rarest first (default), Most common first, Recently unlocked
  - **List:** `AchievementRow` with `onSelect`.
  - **Side column:** `GuidesCard` (300px wide; stacks under 860px).
  - **Selected achievement:** kept in localStorage as today and reopened after reload.
  - **States:** the loading state is a quiet skeleton; "Game not found" offers a link back.
  - **Cleanup:** remove every `console.log`. Delete `AchievementDetailModal.jsx` and `AchievementCard.jsx`.
- [ ] **Step 7: Verify in the browser** with real data:
  - desktop drawer and 375px bottom sheet, in both themes
  - Escape, backdrop click, and focus return
  - write and rewrite a guide; a forced failure shows "Try again" (stop the backend, then click Write)
  - add a YouTube link and a wiki link and check their labels; remove one
  - a game whose `library_hero.jpg` 404s shows `header.jpg`
- [ ] **Step 8: Commit** — `feat: redesign game page with achievement panel and guides card`

### Task 9: Sweep, optimization page tokens, docs and final check

**Files:** Modify `frontend/src/pages/OptimizationPage.jsx`, `frontend/frontend-README.md`; anything the grep finds.

- [ ] **Step 1: Swap OptimizationPage's color classes for tokens.** No layout change; the purple becomes ink.
- [ ] **Step 2: Find leftovers.** `grep -rnE "steam-(dark|blue|light|accent)|surface-light|surface-lighter|gray-[0-9]{3}|purple-|amber-|bg-gradient|console\.log|🏆|✅|Z-PATTERN" frontend/src` → no matches.
- [ ] **Step 3: Update `frontend/frontend-README.md`.** List the current components (the removed ones gone; `ThemeSwitch`, `GameCarousel`, `AchievementRow`, `AchievementPanel`, `GuidesCard` added) and describe the theme tokens in one short section.
- [ ] **Step 4: Run the backend tests, the frontend tests and `docker compose build frontend`.** Expected: all pass.
- [ ] **Step 5: Final check from the spec's Verification section,** with `docker compose up -d --build`:
  - both themes and no flash on every page
  - 375, 768 and 1280px with `scrollWidth === innerWidth`
  - reduced-motion emulation
  - keyboard-only pass
  - a real Steam sign-in, sync, game page and guide
  - temporarily rename one game in the DB to "Warhammer 40,000: Dawn of War II – Retribution": the card, carousel and game title truncate cleanly at 375px. Revert afterwards.
- [ ] **Step 6: Commit** — `chore: finish redesign sweep and update frontend docs`
