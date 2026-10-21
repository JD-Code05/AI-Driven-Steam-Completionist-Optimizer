import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardStats, inProgress, rarityBreakdown } from './stats.js'

const pg = (id, total, unlocked, extra = {}) => ({
  id, playtime_hours: 0, is_tracked: false, last_synced: null,
  game: { id, total_achievements: total }, unlocked_count: unlocked, ...extra,
})
const A = pg(1, 10, 10, { playtime_hours: 1, last_synced: '2026-10-01T00:00:00Z' })
const B = pg(2, 20, 5, { playtime_hours: 2, last_synced: '2026-10-05T00:00:00Z' })
const C = pg(3, 0, 0, { playtime_hours: 12.5 })

test('dashboardStats: empty library', () => {
  assert.deepEqual(dashboardStats([]), { owned: 0, hours: 0, unlockedPct: 0, perfect: 0, lastSynced: null })
})

test('dashboardStats: percent over synced games, perfect count, hours, latest sync', () => {
  const s = dashboardStats([A, B, C])
  assert.equal(s.unlockedPct, 50)
  assert.equal(s.perfect, 1)
  assert.equal(s.owned, 3)
  assert.equal(s.hours, 15.5)
  assert.equal(s.lastSynced, '2026-10-05T00:00:00Z')
})

test('inProgress: tracked games win when any exist', () => {
  const t = pg(4, 8, 1, { is_tracked: true })
  assert.deepEqual(inProgress([A, B, C, t]), [t])
})

test('inProgress: otherwise every unfinished game, synced by percent, then unsynced by playtime', () => {
  const D = pg(5, 10, 1)
  const E = pg(6, 10, 8)
  const F = pg(7, 0, 0, { playtime_hours: 40 })
  assert.deepEqual(inProgress([A, D, B, C, E, F]), [E, B, D, F, C])
})

test('inProgress: a freshly synced library with no achievements loaded still shows games, capped at 12', () => {
  const library = Array.from({ length: 20 }, (_, i) => pg(100 + i, 0, 0, { playtime_hours: i }))
  const shown = inProgress(library)
  assert.equal(shown.length, 12)
  assert.equal(shown[0].playtime_hours, 19)
})

test('rarityBreakdown: empty list still has every tier', () => {
  const zero = { got: 0, total: 0 }
  assert.deepEqual(rarityBreakdown([], new Set()), { 'ultra-rare': zero, rare: zero, uncommon: zero, common: zero })
})

test('rarityBreakdown: counts per tier, got only for unlocked ids', () => {
  const a = (id, rarity_tier) => ({ id, rarity_tier })
  const list = [a(1, 'ultra-rare'), a(2, 'ultra-rare'), a(3, 'rare'), a(4, 'common'), a(5, 'common'), a(6, 'common')]
  assert.deepEqual(rarityBreakdown(list, new Set([2, 4, 5, 99])), {
    'ultra-rare': { got: 1, total: 2 },
    rare: { got: 0, total: 1 },
    uncommon: { got: 0, total: 0 },
    common: { got: 2, total: 3 },
  })
})
