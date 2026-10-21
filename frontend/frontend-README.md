# Frontend — React SPA

The frontend is a **React 19** single-page application built with **Vite 6** and **Tailwind CSS v4**. It provides a responsive dashboard (light and dark themes) for managing games, viewing achievement progress, and getting AI-powered per-achievement guides.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Directory Structure](#directory-structure)
4. [Pages & Routes](#pages--routes)
5. [Components](#components)
6. [State Management & Auth](#state-management--auth)
7. [API Service Layer](#api-service-layer)
8. [Styling & Theme](#styling--theme)
9. [Running Locally](#running-locally)
10. [Docker & Production Build](#docker--production-build)
11. [Nginx Configuration](#nginx-configuration)

---

## Overview

The frontend communicates with the Flask backend via REST/JSON. Authentication is handled through Steam OpenID — the backend returns a JWT token which is stored in `localStorage` and sent with every API request. All protected pages are wrapped in a `<ProtectedRoute>` component that redirects unauthenticated users to the login page.

---

## Tech Stack

| Package              | Version | Purpose                              |
| -------------------- | ------- | ------------------------------------ |
| React                | 19.0.0  | UI framework                         |
| React DOM            | 19.0.0  | DOM rendering                        |
| React Router DOM     | 7.1.1   | Client-side routing                  |
| Axios                | 1.7.9   | HTTP client for API calls            |
| React Icons          | 5.4.0   | Icon library (Heroicons v2)          |
| React Markdown       | 9.0.3   | Renders AI-generated Markdown guides |
| Vite                 | 6.0.0   | Build tool & dev server              |
| Tailwind CSS         | 4.1.4   | Utility-first CSS framework          |
| @tailwindcss/vite    | 4.1.4   | Tailwind Vite plugin (v4 style)      |
| @vitejs/plugin-react | 4.3.4   | React fast refresh for Vite          |

---

## Directory Structure

```
frontend/
├── Dockerfile              # Multi-stage: node:20-alpine build → nginx:alpine serve
├── .dockerignore            # Excludes node_modules, dist, .env
├── nginx.conf               # Production nginx config (reverse proxy + SPA fallback)
├── package.json             # Dependencies and scripts
├── vite.config.js           # Vite config with Tailwind plugin + API proxy
├── index.html               # HTML entry point (mounts #root)
│
└── src/
    ├── main.jsx             # App entry: StrictMode + BrowserRouter + AuthProvider
    ├── App.jsx              # Route definitions (4 routes + catch-all)
    ├── index.css            # Tailwind v4 theme tokens (light/dark), theme switch + panel CSS
    │
    ├── context/
    │   └── AuthContext.jsx  # Authentication state: JWT handling, player data, login/logout
    │
    ├── services/
    │   └── api.js           # Axios instance + API wrapper functions for all endpoints
    │
    ├── components/          # Reusable UI building blocks
    │   ├── Navbar.jsx               # Top bar: app name ("AO" on phones), Dashboard link, ThemeSwitch, log out
    │   ├── Layout.jsx               # Page wrapper (Navbar + centered content area)
    │   ├── ProtectedRoute.jsx       # Auth guard — redirects to /login if not authenticated
    │   ├── ThemeSwitch.jsx          # Sun/moon switch that toggles light and dark
    │   ├── GameCard.jsx             # Cover art, name, X / Y unlocked and a progress bar
    │   ├── GameCarousel.jsx         # "In progress" row of GameCards with previous/next arrows
    │   ├── AchievementRow.jsx       # One achievement: icon, name, description, % of players, rarity, status
    │   ├── AchievementPanel.jsx     # Side drawer (bottom sheet on phones) with details and the AI guide
    │   ├── AchievementTipRenderer.jsx  # Renders the parsed 4-section AI guide inside the panel
    │   ├── GuidesCard.jsx           # Guide links the player keeps for a game (add/remove)
    │   ├── RarityBadge.jsx          # Rarity pill (ultra rare / rare / uncommon / common)
    │   └── ProgressBar.jsx          # Thin progress bar, optionally tinted by rarity tone
    │
    ├── pages/               # Full-page components (one per route)
    │   ├── LoginPage.jsx        # Pitch, Steam sign-in button, looping cover wall
    │   ├── DashboardPage.jsx    # Profile + sync, stat strip, game carousel, recent unlocks
    │   ├── GameDetailPage.jsx   # Hero art, progress by rarity, achievement list, guides card
    │   └── OptimizationPage.jsx # AI-generated Markdown route viewer
    │
    └── utils/
        ├── achievementTipParser.js  # Parses raw AI Markdown into a structured 4-section object
        ├── format.js                # timeAgo / formatDate (reads backend UTC timestamps correctly)
        ├── stats.js                 # Dashboard stats, in-progress games, rarity breakdown
        ├── sourceType.js            # Guesses a guide link's type (youtube / wiki / article)
        └── theme.js                 # Theme choice: stored value, system fallback, switch animation
```

---

## Pages & Routes

Defined in `App.jsx`:

| Route                     | Component             | Auth Required | Description                                            |
| ------------------------- | --------------------- | :-----------: | ------------------------------------------------------ |
| `/login`                  | `LoginPage`           |      No       | Landing page with Steam sign-in button                 |
| `/dashboard`              | `DashboardPage`       |      Yes      | Main dashboard with game library and stats             |
| `/games/:gameId`          | `GameDetailPage`      |      Yes      | Game detail with achievements, sources, and AI actions |
| `/games/:gameId/optimize` | `OptimizationPage`    |      Yes      | View/generate AI optimization route                    |
| `*` (catch-all)           | Redirects to `/login` |       —       | Handles unknown routes                                 |

### LoginPage

- Pitch and a "Sign in with Steam" button that redirects to `/api/auth/login`
- Three short steps (sync, see what's left, get a route)
- A slowly drifting wall of cover art (still when reduced motion is on)
- Shows a short message when the sign-in callback returns `?error=`

### DashboardPage

1. **Header:** avatar, player name, last-synced time and a "Sync Steam" button
2. **Stat strip:** games owned, hours played, achievements unlocked, perfect games
3. **In progress:** `GameCarousel` of tracked games (or, with none tracked, the closest-to-done games), plus an "All games" button that opens the full library in a dialog
4. **Recently unlocked:** the latest unlocks across tracked games as `AchievementRow`s

### GameDetailPage

- **Header:** hero art, game name, hours played, last-synced time, Track and Sync buttons
- **Progress:** overall unlocked count plus one cell per rarity tier
- **Achievements:** filter (all / locked / unlocked), search, sort (rarest, most common, recently unlocked); choosing a row opens `AchievementPanel`
- **Guides:** `GuidesCard` in the side column
- **AI guide flow:** the panel's "Write a guide" button asks the backend for a guide; it is stored in `localStorage` per player and achievement, so it survives closing and reloading

### OptimizationPage

- Back navigation link to the game detail page
- Header with the model name and when the route was generated
- **Markdown rendering** of the AI guide using `react-markdown` with prose styling
- Error display for API failures

---

## Components

### `Navbar`

Top bar with the app name ("Achievement Optimizer", shortened to "AO" on phones), a Dashboard link, the `ThemeSwitch`, the player's avatar and a log-out button.

### `Layout`

Wraps a page: `Navbar` above a centered `<main>` (max width 1160px).

### `ProtectedRoute`

Wraps route components. With no signed-in player it redirects to `/login` (carrying any `?error=`); while the auth state loads it shows a spinner.

### `ThemeSwitch`

Sun/moon switch (`role="switch"`). It stores the choice in `localStorage` and sets `data-theme` on `<html>`; the change animates as a circle reveal where the browser supports it.

### `GameCard`

Cover art (SteamGridDB, then Steam CDN, then an initial), game name, `X / Y` unlocked, percentage or "Perfect", and a `ProgressBar`. Links to the game page. Long names truncate.

### `GameCarousel`

Scroll-snapping row of `GameCard`s titled "In progress", with previous/next buttons that disable at either end. It takes optional children for the heading row (the "All games" button).

### `AchievementRow`

Icon (greyed when locked), name, description, share of players who have it, `RarityBadge` and unlock date. Renders as a button when `onSelect` is passed. On narrow screens the rarity and status columns hide, and a screen-reader-only status stays.

### `AchievementPanel`

Native `<dialog>`: a drawer from the right on desktop, a bottom sheet under 860px. Shows the achievement's details, how rare it is, and the AI guide ("Write a guide", loading, error and ready states; "Rewrite" once a guide exists), plus links to Steam guides and YouTube. Escape and a backdrop click close it.

### `AchievementTipRenderer`

Renders a parsed guide (from `achievementTipParser`) as four sections: estimated time, how to unlock, warnings and pro tips. Step text goes through `ReactMarkdown`.

### `GuidesCard`

Lists the guide links the player saved for a game, with an add-a-link form (type inferred by `inferSourceType`) and a remove button per link.

### `RarityBadge`

Pill showing the tier, colored from the rarity tokens (`ultra`, `rare`, `uncommon`, `common`, each with a `-bg` fill).

### `ProgressBar`

Thin bar filled to `value / max` (clamped 0-100%). `tone` is `ink` (default) or a rarity tier.

---

## State Management & Auth

### AuthContext (`context/AuthContext.jsx`)

Provides global authentication state via React Context:

**State:**

- `player` — Current player object (from `/api/auth/me`) or `null`
- `token` — JWT string stored in `localStorage`
- `loading` — `true` while verifying the token on initial load

**Flow:**

1. On mount, checks `localStorage` for a saved JWT token
2. Also checks the URL for `?token=<jwt>` (Steam callback redirect)
3. If a token exists, calls `GET /api/auth/me` to validate and fetch player data
4. If the token is invalid/expired, clears it from storage

**Exported functions:**

- `login()` — Redirects to `/api/auth/login` (Steam OpenID)
- `logout()` — Calls `POST /api/auth/logout`, clears token from storage, resets state

---

## API Service Layer

### `services/api.js`

Creates a configured Axios instance with:

- **Base URL:** `/api` (proxied to backend in dev, reverse-proxied by nginx in prod)
- **JWT interceptor:** Automatically adds `Authorization: Bearer <token>` header to every request if a token exists in `localStorage`

### API Wrapper Functions

Organized by resource — each returns an Axios promise:

| Namespace               | Methods                                                          | Description              |
| ----------------------- | ---------------------------------------------------------------- | ------------------------ |
| `authAPI`               | `getLoginUrl()`, `me()`, `logout()`                              | Authentication endpoints |
| `syncAPI`               | `syncGames()`, `syncAchievements(appId)`                         | Steam data sync          |
| `gamesAPI`              | `list()`, `get(id)`                                              | Game data                |
| `playerGamesAPI`        | `list(tracked)`, `update(id, data)`                    | Player-game associations |
| `achievementsAPI`       | `list(gameId)`                                                   | Achievement definitions  |
| `playerAchievementsAPI` | `list(gameId)`                                                 | Player unlock status     |
| `dataSourcesAPI`        | `list(gameId)`, `create(data)`, `update(id, data)`, `delete(id)` | Bookmark management      |
| `aiAPI`                 | `getAchievementTip(achievementId)`                               | Per-achievement AI guide |

---

## Styling & Theme

### Tailwind CSS v4

This project uses **Tailwind v4** which defines themes in CSS rather than a `tailwind.config.js` file. All custom design tokens are in `src/index.css` using the `@theme` block.

### Theme tokens

Colors are CSS variables set per theme in `index.css` (`[data-theme="light"]` and `[data-theme="dark"]`) and exposed to Tailwind through `@theme inline`, so classes like `bg-surface` or `text-muted` follow the active theme. Use these tokens only; no raw colors.

| Token | Used for |
| ----- | -------- |
| `bg`, `surface`, `hover` | Page background, cards and panels, hover/selected fill |
| `border`, `border-strong` | Hairlines; control outlines |
| `text`, `muted`, `faint` | Body text, secondary text, labels and placeholders |
| `ink`, `on-ink` | Primary buttons, selected states and focus rings, and the text on them |
| `track` | Progress-bar tracks, image placeholders, loading blocks |
| `common`, `uncommon`, `rare`, `ultra` (+ `-bg`) | Rarity text and badge fill |
| `warn`, `warn-bg` | Notices and errors |
| `scrim` | Dialog backdrop |

`index.html` sets `data-theme` before React loads (stored choice, else the system setting), so there is no flash. `utils/theme.js` holds the same logic for the switch.

### Design Philosophy

- **Light and dark themes**, switchable from the navbar
- **Responsive**, checked down to 375px wide with no horizontal scrolling
- **Reduced motion:** transitions and animations are shortened or removed under `prefers-reduced-motion`
- **Keyboard friendly:** visible focus rings (`ink`) and native `<dialog>` for panels

---

## Running Locally

### With Docker (recommended)

```bash
# From the project root
docker-compose up --build frontend
```

### Development mode with hot-reload

```bash
# From the project root (starts Vite dev server with volume mounts)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build frontend
```

### Without Docker

```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

The dev server starts at `http://localhost:5173` and proxies `/api/` requests to `http://localhost:5000` (configured in `vite.config.js`).

### Build for production

```bash
cd frontend
npm run build    # Outputs to dist/
npm run preview  # Preview the production build locally
```

---

## Docker & Production Build

### Multi-stage Dockerfile

**Stage 1 — Build:**

- Base: `node:20-alpine`
- Installs dependencies from `package.json`
- Runs `npm run build` to produce optimized static files in `dist/`

**Stage 2 — Serve:**

- Base: `nginx:alpine`
- Copies built files from Stage 1 to `/usr/share/nginx/html`
- Copies custom `nginx.conf` for reverse proxy and SPA routing
- Listens on port **3000**

---

## Nginx Configuration

The production nginx config (`nginx.conf`) handles three concerns:

### 1. API Reverse Proxy

```nginx
location /api/ {
    proxy_pass http://backend:5000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}
```

All `/api/` requests are forwarded to the backend service. The 120s timeout accommodates AI generation calls.

### 2. SPA Fallback

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

All non-API, non-file requests serve `index.html`, allowing React Router to handle client-side navigation.

### 3. Static Asset Caching

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

Vite-built assets with content hashes are cached for 1 year.
