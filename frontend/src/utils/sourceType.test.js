import test from 'node:test'
import assert from 'node:assert/strict'
import { inferSourceType } from './sourceType.js'

test('inferSourceType: YouTube hosts', () => {
  for (const url of ['https://www.youtube.com/watch?v=x', 'https://youtu.be/x', 'https://m.youtube.com/watch?v=x']) {
    assert.equal(inferSourceType(url), 'youtube', url)
  }
})

test('inferSourceType: wiki and fandom hosts', () => {
  assert.equal(inferSourceType('https://stardewvalleywiki.com/Fish'), 'wiki')
  assert.equal(inferSourceType('https://hollowknight.fandom.com/wiki/Grubs'), 'wiki')
})

test('inferSourceType: everything else is an article', () => {
  assert.equal(inferSourceType('https://steamcommunity.com/sharedfiles/filedetails/?id=1'), 'article')
  assert.equal(inferSourceType('not a url'), 'article')
})
