import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardStats, inProgress } from './stats.js'

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

test('inProgress: otherwise unfinished synced games, highest percent first', () => {
  const D = pg(5, 10, 1)
  const E = pg(6, 10, 8)
  assert.deepEqual(inProgress([A, D, B, C, E]), [E, B, D])
})
