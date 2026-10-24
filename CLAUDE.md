# CLAUDE.md — Steam Achievement Optimizer

Project context for AI assistants working in this repo.

## Project Overview

A 3-tier web app for Steam achievement hunters. You sign in with Steam, sync your library and achievements from the Steam Web API, see which achievements are left (sorted by rarity), save guide links per game, and ask Gemini for a step-by-step guide to a single achievement.

## Architecture

```
Frontend (React 19 + Vite 6 + Tailwind v4, served by nginx)
    ↕  REST / JSON / JWT Bearer   (nginx proxies /api/ → backend:5000)
Backend (Flask 3.1 + SQLAlchemy, gunicorn with 2 workers)
    ↕  PyMySQL
Database (MySQL 8.0, utf8mb4)
```

All three tiers run as Docker containers: Docker Compose locally, Kubernetes (Docker Desktop) for the deploy script.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`), axios, react-router-dom v7, react-icons, react-markdown |
| Backend | Flask 3.1.1, Flask-SQLAlchemy, Flask-Migrate, Flask-CORS, PyMySQL, PyJWT, gunicorn, requests, BeautifulSoup4 |
| AI | Google Gemini via the `google-generativeai` SDK (deprecated; `google-genai` is its replacement), default model `gemini-2.5-flash` |
| Artwork | Steam CDN cover art first, SteamGridDB as fallback |
| Database | MySQL 8.0 |
| Tests | Backend: stdlib `unittest` on in-memory SQLite. Frontend utils: `node --test` |

## Project Structure

```
./
├── backend/
│   ├── Dockerfile                 # Python 3.11-slim, gunicorn
│   ├── wsgi.py
│   ├── app/
│   │   ├── __init__.py            # create_app(): 9 blueprints + /api/health
│   │   ├── config.py              # env-based config
│   │   ├── models/                # 7 models, each with to_dict()
│   │   ├── routes/
│   │   │   ├── auth.py            # Steam OpenID login/callback, /me, /logout
│   │   │   ├── sync.py            # sync games / one game's achievements from Steam
│   │   │   ├── ai.py              # POST /api/ai/achievement-tip/<id> (Gemini)
│   │   │   ├── games.py, achievements.py, player_games.py, player_achievements.py
│   │   │   ├── data_sources.py    # per-game guide links (http(s) only)
│   │   │   └── steamgriddb.py     # cover-art lookup
│   │   ├── services/
│   │   │   ├── steam_api.py       # SteamAPIService, 1 request/second
│   │   │   ├── scraper.py         # ScraperService.scrape_url (requests + BeautifulSoup)
│   │   │   └── steamgriddb.py     # SteamGridDBService
│   │   └── utils/auth.py          # generate_token, decode_token, @auth_required
│   └── tests/                     # unittest; base.py has app/player/game/auth helpers
├── frontend/
│   ├── nginx.conf                 # /api/ proxy, SPA fallback, index.html no-cache
│   └── src/
│       ├── App.jsx                # /login, /dashboard, /games/:gameId, /games/:gameId/optimize
│       ├── index.css              # Tailwind v4 @theme inline tokens, light/dark
│       ├── context/AuthContext.jsx
│       ├── services/api.js        # axios + authAPI, syncAPI, gamesAPI, playerGamesAPI,
│       │                          #   achievementsAPI, playerAchievementsAPI, dataSourcesAPI, aiAPI
│       ├── components/            # Navbar, Layout, GameCard, GameCarousel, AchievementRow,
│       │                          #   AchievementPanel, AchievementTipRenderer, GuidesCard,
│       │                          #   RarityBadge, ProgressBar, ThemeSwitch, ProtectedRoute
│       ├── pages/                 # LoginPage, DashboardPage, GameDetailPage, OptimizationPage
│       └── utils/                 # format, stats, sourceType, theme, achievementTipParser (+ *.test.js)
├── database/init.sql              # 7-table DDL (no seed data)
├── k8s/                           # namespace, configmap, secrets (placeholders), mysql, backend, frontend, ingress
├── docker-compose.yml             # db, backend, frontend
├── docker-compose.dev.yml         # dev overrides: volume mounts, FLASK_DEBUG=1
├── deploy.sh                      # K8s build → apply → wait → status
├── docs/superpowers/              # UI redesign spec, mockups, security + redesign plan
└── .env.example
```

## Key Patterns & Conventions

### Backend

- **App factory**: `create_app()` in `app/__init__.py` registers every blueprint.
- **Auth**: `@auth_required` reads `Authorization: Bearer <token>` and sets `request.player_id` and `request.steam_id`. Every data endpoint requires it.
- **Scoping**: player data is always the caller's (`request.player_id`). Any `player_id` query parameter is ignored. Data-source writes require the game to be in the caller's library (`owns_game`).
- **Login redirect** only goes back to `FRONTEND_URL`.
- **Thin routes, services for external calls** (Steam, SteamGridDB, scraping).
- **AI tips**: `ai.py` builds a prompt for one achievement and calls Gemini. Only Stardew Valley gets scraped reference material (the Stardew wiki); that hardcoded RAG is the owner's proof of concept, so keep it. Tips are cached in the browser's `localStorage`, not on the server.
- **Rarity tiers** (`Achievement.rarity_tier`, from `global_percent`): <5% ultra-rare, <15% rare, <30% uncommon, else common.

### Frontend

- **Auth flow**: Steam OpenID → backend callback → redirect to the frontend with a JWT in the query string → `AuthContext` stores it in `localStorage`. `ProtectedRoute` redirects to `/login` and forwards `?error=`.
- **All HTTP** goes through `src/services/api.js` (axios instance with a JWT interceptor).
- **Theme**: light/dark tokens in `index.css` (`@theme inline`; no `dark:` variants), a no-flash script in `index.html`, and `utils/theme.js`.
- **Game page**: click an achievement row to open `AchievementPanel` (a native `<dialog>` drawer or bottom sheet) with "Write a guide".
- `frontend/frontend-README.md` lists the components and theme tokens.

### Database

- 7 tables: players, games, player_games, achievements, player_achievements, data_sources, optimization_routes.
- `init.sql` creates the schema (`CREATE TABLE IF NOT EXISTS`). Flask-Migrate is installed for later migrations.

## Not built yet

- **Full-game optimization route**: `OptimizationPage` calls `aiAPI.getRoute/generate/regenerate`, which don't exist, and the `optimization_routes` table is unused. Its `prose-*` classes would need `@tailwindcss/typography`, which isn't installed.
- AI tips that read the user's saved guide links for any game (generalize the Stardew proof of concept).
- Server-side tip caching, automatic guide discovery, YouTube transcripts.

## Common Commands

Run these from the repo root. On Git Bash, prefix docker commands with `MSYS_NO_PATHCONV=1` if paths get mangled. There are no local `node_modules`; builds run in Docker.

```bash
cp .env.example .env                       # fill in the Steam, SteamGridDB and Gemini keys
docker compose up -d --build               # frontend http://localhost:3000, backend :5000

# backend tests
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --no-deps backend python -m unittest discover -s tests -v

# frontend util tests
node --test "frontend/src/utils/*.test.js"

./deploy.sh                                # Kubernetes
kubectl delete namespace steam-optimizer   # tear down Kubernetes
```

## Environment Variables

Set in `.env` (see `.env.example`):

| Variable | Description |
|----------|-------------|
| `STEAM_API_KEY` | From https://steamcommunity.com/dev/apikey |
| `STEAMGRIDDB_API_KEY` | Optional; cover-art fallback |
| `GEMINI_API_KEY` | From https://aistudio.google.com/app/apikey |
| `GEMINI_MODEL` | Optional, default `gemini-2.5-flash` |
| `BACKEND_URL` | Default `http://localhost:5000` (Steam OpenID return URL) |
| `FRONTEND_URL` | Default `http://localhost:3000`; the only allowed login redirect |
| `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | Database passwords |
| `FLASK_SECRET_KEY` | Signs the JWTs |

Compose sets `MYSQL_HOST=db` and `MYSQL_PORT=3306`. `MYSQL_DATABASE` and `MYSQL_USER` default to `steam_optimizer` and `steam_user`. k8s hardcodes `FRONTEND_URL` to localhost:3000; change it before a real deploy.

## API Endpoints (19)

All require a JWT except login, callback and health.

- **Auth**: `GET /api/auth/login`, `GET /api/auth/callback`, `GET /api/auth/me`, `POST /api/auth/logout`
- **Sync**: `POST /api/sync/games`, `POST /api/sync/achievements/<app_id>`
- **AI**: `POST /api/ai/achievement-tip/<achievement_id>`
- **Games**: `GET /api/games`, `GET /api/games/<id>`
- **Player games**: `GET /api/player-games[?tracked=true]` (includes `unlocked_count` and `completed_at`), `PUT /api/player-games/<id>` (only `is_tracked` is writable)
- **Achievements**: `GET /api/achievements?game_id=`
- **Player achievements**: `GET /api/player-achievements?game_id=`
- **Data sources**: `GET /api/data-sources?game_id=`, `POST /api/data-sources`, `PUT|DELETE /api/data-sources/<id>`
- **Artwork**: `GET /api/steamgriddb/grid/<app_id>`
- **Health**: `GET /api/health`

## Working rules

- Never add a `Co-Authored-By: Claude` line to commits or a "Generated with Claude Code" footer to PRs.
- The owner pushes and opens PRs (GitHub `JD-Code05`). `gh` isn't installed, so give prefilled `https://github.com/JD-Code05/AI-Driven-Steam-Completionist-Optimizer/compare/...` links. Push only when asked.
- The local DB holds real data: player id 2 is the owner's Steam account. Never modify or delete it or the rows it uses. For UI tests, create a throwaway player and games (app_ids not already in the DB), mint a token with `generate_token` inside the backend container, and delete everything you created afterwards.
- Prefer the smallest complete change and plain-language replies.
