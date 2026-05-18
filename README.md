# AI-Driven Steam Completionist Optimizer

An AI-driven web application that helps Steam gamers plan and optimize their achievement hunting. Syncs your Steam library, scrapes wiki guides as RAG context, and uses Google Gemini AI to generate personalized per-achievement guides.

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Quick Start (Docker Compose)](#quick-start-docker-compose)
5. [Development Setup](#development-setup)
6. [Kubernetes Deployment](#kubernetes-deployment)
7. [Environment Variables](#environment-variables)
8. [Project Structure](#project-structure)
9. [API Reference](#api-reference)
10. [Troubleshooting](#troubleshooting)

---

## Features

- **Steam Login** — Sign in with your Steam account via OpenID 2.0
- **Library Sync** — Automatically import your owned games and achievements from the Steam Web API
- **Achievement Tracking** — View completion progress per game with rarity tiers (Ultra-Rare, Rare, Uncommon, Common)
- **AI Tips** — Click any achievement to get a Gemini AI-generated 4-section guide (How to Unlock, Time Estimate, Warnings, Pro Tips) cached locally per achievement
- **Bookmark Manager** — Save and organize guide URLs per game
- **Completionist Showcase** — Automatically highlights 100%-completed games on the dashboard
- **Responsive Dashboard** — Z-pattern layout with progress rings, achievement cards, and game grid
- **Containerized** — Full Docker Compose setup for local development and Kubernetes manifests for production

---

## Architecture

```
┌───────────────────┐     ┌────────────────────┐     ┌───────────────────┐
│     Frontend      │     │     Backend        │     │     Database      │
│  React 19 + Vite  │────▶│  Flask 3.1 API     │────▶│    MySQL 8.0      │
│  Tailwind CSS v4  │     │  Gunicorn          │     │   7 tables        │
│  nginx (prod)     │     │  JWT Auth          │     │                   │
│  Port 3000        │     │  Port 5000         │     │   Port 3306       │
└───────────────────┘     └────────┬───────────┘     └───────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
               Steam Web API   Web Scraping   Gemini AI
               (game data)     (wiki guides)  (per-achievement tips)
```

---

## Prerequisites

Before starting, make sure you have:

1. **Docker Desktop** — [Install Docker Desktop](https://www.docker.com/products/docker-desktop/)
   - Enable Kubernetes in Docker Desktop settings (only needed for K8s deployment)
2. **Steam Web API Key** — Get one at [https://steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)
   - Requires a Steam account with a purchase history
3. **Google Gemini API Key** — Get one at [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
   - Free tier is sufficient for development
4. **SteamGridDB API Key** — Get one at [https://www.steamgriddb.com/profile/preferences/api](https://www.steamgriddb.com/profile/preferences/api)
   - Free account required — used for HD game poster artwork
5. **Git** — To clone this repository

---

## Quick Start (Docker Compose)

This is the fastest way to get the full application running locally.

### Step 1: Clone the repository

```bash
git clone <repository-url>
cd steam-optimizer
```

### Step 2: Create environment file

```bash
cp .env.example .env
```

### Step 3: Edit `.env` with your API keys

Open `.env` in a text editor and fill in:

```env
# Required — replace these placeholder values
STEAM_API_KEY=your_actual_steam_api_key
GEMINI_API_KEY=your_actual_gemini_api_key
STEAMGRIDDB_API_KEY=your_actual_steamgriddb_api_key

# Recommended — change for security
MYSQL_PASSWORD=a_strong_password
MYSQL_ROOT_PASSWORD=another_strong_password
FLASK_SECRET_KEY=a_random_secret_string
```

> **Security Note:** Never commit your `.env` file. It is already in `.gitignore`.

### Step 4: Build and start all services

```bash
docker-compose up --build
```

This will:

- Build the MySQL database container and run `init.sql` (creates 7 tables + seed data)
- Build the Flask backend
- Build the React frontend and serve it via nginx
- Start all three containers with health checks and automatic restart

### Step 5: Open the application

| Service         | URL                                                                  |
| --------------- | -------------------------------------------------------------------- |
| **Frontend**    | [http://localhost:3000](http://localhost:3000)                       |
| **Backend API** | [http://localhost:5000/api/health](http://localhost:5000/api/health) |
| **MySQL**       | `localhost:3306` (connect via any MySQL client)                      |

### Step 6: Sign in and sync your games

1. Click **"Sign in with Steam"** on the login page
2. You'll be redirected to Steam's login page — sign in with your Steam account
3. After redirect, click **"Sync Games"** in the dashboard to import your library
4. Select a game and click **"Sync Achievements"** to load achievement data
5. Click any achievement to open the detail modal and click **"Get AI Tip"** for a personalized guide

### Stopping the application

```bash
# Stop containers (preserves data)
docker-compose down

# Stop and remove all data (clean slate)
docker-compose down -v
```

---

## Development Setup

For active development with hot-reload on both frontend and backend:

### Step 1: Complete Steps 1–3 from [Quick Start](#quick-start-docker-compose)

### Step 2: Start in dev mode

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

This enables:

- **Backend**: Flask debug mode with auto-reload, source code mounted as a volume
- **Frontend**: Vite dev server with HMR (Hot Module Replacement), `src/` mounted as a volume

Changes to backend Python files or frontend React components will be reflected immediately without rebuilding containers.

### Running without Docker (manual setup)

If you prefer running services directly on your machine:

#### Backend

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables (or use a .env file in the backend folder)
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

# Run the dev server
python wsgi.py
```

> **Note:** You still need a running MySQL 8.0 instance. You can start just the database with:
>
> ```bash
> docker-compose up db
> ```

#### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server (proxies API calls to localhost:5000)
npm run dev
```

The Vite dev server runs at [http://localhost:5173](http://localhost:5173) and proxies `/api/` requests to `localhost:5000`.

---

## Kubernetes Deployment

Deploy to a local Kubernetes cluster (Docker Desktop) for a production-like environment.

### Step 1: Enable Kubernetes

Open **Docker Desktop → Settings → Kubernetes → Enable Kubernetes** and click **Apply & Restart**. Wait for the Kubernetes status indicator to turn green.

### Step 2: Configure secrets

Edit `k8s/secrets.yaml` and replace the placeholder base64-encoded values:

```bash
# Encode your actual values
echo -n "your_steam_api_key" | base64
echo -n "your_gemini_api_key" | base64
echo -n "your_mysql_password" | base64
echo -n "your_flask_secret" | base64
```

Replace the corresponding values in `k8s/secrets.yaml`.

### Step 3: Run the deployment script

```bash
chmod +x deploy.sh
./deploy.sh
```

The script will:

1. Build all three Docker images locally
2. Create the `steam-optimizer` namespace
3. Apply ConfigMap and Secrets
4. Deploy MySQL with a PersistentVolume (data survives pod restarts)
5. Deploy Backend (2 replicas with rolling updates)
6. Deploy Frontend (2 replicas) via NodePort
7. Wait for all pods to be ready

### Step 4: Access the application

| Service      | Access Method                                                   |
| ------------ | --------------------------------------------------------------- |
| **Frontend** | [http://localhost:3000](http://localhost:3000)                |
| **Backend**  | `kubectl port-forward -n steam-optimizer svc/backend 5000:5000` |

### Useful K8s commands

```bash
# Check pod status
kubectl get pods -n steam-optimizer

# View logs
kubectl logs -n steam-optimizer -l app=backend --tail=50
kubectl logs -n steam-optimizer -l app=frontend --tail=50

# Scale backend replicas
kubectl scale deployment backend -n steam-optimizer --replicas=4

# Demonstrate self-healing (delete a pod and watch it recreate)
kubectl delete pod -n steam-optimizer -l app=backend

# Rollback a deployment
kubectl rollout undo deployment/backend -n steam-optimizer

# Teardown everything
kubectl delete namespace steam-optimizer
```

---

## Environment Variables

| Variable              | Required | Default            | Description                                     |
| --------------------- | -------- | ------------------ | ----------------------------------------------- |
| `MYSQL_HOST`          | Yes      | `db`               | MySQL hostname (`db` in Docker, `mysql` in K8s) |
| `MYSQL_PORT`          | Yes      | `3306`             | MySQL port                                      |
| `MYSQL_DATABASE`      | Yes      | `steam_optimizer`  | Database name                                   |
| `MYSQL_USER`          | Yes      | `steam_user`       | Database user                                   |
| `MYSQL_PASSWORD`      | Yes      | —                  | Database user password                          |
| `MYSQL_ROOT_PASSWORD` | Yes      | —                  | MySQL root password                             |
| `FLASK_SECRET_KEY`    | Yes      | —                  | Secret key for JWT token signing                |
| `STEAM_API_KEY`       | Yes      | —                  | Steam Web API key                               |
| `GEMINI_API_KEY`      | Yes      | —                  | Google Gemini API key                           |
| `GEMINI_MODEL`        | No       | `gemini-2.5-flash` | Gemini model to use                             |
| `FLASK_ENV`           | No       | `production`       | `development` or `production`                   |
| `FLASK_DEBUG`         | No       | `0`                | Set to `1` for debug mode                       |

---

## Project Structure

```
steam-optimizer/
├── backend/                        # Flask REST API
│   ├── Dockerfile
│   ├── requirements.txt            # Python dependencies
│   ├── wsgi.py                     # Entry point
│   └── app/
│       ├── __init__.py             # App factory + blueprint registration
│       ├── config.py               # Environment-based configuration
│       ├── extensions.py           # SQLAlchemy & Migrate instances
│       ├── models/                 # 7 SQLAlchemy ORM models
│       ├── routes/                 # 10 Flask Blueprints (CRUD + auth + sync + AI)
│       ├── services/               # Business logic (Steam API, web scraper, SteamGridDB)
│       └── utils/                  # JWT auth utilities
│
├── frontend/                       # React SPA
│   ├── Dockerfile
│   ├── nginx.conf                  # Production reverse proxy config
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx                 # Route definitions
│       ├── context/AuthContext.jsx  # Authentication state management
│       ├── services/api.js         # HTTP client + API wrappers
│       ├── components/             # Reusable UI components
│       └── pages/                  # Page-level components
│
├── database/                       # MySQL setup
│   ├── Dockerfile
│   └── init.sql                    # Schema DDL + seed data
│
├── k8s/                            # Kubernetes manifests
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml
│   ├── ingress.yaml
│   ├── mysql/                      # PV, PVC, Deployment, Service
│   ├── backend/                    # Deployment, Service
│   └── frontend/                   # ConfigMap (nginx), Deployment, NodePort Service
│
├── docker-compose.yml              # Production Docker Compose
├── docker-compose.dev.yml          # Dev overrides (hot-reload)
├── deploy.sh                       # K8s deployment script
├── .env.example                    # Environment variable template
├── .gitignore
└── README.md                       # This file
```

---

## API Reference

The backend exposes **37 endpoints** across 10 blueprints + 1 health check. All endpoints return JSON.

### Authentication

| Method | Endpoint             | Auth | Description                         |
| ------ | -------------------- | ---- | ----------------------------------- |
| GET    | `/api/auth/login`    | No   | Redirects to Steam OpenID login     |
| GET    | `/api/auth/callback` | No   | Handles Steam callback, returns JWT |
| GET    | `/api/auth/me`       | Yes  | Get current authenticated player    |
| POST   | `/api/auth/logout`   | Yes  | Logout acknowledgment               |

### Steam Sync

| Method | Endpoint                          | Auth | Description                           |
| ------ | --------------------------------- | ---- | ------------------------------------- |
| POST   | `/api/sync/games`                 | Yes  | Sync owned games from Steam           |
| POST   | `/api/sync/achievements/<app_id>` | Yes  | Sync achievements for a specific game |

### AI

| Method | Endpoint                                   | Auth | Description                                          |
| ------ | ------------------------------------------ | ---- | ---------------------------------------------------- |
| POST   | `/api/ai/achievement-tip/<achievement_id>` | Yes  | Generate a 4-section AI tip for a single achievement |

### Bookmark Management

| Method | Endpoint                 | Auth | Description                             |
| ------ | ------------------------ | ---- | --------------------------------------- |
| GET    | `/api/data-sources`      | No   | List bookmarks for a game (`?game_id=`) |
| POST   | `/api/data-sources`      | No   | Add a bookmark                          |
| PUT    | `/api/data-sources/<id>` | No   | Update a bookmark                       |
| DELETE | `/api/data-sources/<id>` | No   | Delete a bookmark                       |

### CRUD Endpoints

All CRUD blueprints follow the same pattern:

| Method | Endpoint               | Description                       |
| ------ | ---------------------- | --------------------------------- |
| GET    | `/api/<resource>`      | List all (supports query filters) |
| GET    | `/api/<resource>/<id>` | Get one by ID                     |
| POST   | `/api/<resource>`      | Create new                        |
| PUT    | `/api/<resource>/<id>` | Update existing                   |
| DELETE | `/api/<resource>/<id>` | Delete                            |

**Resources:** `players`, `games`, `player-games`, `achievements`, `player-achievements`

### SteamGridDB

| Method | Endpoint                         | Auth | Description                         |
| ------ | -------------------------------- | ---- | ----------------------------------- |
| GET    | `/api/steamgriddb/grid/<app_id>` | No   | Get high-res artwork URL for a game |

### Health Check

| Method | Endpoint      | Description                     |
| ------ | ------------- | ------------------------------- |
| GET    | `/api/health` | Returns `{"status": "healthy"}` |

---

## Troubleshooting

### Docker Compose issues

**Containers fail to start / backend can't connect to database**

The backend waits for MySQL to be healthy before starting. If MySQL takes too long to initialize on first run:

```bash
# Check container status and logs
docker-compose ps
docker-compose logs db
docker-compose logs backend

# Restart just the backend after DB is ready
docker-compose restart backend
```

**Port conflicts**

If ports 3000, 5000, or 3306 are already in use:

```bash
# Find what's using a port
lsof -i :3000

# Change ports in docker-compose.yml under the respective service's "ports" section
```

**Clean rebuild**

```bash
docker-compose down -v          # Remove containers and volumes
docker system prune -f           # Clean unused images/containers
docker-compose up --build        # Fresh build
```

### Kubernetes issues

**Pods stuck in Pending state**

```bash
kubectl describe pod <pod-name> -n steam-optimizer
```

Common causes:

- PersistentVolume not created — ensure MySQL PV is applied: `kubectl apply -f k8s/mysql/pv.yaml`
- Insufficient resources — check Docker Desktop has enough memory allocated (4GB+ recommended)

**MySQL data persistence**

K8s uses a `hostPath` PersistentVolume at `/tmp/steam-optimizer/mysql-data`. On macOS, `/tmp` may be cleared on reboot. For persistent data, change the path in `k8s/mysql/pv.yaml`.

**Secrets not working**

Ensure values in `k8s/secrets.yaml` are properly base64-encoded:

```bash
# Encode
echo -n "my_value" | base64

# Verify by decoding
echo "bXlfdmFsdWU=" | base64 --decode
```

### Steam API issues

**"Forbidden" or empty game list**

- Verify your Steam API key is valid at [https://steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)
- Ensure your Steam profile and game details are set to **Public** in Steam privacy settings
- The API key must belong to the same account or the target profile must be public

### Gemini AI issues

**"API key not valid" error**

- Verify your key at [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- Ensure the Generative Language API is enabled in your Google Cloud project

**Empty or poor quality AI responses**

- Verify your Gemini API key is valid and the Generative Language API is enabled
- Try regenerating — model responses can vary between calls

---

## License

This project is for educational purposes.
