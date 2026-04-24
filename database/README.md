# Database — MySQL 8.0

The database layer provides the persistent storage for the Steam Achievement Optimizer. It runs **MySQL 8.0** with a custom schema of 7 interrelated tables, pre-configured character encoding, and seed data for development.

---

## Table of Contents

1. [Overview](#overview)
2. [Directory Structure](#directory-structure)
3. [Schema Design](#schema-design)
4. [Tables](#tables)
5. [Relationships & Foreign Keys](#relationships--foreign-keys)
6. [Indexes](#indexes)
7. [Seed Data](#seed-data)
8. [Docker Configuration](#docker-configuration)
9. [Connecting to the Database](#connecting-to-the-database)
10. [Common Operations](#common-operations)

---

## Overview

The database stores:
- **Player profiles** synced from Steam
- **Game metadata** (names, icons, achievement counts)
- **Player-game associations** (ownership, playtime, tracking status)
- **Achievement definitions** with global unlock percentages
- **Player achievement progress** (unlocked/locked status per achievement)
- **Data sources** (scraped guide URLs and their content)
- **AI optimization routes** (generated Markdown guides with prompt hashes for deduplication)

---

## Directory Structure

```
database/
├── Dockerfile    # mysql:8.0 base image + custom config + init script
└── init.sql      # Full DDL (CREATE TABLE) + seed data
```

---

## Schema Design

The schema uses a **relational model** with junction tables for many-to-many relationships:

```
players ─┬─< player_games >─── games ─┬─< achievements
         │                             │       │
         ├─< player_achievements ──────┼───────┘
         │                             │
         └─< optimization_routes >─────┘
                                       │
                               data_sources
```

**Legend:** `─<` = one-to-many, `>──` = many-to-one

---

## Tables

### 1. `players` — Steam User Profiles

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Internal ID |
| `steam_id` | VARCHAR(20) | UNIQUE, NOT NULL | Steam 64-bit ID |
| `persona_name` | VARCHAR(255) | | Steam display name |
| `avatar_url` | TEXT | | Full-size avatar image URL |
| `profile_url` | TEXT | | Steam profile page URL |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | First login time |
| `updated_at` | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | Last profile update |

### 2. `games` — Game Metadata

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Internal ID |
| `app_id` | INT | UNIQUE, NOT NULL | Steam application ID |
| `name` | VARCHAR(255) | | Game title |
| `img_icon_url` | TEXT | | Icon image URL from Steam CDN |
| `img_logo_url` | TEXT | | Logo/banner image URL |
| `total_achievements` | INT | DEFAULT 0 | Total achievement count |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | First synced time |

### 3. `player_games` — Player ↔ Game Ownership

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Internal ID |
| `player_id` | INT | FK → players.id, NOT NULL | Player reference |
| `game_id` | INT | FK → games.id, NOT NULL | Game reference |
| `playtime_hours` | DECIMAL(10,1) | DEFAULT 0.0 | Total playtime in hours |
| `is_tracked` | BOOLEAN | DEFAULT FALSE | Whether the player is actively tracking this game |
| `last_synced` | TIMESTAMP | NULLABLE | Last Steam sync time |

**Unique constraint:** `(player_id, game_id)` — a player can only have one record per game.

### 4. `achievements` — Achievement Definitions

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Internal ID |
| `game_id` | INT | FK → games.id, NOT NULL | Parent game |
| `api_name` | VARCHAR(255) | NOT NULL | Steam's internal achievement identifier |
| `display_name` | VARCHAR(255) | | Human-readable name |
| `description` | TEXT | | Achievement description (may be hidden) |
| `icon_url` | TEXT | | Unlocked icon URL |
| `icon_gray_url` | TEXT | | Locked (grayed out) icon URL |
| `global_percent` | DECIMAL(5,2) | DEFAULT 0.00 | Global unlock percentage (0–100) |

**Unique constraint:** `(game_id, api_name)` — each achievement is unique per game.

**Rarity tiers** (computed in the backend model, not stored):
- `< 5%` → Ultra-Rare
- `< 15%` → Rare
- `< 30%` → Uncommon
- `≥ 30%` → Common

### 5. `player_achievements` — Player Unlock Status

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Internal ID |
| `player_id` | INT | FK → players.id, NOT NULL | Player reference |
| `achievement_id` | INT | FK → achievements.id, NOT NULL | Achievement reference |
| `unlocked` | BOOLEAN | DEFAULT FALSE | Whether the player has unlocked this achievement |
| `unlock_time` | TIMESTAMP | NULLABLE | When it was unlocked (epoch from Steam) |

**Unique constraint:** `(player_id, achievement_id)`

### 6. `data_sources` — External Guide References

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Internal ID |
| `game_id` | INT | FK → games.id, NOT NULL | Associated game |
| `url` | TEXT | NOT NULL | Source URL (wiki, guide, YouTube video) |
| `title` | VARCHAR(500) | | Page/video title |
| `source_type` | ENUM | DEFAULT 'other' | One of: `wiki`, `article`, `blog`, `youtube`, `other` |
| `scraped_content` | LONGTEXT | | Full scraped text content |
| `last_scraped` | TIMESTAMP | NULLABLE | When content was last scraped |
| `is_auto` | BOOLEAN | DEFAULT FALSE | True if discovered via auto-discover |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record creation time |

### 7. `optimization_routes` — AI-Generated Guides

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Internal ID |
| `player_id` | INT | FK → players.id, NOT NULL | Player who requested the route |
| `game_id` | INT | FK → games.id, NOT NULL | Target game |
| `summary_md` | LONGTEXT | | Generated Markdown optimization guide |
| `source_ids_used` | JSON | | Array of data_source IDs used in generation |
| `model_used` | VARCHAR(50) | | Gemini model name (e.g., `gemini-2.0-flash`) |
| `prompt_hash` | VARCHAR(64) | | SHA-256 hash for prompt deduplication |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Generation time |
| `updated_at` | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | Last update time |

---

## Relationships & Foreign Keys

All foreign keys use `ON DELETE CASCADE` — deleting a parent record automatically removes all dependent records.

| FK Constraint | From | To | Cascade |
|--------------|------|-----|---------|
| `fk_pg_player` | `player_games.player_id` | `players.id` | DELETE CASCADE |
| `fk_pg_game` | `player_games.game_id` | `games.id` | DELETE CASCADE |
| `fk_ach_game` | `achievements.game_id` | `games.id` | DELETE CASCADE |
| `fk_pa_player` | `player_achievements.player_id` | `players.id` | DELETE CASCADE |
| `fk_pa_achievement` | `player_achievements.achievement_id` | `achievements.id` | DELETE CASCADE |
| `fk_ds_game` | `data_sources.game_id` | `games.id` | DELETE CASCADE |
| `fk_or_player` | `optimization_routes.player_id` | `players.id` | DELETE CASCADE |
| `fk_or_game` | `optimization_routes.game_id` | `games.id` | DELETE CASCADE |

---

## Indexes

| Index | Table | Column(s) | Purpose |
|-------|-------|----------|---------|
| `idx_steam_id` | `players` | `steam_id` | Fast player lookup by Steam ID |
| `idx_app_id` | `games` | `app_id` | Fast game lookup by Steam app ID |
| `idx_game_id` | `achievements` | `game_id` | List achievements for a game |
| `idx_player_unlocked` | `player_achievements` | `(player_id, unlocked)` | Filter unlocked/locked per player |
| `idx_ds_game` | `data_sources` | `game_id` | List sources for a game |
| `idx_or_player_game` | `optimization_routes` | `(player_id, game_id)` | Find routes per player+game |
| `idx_or_prompt_hash` | `optimization_routes` | `prompt_hash` | Prompt deduplication lookups |

---

## Seed Data

The `init.sql` includes seed data for development:

**Game:** ELDEN RING (app_id: 1245620)

**Sample Achievements:**

| Achievement | Global % | Rarity Tier |
|-------------|----------|-------------|
| Margit, the Fell Omen | 74.50% | Common |
| Elden Lord | 22.30% | Uncommon |
| Age of the Stars | 11.40% | Rare |
| Malenia, Blade of Miquella | 8.70% | Rare |
| Legendary Armaments | 3.20% | Ultra-Rare |

---

## Docker Configuration

### Dockerfile

```dockerfile
FROM mysql:8.0
COPY init.sql /docker-entrypoint-initdb.d/01-init.sql
# Custom MySQL config for performance + charset
```

**Key settings applied:**
- `character-set-server=utf8mb4` — Full Unicode support (emoji, CJK characters)
- `collation-server=utf8mb4_unicode_ci` — Case-insensitive Unicode collation
- `max_connections=100` — Sufficient for development
- `innodb_buffer_pool_size=256M` — InnoDB memory buffer

### How init.sql works

MySQL's Docker image automatically executes all `.sql` files in `/docker-entrypoint-initdb.d/` on **first startup only** (when the data directory is empty). The file is named `01-init.sql` to control execution order if additional scripts are added later.

---

## Connecting to the Database

### From another Docker container (default)

```
Host: db
Port: 3306
Database: steam_optimizer
User: steam_user
Password: (from MYSQL_PASSWORD env var)
```

### From host machine

```bash
# Using MySQL CLI
mysql -h 127.0.0.1 -P 3306 -u steam_user -p steam_optimizer

# Using Docker exec
docker exec -it steam-optimizer-db mysql -u steam_user -p steam_optimizer
```

### Connection string (PyMySQL)

```
mysql+pymysql://steam_user:password@db:3306/steam_optimizer
```

---

## Common Operations

```sql
-- View all tables
SHOW TABLES;

-- Check a player's achievement progress for a game
SELECT a.display_name, a.global_percent, pa.unlocked, pa.unlock_time
FROM player_achievements pa
JOIN achievements a ON pa.achievement_id = a.id
WHERE pa.player_id = 1 AND a.game_id = 1
ORDER BY a.global_percent ASC;

-- Count achievements by rarity tier for a game
SELECT
  CASE
    WHEN global_percent < 5 THEN 'Ultra-Rare'
    WHEN global_percent < 15 THEN 'Rare'
    WHEN global_percent < 30 THEN 'Uncommon'
    ELSE 'Common'
  END AS rarity_tier,
  COUNT(*) AS count
FROM achievements
WHERE game_id = 1
GROUP BY rarity_tier;

-- Find games with scraped data sources
SELECT g.name, COUNT(ds.id) AS source_count
FROM games g
JOIN data_sources ds ON g.id = ds.game_id
WHERE ds.scraped_content IS NOT NULL
GROUP BY g.id;

-- Reset all data (development only)
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE optimization_routes;
TRUNCATE TABLE data_sources;
TRUNCATE TABLE player_achievements;
TRUNCATE TABLE player_games;
TRUNCATE TABLE achievements;
TRUNCATE TABLE games;
TRUNCATE TABLE players;
SET FOREIGN_KEY_CHECKS = 1;
```
