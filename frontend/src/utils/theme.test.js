import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTheme, readStoredTheme } from './theme.js'

test('resolveTheme: stored choice wins over the system', () => {
  assert.equal(resolveTheme('dark', false), 'dark')
  assert.equal(resolveTheme('light', true), 'light')
})

test('resolveTheme: nothing stored follows the system', () => {
  assert.equal(resolveTheme(null, true), 'dark')
  assert.equal(resolveTheme(null, false), 'light')
})

test('readStoredTheme: only light/dark are accepted', () => {
  assert.equal(readStoredTheme({ getItem: () => 'dark' }), 'dark')
  assert.equal(readStoredTheme({ getItem: () => 'blue' }), null)
})

test('readStoredTheme: blocked storage reads as nothing stored', () => {
  assert.equal(readStoredTheme({ getItem: () => { throw new Error('blocked') } }), null)
})
