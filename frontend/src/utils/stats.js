const total = (pg) => pg.game?.total_achievements ?? 0
const pct = (pg) => (pg.unlocked_count ?? 0) / total(pg)

export function dashboardStats(playerGames) {
  const synced = playerGames.filter((pg) => total(pg) > 0)
  const totalAch = synced.reduce((n, pg) => n + total(pg), 0)
  const unlocked = synced.reduce((n, pg) => n + (pg.unlocked_count ?? 0), 0)
  return {
    owned: playerGames.length,
    hours: playerGames.reduce((n, pg) => n + (pg.playtime_hours || 0), 0),
    unlockedPct: totalAch ? Math.round((unlocked / totalAch) * 100) : 0,
    perfect: synced.filter((pg) => pg.unlocked_count === total(pg)).length,
    // ISO strings sort lexicographically
    lastSynced: playerGames.reduce((max, pg) => (pg.last_synced && (!max || pg.last_synced > max) ? pg.last_synced : max), null),
  }
}

export function inProgress(playerGames) {
  const tracked = playerGames.filter((pg) => pg.is_tracked)
  if (tracked.length) return tracked
  const synced = (pg) => total(pg) > 0
  // Unsynced games are included so a fresh library isn't empty; pct is NaN for them, so playtime breaks the tie.
  return playerGames
    .filter((pg) => !synced(pg) || pg.unlocked_count !== total(pg))
    .sort((a, b) => synced(b) - synced(a) || pct(b) - pct(a) || (b.playtime_hours || 0) - (a.playtime_hours || 0))
    .slice(0, 12)
}

export function perfectGames(playerGames) {
  // ISO strings sort lexicographically; games without a completion date go last
  return playerGames
    .filter((pg) => total(pg) > 0 && pg.unlocked_count === total(pg))
    .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))
}

export function rarityBreakdown(achievements, unlockedIds) {
  const out = Object.fromEntries(['ultra-rare', 'rare', 'uncommon', 'common'].map((t) => [t, { got: 0, total: 0 }]))
  for (const a of achievements) {
    const cell = out[a.rarity_tier] || out.common
    cell.total++
    if (unlockedIds.has(a.id)) cell.got++
  }
  return out
}
