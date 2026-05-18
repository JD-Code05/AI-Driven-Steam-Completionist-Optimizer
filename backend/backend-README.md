# Backend — Flask REST API

The backend is a **Flask 3.1.1** REST API that serves as the central data and business logic layer for the Steam Achievement Optimizer. It handles authentication, database operations, Steam API integration, web scraping, and AI-powered per-achievement tip generation.

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

The AI flow is focused on **per-achievement guidance** — when a user clicks an achievement, a single Gemini API call generates a structured 4-section guide for that specific achievement. There is no bulk game-level optimization route generation.

---

## Tech Stack

| Package             | Version | Purpose                                        |
| ------------------- | ------- | ---------------------------------------------- |
| Flask               | 3.1.1   | Web framework                                  |
| Flask-SQLAlchemy    | 3.1.1   | ORM for MySQL                                  |
| Flask-Migrate       | 4.1.0   | Database migrations (Alembic)                  |
| Flask-CORS          | 5.0.1   | Cross-origin request support                   |
| PyMySQL             | 1.1.1   | MySQL driver                                   |
| cryptography        | 44.0.3  | Required by PyMySQL for secure connections     |
| PyJWT               | 2.10.1  | JWT token generation/validation                |
| python-dotenv       | 1.1.0   | Load `.env` file into environment              |
| gunicorn            | 23.0.0  | Production WSGI server                         |
| requests            | 2.32.3  | HTTP client for Steam API calls + web scraping |
| beautifulsoup4      | 4.13.4  | HTML parsing for web scraping                  |
| google-generativeai | 0.8.5   | Gemini AI SDK                                  |
| marshmallow         | 3.26.1  | Data serialization                             |

---

## Directory Structure

```
backend/
├── Dockerfile              # Python 3.11-slim + MySQL client tools only
├── .dockerignore           # Excludes __pycache__, venv, .env, etc.
├── requirements.txt        # Pinned Python dependencies
├── wsgi.py                 # Entry point: creates app, runs dev server
└── app/
    ├── __init__.py         # create_app() factory — extension init + blueprint registration
    ├── config.py           # Config class — reads all settings from environment variables
    ├── extensions.py       # Shared SQLAlchemy and Migrate instances
    │
    ├── models/             # SQLAlchemy ORM models (7 models)
    │   ├── __init__.py     # Re-exports all models for convenience
    │   ├── player.py       # Steam user profile data
    │   ├── game.py         # Game metadata from Steam
    │   ├── player_game.py  # Many-to-many: player ↔ game ownership/tracking
    │   ├── achievement.py  # Achievement definitions with rarity_tier property
    │   ├── player_achievement.py  # Player's unlock status per achievement
    │   ├── data_source.py  # Bookmark URLs (user-managed guide links)
    │   └── optimization_route.py  # Legacy model — kept for DB compatibility
    │
    ├── routes/             # Flask Blueprints (10 blueprints)
    │   ├── __init__.py
    │   ├── players.py      # /api/players — Player CRUD
    │   ├── games.py        # /api/games — Game CRUD
    │   ├── player_games.py # /api/player-games — Player-Game association CRUD
    │   ├── achievements.py # /api/achievements — Achievement CRUD
    │   ├── player_achievements.py  # /api/player-achievements — Player unlock status CRUD
    │   ├── data_sources.py # /api/data-sources — Bookmark CRUD (no scraping)
    │   ├── auth.py         # /api/auth — Steam OpenID login/callback + JWT
    │   ├── sync.py         # /api/sync — Sync games/achievements from Steam API
    │   ├── ai.py           # /api/ai — Per-achievement AI tip generation
    │   └── steamgriddb.py  # /api/steamgriddb — Proxy for SteamGridDB artwork
    │
    ├── services/           # Business logic (3 service classes)
    │   ├── __init__.py
    │   ├── steam_api.py    # SteamAPIService — rate-limited Steam Web API wrapper
    │   ├── scraper.py      # ScraperService — web page scraping (BS4 only)
    │   └── steamgriddb.py  # SteamGridDBService — high-quality game artwork proxy
    │
    └── utils/
        ├── __init__.py
        └── auth.py         # JWT token helpers + @auth_required decorator
```

---

## App Factory & Configuration

### `create_app()` — `app/__init__.py`

The factory function:

1. Loads configuration from `Config` class (environment variables)
2. Initializes SQLAlchemy and Flask-Migrate
3. Enables CORS with credentials support
4. Imports all 7 models (so Alembic can detect them)
5. Registers all **10 blueprints** with URL prefixes
6. Adds a `/api/health` endpoint for container health checks

### `Config` — `app/config.py`

All settings are read from environment variables with sensible defaults:

- **Database**: Constructs `SQLALCHEMY_DATABASE_URI` from `MYSQL_*` vars
- **Auth**: `SECRET_KEY` for JWT signing, `JWT_ALGORITHM` (HS256), `JWT_EXPIRATION_HOURS` (24)
- **API Keys**: `STEAM_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `STEAMGRIDDB_API_KEY`

---

## Models

All models live in `app/models/` and share these conventions:

- Each model maps to a MySQL table
- Every model implements `to_dict()` for JSON serialization
- Relationships use SQLAlchemy `back_populates` with cascade deletes

### Model Summary

| Model                 | Table                 | Key Fields                                                | Notes                                                                                       |
| --------------------- | --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Player**            | `players`             | `steam_id`, `persona_name`, `avatar_url`                  | Has many player_games, player_achievements                                                  |
| **Game**              | `games`               | `app_id`, `name`, `total_achievements`, `img_capsule_url` | Has many achievements, data_sources                                                         |
| **PlayerGame**        | `player_games`        | `player_id`, `game_id`, `playtime_hours`, `is_tracked`    | Junction table — unique on (player_id, game_id)                                             |
| **Achievement**       | `achievements`        | `game_id`, `api_name`, `global_percent`                   | Computed `rarity_tier` property                                                             |
| **PlayerAchievement** | `player_achievements` | `player_id`, `achievement_id`, `unlocked`, `unlock_time`  | Unique on (player_id, achievement_id)                                                       |
| **DataSource**        | `data_sources`        | `game_id`, `url`, `title`, `source_type`                  | User-managed bookmarks. Types: `wiki`, `article`, `blog`, `steam_guide`, `youtube`, `other` |
| **OptimizationRoute** | `optimization_routes` | `player_id`, `game_id`, `summary_md`, `prompt_hash`       | Legacy — kept for DB schema compatibility, not used by any active endpoint                  |

### Rarity Tiers

The `Achievement` model has a `@property rarity_tier` that computes from `global_percent`:

- **Ultra-Rare**: `< 5%`
- **Rare**: `< 15%`
- **Uncommon**: `< 30%`
- **Common**: `>= 30%`

---

## Routes (Blueprints)

### CRUD Pattern

Standard CRUD blueprints (`players`, `games`, `player_games`, `achievements`, `player_achievements`, `data_sources`) follow this pattern:

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
- `POST /logout` → Acknowledges logout (JWT is stateless, cleared by client)

**`sync.py`** — Steam Data Sync (requires `@auth_required`)

- `POST /games` → Fetches all owned games from Steam API, upserts into DB (playtime, metadata)
- `POST /achievements/<app_id>` → Fetches achievement schema, global percentages, and player progress; upserts all three in one transaction

**`ai.py`** — Per-Achievement AI Tips (requires `@auth_required`)

- `POST /achievement-tip/<achievement_id>` → Generates a focused AI guide for a single achievement

  **Flow:**
  1. Load achievement + parent game from DB
  2. Check player's unlock status for context
  3. For Stardew Valley (`app_id == 413150`): scrape the Stardew Valley Wiki as RAG context
  4. Build a structured user prompt with achievement metadata + optional scraped content
  5. Call Gemini API inline (no GeminiService wrapper) with structured system prompt
  6. Return `{ achievement_id, achievement_name, tip_md, model_used }`

  **Gemini system prompt** requires exactly 4 sections in this order:
  - `## How to Unlock` — numbered steps
  - `## Time Estimate` — specific time range (never empty)
  - `## Important Warnings` — missable elements or prerequisites; `None` if not applicable
  - `## Pro Tips` — 2–3 numbered practical tips

  **Settings:** `temperature=0.5`, `max_output_tokens=2048`

  > **Note:** Tips are **not stored in the database**. Tip caching/persistence is handled entirely on the frontend via `localStorage` keyed by `achievement-tip-{playerId}-{achievementId}`.

**`data_sources.py`** — Bookmark Management (CRUD only)

- Allows users to save, update, and delete guide URLs per game
- Source types supported: `wiki`, `article`, `blog`, `steam_guide`, `youtube`, `other`

**`steamgriddb.py`** — SteamGridDB Artwork Proxy

- `GET /grid/<app_id>` → Returns `{ url: "<high-res image url>" }` or `{ url: null }`
- Keeps `STEAMGRIDDB_API_KEY` server-side, never exposed to the browser
- Tries `600x900` portrait grid first; falls back to any available grid

---

## Services

### `SteamAPIService` — `services/steam_api.py`

Wraps all Steam Web API calls with **rate limiting** (1 request per second via `time.sleep`):

| Method                                       | Steam API Endpoint                                         | Returns                         |
| -------------------------------------------- | ---------------------------------------------------------- | ------------------------------- |
| `get_player_summary(steam_id)`               | `ISteamUser/GetPlayerSummaries/v2`                         | Player profile dict             |
| `get_owned_games(steam_id)`                  | `IPlayerService/GetOwnedGames/v1`                          | List of owned game dicts        |
| `get_game_achievements_schema(app_id)`       | `ISteamUserStats/GetSchemaForGame/v2`                      | List of achievement definitions |
| `get_player_achievements(steam_id, app_id)`  | `ISteamUserStats/GetPlayerAchievements/v1`                 | List of unlock statuses         |
| `get_global_achievement_percentages(app_id)` | `ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2` | Dict of `api_name → percentage` |

### `ScraperService` — `services/scraper.py`

Scrapes web pages using `requests` + `BeautifulSoup`:

| Method            | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `scrape_url(url)` | Scrapes a web page, returns `{title, content, error}` |

**Internal details:**

- Configures a `requests.Session` with automatic retry logic (3 retries, exponential backoff, handles 429/5xx)
- Strips boilerplate tags: `nav`, `header`, `footer`, `aside`, `script`, `style`, `noscript`, `iframe`, `form`
- Finds main content via: `<main>` → `<article>` → `#mw-content-text` (MediaWiki) → `.content/.article/.post` → `<body>`
- Extracts headings (`h1`–`h4`), paragraphs, list items, and table cells with minimal formatting
- Truncates at **50,000 characters** to avoid LLM context overflow
- Currently used by `ai.py` to scrape the Stardew Valley Wiki for RAG context when `app_id == 413150`

### `SteamGridDBService` — `services/steamgriddb.py`

Fetches high-quality game artwork from [SteamGridDB](https://www.steamgriddb.com/):

| Method                             | Description                                                |
| ---------------------------------- | ---------------------------------------------------------- |
| `get_grid_image_url(steam_app_id)` | Returns URL of best 600×900 portrait grid image, or `None` |
| `get_hero_image_url(steam_app_id)` | Returns URL of best wide hero/banner image, or `None`      |

Used by `routes/steamgriddb.py` to proxy requests from the frontend `GameCard` component.

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

**Total: 37 endpoints** across 10 blueprints + 1 health check.

| Prefix                     | Blueprint           | Auth  | Endpoints                                   |
| -------------------------- | ------------------- | ----- | ------------------------------------------- |
| `/api/health`              | (inline)            | No    | 1 (GET)                                     |
| `/api/auth`                | auth                | Mixed | 4 (login, callback, me, logout)             |
| `/api/players`             | players             | No    | 5 (CRUD)                                    |
| `/api/games`               | games               | No    | 5 (CRUD)                                    |
| `/api/player-games`        | player_games        | No    | 5 (CRUD)                                    |
| `/api/achievements`        | achievements        | No    | 5 (CRUD)                                    |
| `/api/player-achievements` | player_achievements | No    | 5 (CRUD)                                    |
| `/api/data-sources`        | data_sources        | No    | 4 (CRUD only — no scrape, no auto-discover) |
| `/api/sync`                | sync                | Yes   | 2 (games, achievements)                     |
| `/api/ai`                  | ai                  | Yes   | 1 (achievement-tip)                         |
| `/api/steamgriddb`         | steamgriddb         | No    | 1 (grid image proxy)                        |

### Full Endpoint Reference

| Method              | Endpoint                                   | Auth   | Description                              |
| ------------------- | ------------------------------------------ | ------ | ---------------------------------------- |
| GET                 | `/api/health`                              | No     | Health check for Docker/K8s probes       |
| GET                 | `/api/auth/login`                          | No     | Redirect to Steam OpenID                 |
| GET                 | `/api/auth/callback`                       | No     | Steam OpenID callback — creates JWT      |
| GET                 | `/api/auth/me`                             | Bearer | Return current player profile            |
| POST                | `/api/auth/logout`                         | No     | Client-side logout acknowledgement       |
| POST                | `/api/sync/games`                          | Bearer | Sync all owned games from Steam          |
| POST                | `/api/sync/achievements/<app_id>`          | Bearer | Sync achievements for one game           |
| POST                | `/api/ai/achievement-tip/<achievement_id>` | Bearer | Generate AI tip for a single achievement |
| GET                 | `/api/data-sources`                        | No     | List bookmarks for a game (`?game_id=`)  |
| POST                | `/api/data-sources`                        | No     | Add a bookmark                           |
| PUT                 | `/api/data-sources/<id>`                   | No     | Update a bookmark                        |
| DELETE              | `/api/data-sources/<id>`                   | No     | Delete a bookmark                        |
| GET                 | `/api/steamgriddb/grid/<app_id>`           | No     | Get high-res artwork URL                 |
| GET/POST/PUT/DELETE | `/api/players`, `/api/games`, etc.         | No     | Standard CRUD for all 5 entity types     |

---

## Running Locally

### With Docker (recommended)

```bash
# From the project root
docker compose up --build backend db
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

The `Dockerfile` uses `python:3.11-slim` as the base image and installs only:

- Essential build tools: `gcc`, `default-libmysqlclient-dev`, `pkg-config`
- All Python dependencies from `requirements.txt`

**Production command:** `gunicorn --bind 0.0.0.0:5000 --workers 2 --timeout 120 wsgi:app`

Key environment variables set in the image:

- `PYTHONDONTWRITEBYTECODE=1`
- `PYTHONUNBUFFERED=1`

---

## Environment Variables

| Variable              | Required | Default            | Description                                |
| --------------------- | -------- | ------------------ | ------------------------------------------ |
| `MYSQL_HOST`          | Yes      | `localhost`        | MySQL hostname                             |
| `MYSQL_PORT`          | Yes      | `3306`             | MySQL port                                 |
| `MYSQL_DATABASE`      | Yes      | `steam_optimizer`  | Database name                              |
| `MYSQL_USER`          | Yes      | `steam_user`       | Database user                              |
| `MYSQL_PASSWORD`      | Yes      | —                  | Database password                          |
| `FLASK_SECRET_KEY`    | Yes      | `dev-secret-key`   | Secret for JWT signing                     |
| `STEAM_API_KEY`       | Yes      | —                  | Steam Web API key                          |
| `GEMINI_API_KEY`      | Yes      | —                  | Google Gemini API key                      |
| `GEMINI_MODEL`        | No       | `gemini-2.5-flash` | Gemini model name                          |
| `STEAMGRIDDB_API_KEY` | No       | —                  | SteamGridDB API key for high-res artwork   |
| `FLASK_ENV`           | No       | `production`       | `development` or `production`              |
| `FLASK_DEBUG`         | No       | `0`                | Set to `1` for debug mode with auto-reload |
