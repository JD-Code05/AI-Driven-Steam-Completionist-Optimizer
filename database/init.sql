-- Steam Optimizer Database Schema
-- MySQL 8.0

CREATE DATABASE IF NOT EXISTS steam_optimizer;
USE steam_optimizer;

-- ============================================================
-- 1. players — Steam user profile data
-- ============================================================
CREATE TABLE players (
    id INT AUTO_INCREMENT PRIMARY KEY,
    steam_id VARCHAR(20) NOT NULL UNIQUE,
    persona_name VARCHAR(255),
    avatar_url TEXT,
    profile_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_steam_id (steam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. games — Game metadata cached from Steam API
-- ============================================================
CREATE TABLE games (
    id INT AUTO_INCREMENT PRIMARY KEY,
    app_id INT NOT NULL UNIQUE,
    name VARCHAR(255),
    img_icon_url TEXT,
    img_logo_url TEXT,
    img_capsule_url TEXT,
    total_achievements INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_app_id (app_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. player_games — M2M: which games a player owns/tracks
-- ============================================================
CREATE TABLE player_games (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    game_id INT NOT NULL,
    playtime_hours DECIMAL(10,1) DEFAULT 0.0,
    is_tracked BOOLEAN DEFAULT FALSE,
    last_synced TIMESTAMP NULL,
    UNIQUE KEY uq_player_game (player_id, game_id),
    CONSTRAINT fk_pg_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    CONSTRAINT fk_pg_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. achievements — Achievement definitions per game
-- ============================================================
CREATE TABLE achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game_id INT NOT NULL,
    api_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    description TEXT,
    icon_url TEXT,
    icon_gray_url TEXT,
    global_percent DECIMAL(5,2) DEFAULT 0.00,
    UNIQUE KEY uq_game_achievement (game_id, api_name),
    CONSTRAINT fk_ach_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_game_id (game_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. player_achievements — Player unlock status per achievement
-- ============================================================
CREATE TABLE player_achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    achievement_id INT NOT NULL,
    unlocked BOOLEAN DEFAULT FALSE,
    unlock_time TIMESTAMP NULL,
    UNIQUE KEY uq_player_achievement (player_id, achievement_id),
    CONSTRAINT fk_pa_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    CONSTRAINT fk_pa_achievement FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
    INDEX idx_player_unlocked (player_id, unlocked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. data_sources — External references (wikis, guides, videos)
-- ============================================================
CREATE TABLE data_sources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game_id INT NOT NULL,
    url TEXT NOT NULL,
    title VARCHAR(500),
    source_type ENUM('wiki', 'article', 'blog', 'youtube', 'other') DEFAULT 'other',
    scraped_content LONGTEXT,
    last_scraped TIMESTAMP NULL,
    is_auto BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ds_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_ds_game (game_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. optimization_routes — AI-generated optimization plans
-- ============================================================
CREATE TABLE optimization_routes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    game_id INT NOT NULL,
    summary_md LONGTEXT,
    source_ids_used JSON,
    model_used VARCHAR(50),
    prompt_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_or_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    CONSTRAINT fk_or_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_or_player_game (player_id, game_id),
    INDEX idx_or_prompt_hash (prompt_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

