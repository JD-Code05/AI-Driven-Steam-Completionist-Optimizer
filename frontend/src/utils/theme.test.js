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

test('readStoredTheme: reaching window.localStorage itself throwing reads as nothing stored', (t) => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('blocked') }, configurable: true })
  t.after(() => before ? Object.defineProperty(globalThis, 'localStorage', before) : delete globalThis.localStorage)
  assert.equal(readStoredTheme(), null)
})
