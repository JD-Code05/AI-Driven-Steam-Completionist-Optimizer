# CLAUDE.md — AI-Driven Steam Achievement Optimizer

This file provides project context for AI assistants working on this codebase.

## Project Overview

A 3-tier web application that helps Steam gamers optimize their achievement hunting. It syncs game/achievement data from the Steam Web API, scrapes guide content from the web and YouTube, and uses Gemini AI (RAG) to generate personalized achievement-completion routes.

## Architecture

```
Frontend (React 19 + Vite 6 + Tailwind v4)
    ↕  REST / JSON / JWT Bearer
Backend (Flask 3.1.1 + SQLAlchemy + Gunicorn)
    ↕  PyMySQL
Database (MySQL 8.0)
```

All three tiers run as Docker containers (compose for local dev, Kubernetes for production).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, Tailwind CSS v4, axios, react-router-dom v7, react-icons, react-markdown |
| Backend | Flask 3.1.1, Flask-SQLAlchemy, Flask-Migrate, Flask-CORS, PyMySQL, PyJWT, gunicorn |
| AI | Google Gemini 2.0 Flash via `google-generativeai` SDK |
| Scraping | BeautifulSoup4, Selenium (headless Chrome), youtube-transcript-api |
| Database | MySQL 8.0 (utf8mb4) |
| Infra | Docker (multi-stage), Docker Compose, Kubernetes (Docker Desktop) |

## Project Structure

```
steam-optimizer/
├── backend/
│   ├── Dockerfile                 # Python 3.11-slim + Chromium, gunicorn
│   ├── requirements.txt           # 15 pinned packages
│   ├── wsgi.py                    # App factory entry point
│   └── app/
│       ├── __init__.py            # create_app(), registers 10 blueprints + /api/health
│       ├── config.py              # Env-based config (DB URI, API keys, JWT)
│       ├── extensions.py          # db = SQLAlchemy(), migrate = Migrate()
│       ├── models/                # 7 SQLAlchemy models, each with to_dict()
│       │   ├── player.py
│       │   ├── game.py
│       │   ├── player_game.py
│       │   ├── achievement.py     # includes rarity_tier property
│       │   ├── player_achievement.py
│       │   ├── data_source.py
│       │   └── optimization_route.py
│       ├── routes/                # Flask Blueprints (one per entity + auth/sync/ai)
│       │   ├── players.py         # /api/players — CRUD
│       │   ├── games.py           # /api/games — CRUD
│       │   ├── player_games.py    # /api/player-games — CRUD
│       │   ├── achievements.py    # /api/achievements — CRUD
│       │   ├── player_achievements.py  # /api/player-achievements — CRUD
│       │   ├── data_sources.py    # /api/data-sources — CRUD + scrape + auto-discover
│       │   ├── optimization_routes.py  # /api/optimization-routes — CRUD
│       │   ├── auth.py            # /api/auth — Steam OpenID login/callback, JWT
│       │   ├── sync.py            # /api/sync — sync games/achievements from Steam
│       │   └── ai.py              # /api/ai — generate/get/regenerate optimization routes
│       ├── services/
│       │   ├── steam_api.py       # SteamAPIService — rate-limited Steam Web API calls
│       │   ├── scraper.py         # ScraperService — web/YouTube scraping, auto-discover
│       │   └── gemini.py          # GeminiService — RAG prompt construction, dedup, Gemini call
│       └── utils/
│           └── auth.py            # generate_token, decode_token, @auth_required decorator
├── frontend/
│   ├── Dockerfile                 # Multi-stage: node:20-alpine build → nginx:alpine
│   ├── nginx.conf                 # Proxy /api/ → backend:5000, SPA fallback
│   ├── package.json               # React 19, Vite 6, Tailwind v4
│   ├── vite.config.js             # Tailwind plugin, dev proxy to localhost:5000
│   └── src/
│       ├── index.css              # Tailwind v4 @theme (custom colors, rarity tiers)
│       ├── main.jsx               # StrictMode + BrowserRouter + AuthProvider
│       ├── App.jsx                # 4 routes: /login, /dashboard, /games/:id, /games/:id/optimize
│       ├── context/AuthContext.jsx # JWT handling, player state, login/logout
│       ├── services/api.js        # Axios instance + all API wrappers (auth, sync, games, ai, etc.)
│       ├── components/            # Reusable UI (Navbar, Layout, GameCard, AchievementCard, etc.)
│       └── pages/                 # LoginPage, DashboardPage, GameDetailPage, OptimizationPage
├── database/
│   ├── Dockerfile                 # mysql:8.0 + custom config
│   └── init.sql                   # 7-table DDL + Elden Ring seed data
├── k8s/                           # Kubernetes manifests
│   ├── namespace.yaml             # steam-optimizer namespace
│   ├── configmap.yaml
│   ├── secrets.yaml               # Base64 placeholders — replace before deploying
│   ├── mysql/                     # PV, PVC, Deployment, Service
│   ├── backend/                   # Deployment (2 replicas), Service
│   ├── frontend/                  # ConfigMap (nginx.conf), Deployment (2 replicas), NodePort 30000
│   └── ingress.yaml               # Placeholder for production domain
├── docker-compose.yml             # Production: bridge network, health checks, named volumes
├── docker-compose.dev.yml         # Dev: volume mounts, hot-reload, FLASK_DEBUG=1
├── deploy.sh                      # K8s deployment script (build → apply → wait → status)
├── .env.example                   # All env vars with comments
└── .gitignore
```

## Key Patterns & Conventions

### Backend

- **App Factory**: `create_app()` in `app/__init__.py` — all blueprints registered there.
- **Blueprint per entity**: Each route file defines a Blueprint with full CRUD (GET list, GET one, POST, PUT, DELETE).
- **Model serialization**: Every model has a `to_dict()` method returning a JSON-safe dict.
- **Auth decorator**: `@auth_required` from `app/utils/auth.py` — extracts JWT from `Authorization: Bearer <token>`, attaches `g.current_player`.
- **Service classes**: Business logic lives in `app/services/` (SteamAPIService, ScraperService, GeminiService) — route handlers stay thin.
- **Rate limiting**: Steam API calls are throttled to 1 request/second via `time.sleep()` in SteamAPIService.
- **RAG dedup**: GeminiService uses SHA-256 hash of the prompt to skip regeneration if an identical route already exists.

### Frontend

- **Auth flow**: Steam OpenID redirects to backend → callback returns JWT in query string → AuthContext stores in localStorage.
- **Protected routes**: `<ProtectedRoute>` wrapper redirects to `/login` if no token.
- **API layer**: All HTTP calls go through `src/services/api.js` (axios instance with JWT interceptor).
- **Z-pattern dashboard**: DashboardPage uses a deliberate Z-pattern layout (profile → stats → games → achievements → AI CTA).
- **Tailwind v4**: Custom theme defined in `index.css` with `@theme` block, not `tailwind.config.js`.

### Database

- **7 tables**: players, games, player_games, achievements, player_achievements, data_sources, optimization_routes.
- **Schema**: `init.sql` handles DDL (CREATE TABLE IF NOT EXISTS) + seed data. Flask-Migrate for subsequent migrations.
- **Rarity tiers**: Achievement model computes `rarity_tier` from `global_unlock_percentage`: <5% ultra-rare, <15% rare, <30% uncommon, else common.

## Common Commands

```bash
# Local dev with Docker Compose
cp .env.example .env          # fill in Steam API key + Gemini API key
docker-compose up --build

# Dev mode with hot-reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Kubernetes deployment
chmod +x deploy.sh && ./deploy.sh

# Teardown K8s
kubectl delete namespace steam-optimizer
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MYSQL_HOST` | Yes | Database host (use `db` in Docker) |
| `MYSQL_PORT` | Yes | Database port (default 3306) |
| `MYSQL_DATABASE` | Yes | Database name |
| `MYSQL_USER` | Yes | Database user |
| `MYSQL_PASSWORD` | Yes | Database password |
| `MYSQL_ROOT_PASSWORD` | Yes | MySQL root password |
| `FLASK_SECRET_KEY` | Yes | Secret for JWT signing |
| `STEAM_API_KEY` | Yes | From https://steamcommunity.com/dev/apikey |
| `GEMINI_API_KEY` | Yes | From https://aistudio.google.com/app/apikey |
| `GEMINI_MODEL` | No | Gemini model name (default: `gemini-2.0-flash`) |
| `FLASK_ENV` | No | `development` or `production` |
| `FLASK_DEBUG` | No | `1` for debug mode |

## API Endpoints (42 total)

- **CRUD**: `/api/players`, `/api/games`, `/api/player-games`, `/api/achievements`, `/api/player-achievements`, `/api/data-sources`, `/api/optimization-routes` — standard GET/POST/PUT/DELETE
- **Auth**: `/api/auth/login`, `/api/auth/callback`, `/api/auth/me`, `/api/auth/logout`
- **Sync** (auth required): `POST /api/sync/games`, `POST /api/sync/achievements/<app_id>`
- **AI** (auth required): `POST /api/ai/generate/<game_id>`, `GET /api/ai/routes/<game_id>`, `POST /api/ai/regenerate/<game_id>`
- **Scraping**: `POST /api/data-sources/<id>/scrape`, `POST /api/data-sources/auto-discover/<game_id>`
- **Health**: `GET /api/health`
