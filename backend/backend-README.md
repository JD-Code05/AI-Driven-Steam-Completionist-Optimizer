# Backend — Flask REST API

The backend is a **Flask 3.1.1** REST API that serves as the central data and business logic layer for the Steam Achievement Optimizer. It handles authentication, database operations, Steam API integration, web scraping, and AI-powered optimization route generation.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Directory Structure](#directory-structure)
4. [App Factory & Configuration](#app-factory--configuration)
5. [Models](#models)
6. [Routes (Blueprints)](#routes-blueprints)
7. [Services](#services)
8. [Authentication](#authentication)
9. [API Endpoints](#api-endpoints)
10. [Running Locally](#running-locally)
11. [Docker](#docker)
12. [Environment Variables](#environment-variables)

---

## Overview

The backend follows the **Flask App Factory** pattern. All business logic is separated into **service classes**, route handlers remain thin, and each entity has its own **Blueprint** with full CRUD operations. JWT tokens are used for stateless authentication after Steam OpenID login.

---

## Tech Stack

| Package | Version | Purpose |
|---------|---------|---------|
| Flask | 3.1.1 | Web framework |
| Flask-SQLAlchemy | 3.1.1 | ORM for MySQL |
| Flask-Migrate | 4.1.0 | Database migrations (Alembic) |
| Flask-CORS | 5.0.1 | Cross-origin request support |
| PyMySQL | 1.1.1 | MySQL driver |
| cryptography | 44.0.3 | Required by PyMySQL for secure connections |
| PyJWT | 2.10.1 | JWT token generation/validation |
| gunicorn | 23.0.0 | Production WSGI server |
| requests | 2.32.3 | HTTP client for Steam API calls |
| beautifulsoup4 | 4.13.4 | HTML parsing for web scraping |
| selenium | 4.32.0 | Headless Chrome for dynamic pages |
| youtube-transcript-api | 1.0.3 | YouTube transcript extraction |
| google-generativeai | 0.8.5 | Gemini AI SDK |
| marshmallow | 3.26.1 | Data serialization |

---

## Directory Structure

```
backend/
├── Dockerfile              # Python 3.11-slim + Chromium for Selenium
├── .dockerignore            # Excludes __pycache__, venv, .env, etc.
├── requirements.txt         # Pinned Python dependencies
├── wsgi.py                  # Entry point: creates app, runs dev server
└── app/
    ├── __init__.py          # create_app() factory — extension init + blueprint registration
    ├── config.py            # Config class — reads all settings from environment variables
    ├── extensions.py        # Shared SQLAlchemy and Migrate instances
    │
    ├── models/              # SQLAlchemy ORM models (7 models)
    │   ├── __init__.py      # Re-exports all models for convenience
    │   ├── player.py        # Steam user profile data
    │   ├── game.py          # Game metadata from Steam
    │   ├── player_game.py   # Many-to-many: player ↔ game ownership/tracking
    │   ├── achievement.py   # Achievement definitions with rarity_tier property
    │   ├── player_achievement.py  # Player's unlock status per achievement
    │   ├── data_source.py   # External guide URLs + scraped content
    │   └── optimization_route.py  # AI-generated optimization plans (Markdown)
    │
    ├── routes/              # Flask Blueprints (10 blueprints)
    │   ├── __init__.py
    │   ├── players.py       # /api/players — Player CRUD
    │   ├── games.py         # /api/games — Game CRUD
    │   ├── player_games.py  # /api/player-games — Player-Game association CRUD
    │   ├── achievements.py  # /api/achievements — Achievement CRUD
    │   ├── player_achievements.py  # /api/player-achievements — Player unlock status CRUD
    │   ├── data_sources.py  # /api/data-sources — Source CRUD + scrape + auto-discover
    │   ├── optimization_routes.py  # /api/optimization-routes — Route CRUD
    │   ├── auth.py          # /api/auth — Steam OpenID login/callback + JWT
    │   ├── sync.py          # /api/sync — Sync games/achievements from Steam API
    │   └── ai.py            # /api/ai — Generate/get/regenerate AI optimization routes
    │
    ├── services/            # Business logic (3 service classes)
    │   ├── __init__.py
    │   ├── steam_api.py     # SteamAPIService — rate-limited Steam Web API wrapper
    │   ├── scraper.py       # ScraperService — web page + YouTube transcript scraping
    │   └── gemini.py        # GeminiService — RAG prompt construction + Gemini AI call
    │
    └── utils/
        ├── __init__.py
        └── auth.py          # JWT token helpers + @auth_required decorator
```

---

## App Factory & Configuration

### `create_app()` — `app/__init__.py`

The factory function:
1. Loads configuration from `Config` class (environment variables)
2. Initializes SQLAlchemy and Flask-Migrate
3. Enables CORS with credentials support
4. Imports all 7 models (so Alembic can detect them)
5. Registers all 10 blueprints with URL prefixes
6. Adds a `/api/health` endpoint for health checks

### `Config` — `app/config.py`

All settings are read from environment variables with sensible defaults:
- **Database**: Constructs `SQLALCHEMY_DATABASE_URI` from `MYSQL_*` vars
- **Auth**: `SECRET_KEY` for JWT signing, `JWT_ALGORITHM` (HS256), `JWT_EXPIRATION_HOURS` (24)
- **API Keys**: `STEAM_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`

---

## Models

All models live in `app/models/` and share these conventions:
- Each model maps to a MySQL table
- Every model implements `to_dict()` for JSON serialization
- Relationships use SQLAlchemy `back_populates` with cascade deletes

### Model Summary

| Model | Table | Key Fields | Notes |
|-------|-------|-----------|-------|
| **Player** | `players` | `steam_id`, `persona_name`, `avatar_url` | Has many player_games, player_achievements, optimization_routes |
| **Game** | `games` | `app_id`, `name`, `total_achievements` | Has many achievements, data_sources, optimization_routes |
| **PlayerGame** | `player_games` | `player_id`, `game_id`, `playtime_hours`, `is_tracked` | Junction table with unique constraint on (player_id, game_id) |
| **Achievement** | `achievements` | `game_id`, `api_name`, `global_percent` | Computed `rarity_tier` property: <5% ultra-rare, <15% rare, <30% uncommon, else common |
| **PlayerAchievement** | `player_achievements` | `player_id`, `achievement_id`, `unlocked`, `unlock_time` | Unique constraint on (player_id, achievement_id) |
| **DataSource** | `data_sources` | `game_id`, `url`, `source_type`, `scraped_content` | Types: wiki, article, blog, youtube, other |
| **OptimizationRoute** | `optimization_routes` | `player_id`, `game_id`, `summary_md`, `prompt_hash` | `prompt_hash` enables deduplication |

### Rarity Tiers

The `Achievement` model has a `@property rarity_tier` that computes:
- **Ultra-Rare**: `global_percent < 5%`
- **Rare**: `global_percent < 15%`
- **Uncommon**: `global_percent < 30%`
- **Common**: `global_percent >= 30%`

---

## Routes (Blueprints)

Each entity has its own Blueprint file providing standard CRUD operations.

### CRUD Pattern

Every CRUD blueprint follows this pattern:
- `GET /` — List all (with optional query parameter filters)
- `GET /<id>` — Get one by primary key
- `POST /` — Create (validates required fields, checks duplicates → 409)
- `PUT /<id>` — Update (partial updates supported)
- `DELETE /<id>` — Delete

### Special Blueprints

**`auth.py`** — Steam OpenID Authentication
- `GET /login` → Redirects to Steam OpenID login page
- `GET /callback` → Validates OpenID response, creates/updates player, returns JWT via redirect
- `GET /me` → Returns current player info from JWT
- `POST /logout` → Acknowledges logout (JWT is stateless)

**`sync.py`** — Steam Data Sync (requires `@auth_required`)
- `POST /games` → Fetches all owned games from Steam, upserts into DB
- `POST /achievements/<app_id>` → Fetches achievement schema, global percentages, and player progress; upserts all

**`ai.py`** — AI Optimization (requires `@auth_required`)
- `POST /generate/<game_id>` → Scrapes unscraped sources → builds RAG context → checks cache (SHA-256 hash) → calls Gemini → saves result
- `GET /routes/<game_id>` → Returns latest cached optimization route
- `POST /regenerate/<game_id>` → Force re-scrapes all sources and regenerates route (ignores cache)

**`data_sources.py`** — Guide Sources (CRUD + extras)
- `POST /<id>/scrape` → Scrapes or re-scrapes a single data source URL
- `POST /auto-discover/<game_id>` → Searches Google for achievement guides, creates DataSource records for discovered URLs

---

## Services

### `SteamAPIService` — `services/steam_api.py`

Wraps all Steam Web API calls with **rate limiting** (1 request per second via `time.sleep`):

| Method | Steam API Endpoint | Returns |
|--------|-------------------|---------|
| `get_player_summary(steam_id)` | `ISteamUser/GetPlayerSummaries/v2` | Player profile dict |
| `get_owned_games(steam_id)` | `IPlayerService/GetOwnedGames/v1` | List of owned game dicts |
| `get_game_achievements_schema(app_id)` | `ISteamUserStats/GetSchemaForGame/v2` | List of achievement definitions |
| `get_player_achievements(steam_id, app_id)` | `ISteamUserStats/GetPlayerAchievements/v1` | List of unlock statuses |
| `get_global_achievement_percentages(app_id)` | `ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2` | Dict of api_name → percentage |

### `ScraperService` — `services/scraper.py`

Scrapes web content for the AI RAG pipeline:

| Method | Description |
|--------|-------------|
| `scrape_url(url)` | Auto-detects YouTube vs regular page, returns `{title, content, error}` |
| `auto_discover_sources(game_name)` | Searches Google for "{game_name} achievement guide", returns up to 5 results |

**Internal details:**
- Regular pages: Uses `requests` + `BeautifulSoup`, strips nav/header/footer/script tags, extracts main content area, truncates at 50K chars
- YouTube: Fetches page metadata (title, description) + extracts transcript via `youtube-transcript-api`, prefers manual English transcripts, falls back to auto-generated
- Source validation: Filters out Google/Facebook/Twitter domains; detects source type from URL (youtube → "youtube", wiki domains → "wiki", etc.)

### `GeminiService` — `services/gemini.py`

Handles Gemini AI integration with RAG:

| Method | Description |
|--------|-------------|
| `generate_optimization(game_name, ach_ctx, src_ctx)` | Builds prompt, calls Gemini, returns `{summary_md, prompt_hash, model_used}` |
| `format_achievements_context(achievements, pa_map)` | Formats achievement list showing locked/unlocked status, rarity, descriptions |
| `format_sources_context(data_sources)` | Concatenates scraped content with 100K char budget, truncates per-source at 20K |

**Prompt deduplication:** SHA-256 hash of the full prompt is stored with each optimization route. If an identical prompt is generated again (same achievements + sources), the cached result is returned instead of making another API call.

**System prompt:** Instructs Gemini to output 7 required Markdown sections: Overview, Recommended Completion Order, Time Estimates, Step-by-Step Techniques, Missable Achievements, Achievement Dependencies, Sources Referenced.

---

## Authentication

### Flow

1. Frontend redirects to `GET /api/auth/login`
2. Backend redirects to Steam OpenID login page
3. User authenticates with Steam
4. Steam redirects to `GET /api/auth/callback` with OpenID claims
5. Backend validates claims with Steam, fetches player profile, creates/updates DB record
6. Backend generates JWT and redirects to frontend with `?token=<jwt>` in the URL
7. Frontend stores JWT in `localStorage`, sends it as `Authorization: Bearer <token>` on subsequent requests

### `@auth_required` Decorator

Applied to sync and AI routes. It:
1. Extracts the JWT from the `Authorization: Bearer` header
2. Decodes and validates the token (checks expiration)
3. Attaches `request.player_id` and `request.steam_id` for the route handler
4. Returns 401 if the token is missing or invalid

---

## API Endpoints

**Total: 42 endpoints** across 10 blueprints + 1 health check.

| Prefix | Blueprint | Auth | Endpoints |
|--------|-----------|------|-----------|
| `/api/health` | (inline) | No | 1 (GET) |
| `/api/auth` | auth | Mixed | 4 (login, callback, me, logout) |
| `/api/players` | players | No | 5 (CRUD) |
| `/api/games` | games | No | 5 (CRUD) |
| `/api/player-games` | player_games | No | 5 (CRUD) |
| `/api/achievements` | achievements | No | 5 (CRUD) |
| `/api/player-achievements` | player_achievements | No | 5 (CRUD) |
| `/api/data-sources` | data_sources | No | 7 (CRUD + scrape + auto-discover) |
| `/api/optimization-routes` | optimization_routes | No | 5 (CRUD) |
| `/api/sync` | sync | Yes | 2 (games, achievements) |
| `/api/ai` | ai | Yes | 3 (generate, get, regenerate) |

---

## Running Locally

### With Docker (recommended)

```bash
# From the project root
docker-compose up --build backend db
```

### Without Docker

```bash
cd backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate    # macOS/Linux
# venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Set required environment variables
export MYSQL_HOST=localhost
export MYSQL_PORT=3306
export MYSQL_DATABASE=steam_optimizer
export MYSQL_USER=steam_user
export MYSQL_PASSWORD=your_password
export FLASK_SECRET_KEY=dev_secret
export STEAM_API_KEY=your_key
export GEMINI_API_KEY=your_key
export FLASK_ENV=development
export FLASK_DEBUG=1

# Run development server
python wsgi.py
```

The server starts on `http://localhost:5000`. You need a running MySQL 8.0 instance with the schema from `database/init.sql`.

---

## Docker

The Dockerfile uses `python:3.11-slim` as the base image and installs:
- **Chromium + ChromeDriver** for Selenium-based scraping
- All Python dependencies from `requirements.txt`

**Production command:** `gunicorn --bind 0.0.0.0:5000 --workers 2 --timeout 120 wsgi:app`

Key environment variables are set:
- `CHROME_BIN=/usr/bin/chromium`
- `CHROMEDRIVER_PATH=/usr/bin/chromedriver`
- `PYTHONDONTWRITEBYTECODE=1`
- `PYTHONUNBUFFERED=1`

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MYSQL_HOST` | Yes | `localhost` | MySQL hostname |
| `MYSQL_PORT` | Yes | `3306` | MySQL port |
| `MYSQL_DATABASE` | Yes | `steam_optimizer` | Database name |
| `MYSQL_USER` | Yes | `steam_user` | Database user |
| `MYSQL_PASSWORD` | Yes | — | Database password |
| `FLASK_SECRET_KEY` | Yes | `dev-secret-key` | Secret for JWT signing |
| `STEAM_API_KEY` | Yes | — | Steam Web API key |
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key |
| `GEMINI_MODEL` | No | `gemini-2.0-flash` | Gemini model name |
| `FLASK_ENV` | No | `production` | `development` or `production` |
| `FLASK_DEBUG` | No | `0` | Set to `1` for debug mode with auto-reload |
