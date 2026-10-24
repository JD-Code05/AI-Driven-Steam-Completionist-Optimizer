import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAchievementTip } from './achievementTipParser.js'

test('items are not cut at a capital Z or mid-sentence numbers, and the last item is kept', () => {
  const tip = parseAchievementTip(
    '## Important Warnings\n1. Missable items (e.g., the Zone 2 key) vanish.\n2. Save first.\n\n## Pro Tips\n1. Bring 3 potions.\n2. Last tip'
  )
  assert.deepEqual(tip.warnings, ['Missable items (e.g., the Zone 2 key) vanish.', 'Save first.'])
  assert.deepEqual(tip.pro_tips, ['Bring 3 potions.', 'Last tip'])
})

test('single-line numbered lists still split', () => {
  assert.deepEqual(parseAchievementTip('## How to Unlock\n1. Go north. 2. Open the door.').how_to_unlock, ['Go north.', 'Open the door.'])
})
