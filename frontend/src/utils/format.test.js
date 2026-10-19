import test from 'node:test'
import assert from 'node:assert/strict'
import { timeAgo, formatDate } from './format.js'

const now = Date.parse('2026-10-19T12:00:00Z')
const ago = (ms) => new Date(now - ms).toISOString()

test('timeAgo: never, just now, minutes, hours, days', () => {
  assert.equal(timeAgo(null, now), 'never')
  assert.equal(timeAgo(ago(30e3), now), 'just now')
  assert.equal(timeAgo(ago(4 * 60e3), now), '4 min ago')
  assert.equal(timeAgo(ago(2 * 3600e3), now), '2 h ago')
  assert.equal(timeAgo(ago(3 * 86400e3), now), '3 days ago')
  assert.equal(timeAgo(ago(86400e3), now), '1 day ago')
})

test('formatDate: en-US short date', () => {
  assert.equal(formatDate('2026-03-12T10:00:00Z'), 'Mar 12, 2026')
})
