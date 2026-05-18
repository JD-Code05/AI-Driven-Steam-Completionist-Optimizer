# Frontend — React SPA

The frontend is a **React 19** single-page application built with **Vite 6** and **Tailwind CSS v4**. It provides a responsive, Steam-themed dashboard for managing games, viewing achievement progress, and getting AI-powered per-achievement guidance.

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
    ├── index.css            # Tailwind v4 @theme block (custom colors, fonts)
    │
    ├── context/
    │   └── AuthContext.jsx  # Authentication state: JWT handling, player data, login/logout
    │
    ├── services/
    │   └── api.js           # Axios instance + API wrapper functions for all endpoints
    │
    ├── components/          # Reusable UI building blocks
    │   ├── Navbar.jsx               # Top navigation bar with mobile hamburger menu
    │   ├── Layout.jsx               # Page layout wrapper (Navbar + content area)
    │   ├── ProtectedRoute.jsx       # Auth guard — redirects to /login if not authenticated
    │   ├── GameCard.jsx             # Game card with icon, name, playtime, completion progress
    │   ├── AchievementCard.jsx      # Achievement card with icon, name, rarity badge, unlock status
    │   ├── AchievementDetailModal.jsx  # Centered modal for per-achievement AI tip generation
    │   ├── AchievementTipRenderer.jsx  # Structured renderer for parsed 4-section AI tips
    │   ├── RarityBadge.jsx          # Colored badge showing rarity tier
    │   ├── ProgressBar.jsx          # Horizontal progress bar with percentage label
    │   └── ProgressRing.jsx         # SVG donut chart showing completion percentage
    │
    ├── pages/               # Full-page components (one per route)
    │   ├── LoginPage.jsx        # Hero section + Steam sign-in button + feature cards
    │   ├── DashboardPage.jsx    # Profile, stats, Completionist Showcase, tracked games, recent achievements
    │   ├── GameDetailPage.jsx   # Achievement list with filters, rarity breakdown, bookmarks, AI tip modal
    │   └── OptimizationPage.jsx # AI-generated Markdown guide viewer
    │
    └── utils/
        └── achievementTipParser.js  # Parses raw AI Markdown into structured 4-section object
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

- Hero section with the app title and tagline
- Large "Sign in with Steam" button that redirects to `/api/auth/login`
- Three feature cards explaining the app's capabilities (Sync, Track, Optimize)

### DashboardPage

Uses a deliberate **Z-pattern layout** for visual flow:

1. **Top row:** Player profile card (avatar, name, Steam ID) + overall completion ring
2. **Completionist Showcase:** Horizontal card below the profile row showing 100%-completed games (hidden if none exist)
3. **Tracked games grid:** `GameCard` components for games the player is tracking
4. **All games section:** Full library grid with toggle to show/hide
5. **Bottom-left:** Recent unlocked achievements (across all tracked games)
6. **Bottom-right:** AI optimization call-to-action card (hidden once at least one game is tracked)

Includes a **"Sync Games"** button to import the player's Steam library.

### GameDetailPage

- **Header:** Game banner, name, app ID, playtime, track/untrack button
- **Main area:** Achievement list with filter tabs (All / Locked / Unlocked); clicking an achievement opens `AchievementDetailModal`
- **Sidebar:**
  - Completion ring for this game
  - Rarity breakdown (color-coded counts per tier)
  - Bookmarks panel (add/delete guide URLs per game)
- **Sync button:** Fetches latest achievements from Steam
- **AI Tip flow:** Clicking any achievement row opens a centered modal with a **"Get AI Tip"** button; the generated tip is cached in `tipCache` state (persisted to `localStorage`) so it survives modal close/reopen without re-fetching

### OptimizationPage

- Back navigation link to the game detail page
- Purple-themed header with model name
- **Markdown rendering** of the AI guide using `react-markdown` with prose styling
- Error display for API failures

---

## Components

### `Navbar`

- Fixed top navigation with the app logo/title
- Links to Dashboard
- Player avatar and name (when authenticated)
- Logout button
- **Mobile responsive:** Hamburger menu toggle for small screens

### `Layout`

Simple wrapper that renders `<Navbar />` above a `<main>` content area with consistent padding and max-width.

### `ProtectedRoute`

Wraps route components. If the user is not authenticated (no player in AuthContext), redirects to `/login`. Shows a loading spinner while the auth state is being resolved.

### `GameCard`

Displays a game as a card with:

- Game icon image
- Game name
- Playtime in hours
- Achievement completion count (X/Y)
- ProgressBar showing completion percentage
- "Tracked" badge if the game is being tracked
- Links to the game detail page

### `AchievementDetailModal`

A fixed, centered modal opened when a user clicks any achievement row. Features:

- Achievement icon, name, description, rarity badge, and unlock status
- **"Get AI Tip" button** — calls `POST /api/ai/achievement-tip/<id>` and renders the result via `AchievementTipRenderer`
- Tip is passed in via `initialTip` prop (from parent's `tipCache`) so cached tips display immediately without re-fetching
- `onTipGenerated` callback saves the tip back to the parent `tipCache` and to `localStorage`
- **Find More Resources** section with auto-generated links to YouTube and Steam Community Guides
- Closes on Escape key or backdrop click

### `AchievementTipRenderer`

Renders a parsed tip object (from `achievementTipParser`) as structured UI sections:

- **Estimated Time** — purple card with clock icon
- **How to Unlock** — numbered steps
- **Important Warnings** — amber icon, numbered warnings
- **Pro Tips** — green icon, numbered tips

Each step/tip text is rendered through `ReactMarkdown` for inline formatting support.

### `AchievementCard`

Displays a single achievement with:

- Achievement icon (colored if unlocked, grayed if locked)
- Display name and description
- RarityBadge component
- Unlock timestamp (if unlocked)
- Visual styling difference for locked vs unlocked state

### `RarityBadge`

A small colored pill/badge showing the rarity tier:

| Tier       | Color  |
| ---------- | ------ |
| Ultra-Rare | Purple |
| Rare       | Amber  |
| Uncommon   | Blue   |
| Common     | Gray   |

### `ProgressBar`

Horizontal bar with:

- Filled portion proportional to `value/max`
- Percentage label (e.g., "73%")
- Steam-accent color gradient

### `ProgressRing`

SVG-based donut/ring chart with:

- Configurable `size` (diameter in pixels)
- Animated stroke that fills proportionally to `value/max`
- Center text showing the percentage
- Gradient stroke color

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
| `playerGamesAPI`        | `list(playerId, tracked)`, `update(id, data)`                    | Player-game associations |
| `achievementsAPI`       | `list(gameId)`                                                   | Achievement definitions  |
| `playerAchievementsAPI` | `list(playerId, gameId)`                                         | Player unlock status     |
| `dataSourcesAPI`        | `list(gameId)`, `create(data)`, `update(id, data)`, `delete(id)` | Bookmark management      |
| `aiAPI`                 | `getAchievementTip(achievementId)`                               | Per-achievement AI tip   |
| `optimizationAPI`       | `list(playerId, gameId)`, `get(id)`                              | Optimization route data  |

---

## Styling & Theme

### Tailwind CSS v4

This project uses **Tailwind v4** which defines themes in CSS rather than a `tailwind.config.js` file. All custom design tokens are in `src/index.css` using the `@theme` block.

### Custom Colors

| Token                       | Usage                            |
| --------------------------- | -------------------------------- |
| `--color-steam-dark`        | Main background color            |
| `--color-steam-blue`        | Primary accent blue              |
| `--color-steam-accent`      | Light accent (links, highlights) |
| `--color-surface`           | Card/panel backgrounds           |
| `--color-surface-light`     | Elevated surface backgrounds     |
| `--color-rarity-common`     | Common achievement badge         |
| `--color-rarity-uncommon`   | Uncommon achievement badge       |
| `--color-rarity-rare`       | Rare achievement badge           |
| `--color-rarity-ultra-rare` | Ultra-rare achievement badge     |

### Design Philosophy

- **Dark theme** matching Steam's UI aesthetic
- **Responsive** layout using Tailwind breakpoints (mobile-first)
- **Accessible** focus states and color contrast
- **Consistent spacing** using Tailwind's spacing scale

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
