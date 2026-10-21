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
  return playerGames
    .filter((pg) => total(pg) > 0 && pg.unlocked_count !== total(pg))
    .sort((a, b) => pct(b) - pct(a))
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
