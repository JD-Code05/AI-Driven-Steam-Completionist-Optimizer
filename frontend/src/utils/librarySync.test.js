import test from 'node:test'
import assert from 'node:assert/strict'
import { runLibrarySync, syncSummary } from './librarySync.js'

const httpError = (status) => Object.assign(new Error('x'), { response: { status } })

test('reports progress as current of total, one game at a time', async () => {
  const progress = []
  let running = 0
  let most = 0
  const syncOne = async () => {
    running++
    most = Math.max(most, running)
    await new Promise((r) => setTimeout(r, 1))
    running--
  }
  const result = await runLibrarySync([1, 2, 3], syncOne, { onProgress: (c, t) => progress.push([c, t]) })
  assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]])
  assert.equal(most, 1)
  assert.deepEqual(result, { total: 3, done: 3, failed: 0, stopped: null })
})

test('one failure does not stop the rest', async () => {
  const seen = []
  const result = await runLibrarySync([1, 2, 3], async (id) => {
    seen.push(id)
    if (id === 2) throw httpError(502)
  })
  assert.deepEqual(seen, [1, 2, 3])
  assert.deepEqual(result, { total: 3, done: 2, failed: 1, stopped: null })
})

test('a network error with no response counts as a failure', async () => {
  const result = await runLibrarySync([1], async () => { throw new Error('offline') })
  assert.equal(result.failed, 1)
})

test('429 stops without calling later games', async () => {
  const seen = []
  const result = await runLibrarySync([1, 2, 3], async (id) => {
    seen.push(id)
    if (id === 2) throw httpError(429)
  })
  assert.deepEqual(seen, [1, 2])
  assert.equal(result.stopped, 'rate_limited')
})

test('403 stops with private', async () => {
  const result = await runLibrarySync([1, 2], async () => { throw httpError(403) })
  assert.equal(result.stopped, 'private')
})

test('shouldStop stops with left', async () => {
  const seen = []
  let stop = false
  const result = await runLibrarySync([1, 2], async (id) => { seen.push(id); stop = true }, { shouldStop: () => stop })
  assert.deepEqual(seen, [1])
  assert.equal(result.stopped, 'left')
})

test('syncSummary copy', () => {
  assert.equal(syncSummary({ total: 63, done: 60, failed: 3, stopped: null }), "Synced 60 of 63. 3 couldn't be loaded; press Sync to try again.")
  assert.equal(syncSummary({ total: 63, done: 63, failed: 0, stopped: null }), '')
  assert.equal(syncSummary({ total: 63, done: 5, failed: 0, stopped: 'rate_limited' }), 'Steam asked us to slow down. Try again later.')
  assert.equal(syncSummary({ total: 63, done: 0, failed: 0, stopped: 'private' }), "Steam returned no achievements. Make sure your game details are public in Steam's privacy settings.")
  assert.equal(syncSummary({ total: 63, done: 5, failed: 0, stopped: 'left' }), '')
})
