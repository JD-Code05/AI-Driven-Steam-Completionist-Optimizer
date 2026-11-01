import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRouteView, layoutTree, visibleSteps } from './routeTree.js'

const ach = (id, global_percent = 10) => ({ id, api_name: `A${id}`, display_name: `Ach ${id}`, global_percent })
const step = (id, missable = false, missable_note = null) => ({ api_name: `A${id}`, missable, missable_note })
const branch = (name, ids, extra = {}) => ({ name, kind: 'side', branches_from: null, steps: ids.map((i) => step(i)), ...extra })
const route = (branches, shape = 'themed') => ({ message: 'Hi', shape, branches })
const achs = (n) => Array.from({ length: n }, (_, i) => ach(i + 1))
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
const states = (b) => b.steps.map((s) => s.state)

test('next is the first unfinished step per branch, later ones are later', () => {
  const view = buildRouteView(route([branch('One', [1, 2, 3]), branch('Two', [4, 5])]), achs(5), new Set([1]))
  assert.deepEqual(states(view.branches[0]), ['done', 'next', 'later'])
  assert.deepEqual(states(view.branches[1]), ['next', 'later'])
  assert.equal(view.done, 1)
  assert.equal(view.total, 5)
})

test('state comes from unlockedIds, not the route', () => {
  const r = route([branch('One', [1, 2])])
  r.branches[0].steps[0].state = 'done'
  const view = buildRouteView(r, achs(2), new Set([2]))
  assert.deepEqual(states(view.branches[0]), ['next', 'done'])
})

test('an all-done branch has no next step', () => {
  const view = buildRouteView(route([branch('One', [1, 2])]), achs(2), new Set([1, 2]))
  assert.deepEqual(states(view.branches[0]), ['done', 'done'])
})

test('achievement added after the route was saved appears in Other, most common first', () => {
  const all = [ach(1), ach(2, 3), ach(3, 40)]
  const view = buildRouteView(route([branch('One', [1])]), all, new Set())
  const other = view.branches.at(-1)
  assert.equal(other.name, 'Other')
  assert.deepEqual(other.steps.map((s) => s.achievement.id), [3, 2])
})

test('new achievements join an existing Other branch', () => {
  const view = buildRouteView(route([branch('Other', [1])]), achs(2), new Set())
  assert.equal(view.branches.length, 1)
  assert.deepEqual(view.branches[0].steps.map((s) => s.achievement.id), [1, 2])
})

test('achievement removed from the game disappears, and an emptied branch goes too', () => {
  const view = buildRouteView(route([branch('One', [1, 9]), branch('Gone', [8])]), achs(1), new Set())
  assert.deepEqual(view.branches.map((b) => b.name), ['One'])
  assert.equal(view.branches[0].steps.length, 1)
  assert.equal(view.total, 1)
})

test('missable details carry through', () => {
  const r = route([{ ...branch('One', []), steps: [step(1, true, 'Before the end')] }])
  const s = buildRouteView(r, achs(1), new Set()).branches[0].steps[0]
  assert.equal(s.missable, true)
  assert.equal(s.missableNote, 'Before the end')
})

const stepsWith = (doneCount, total) => Array.from({ length: total }, (_, i) => ({
  achievement: ach(i + 1),
  state: i < doneCount ? 'done' : i === doneCount ? 'next' : 'later',
}))

test('visibleSteps shows the last done step and the next 3, counting the rest', () => {
  const { shown, hiddenCount } = visibleSteps(stepsWith(4, 20), false)
  assert.deepEqual(shown.map((s) => s.achievement.id), [4, 5, 6, 7])
  assert.equal(hiddenCount, 16)
})

test('visibleSteps expanded shows everything', () => {
  const { shown, hiddenCount } = visibleSteps(stepsWith(4, 20), true)
  assert.equal(shown.length, 20)
  assert.equal(hiddenCount, 0)
})

test('short branches have no hidden count', () => {
  assert.equal(visibleSteps(stepsWith(0, 3), false).hiddenCount, 0)
  // hiding a single step would take as much room as showing it
  const { shown, hiddenCount } = visibleSteps(stepsWith(1, 5), false)
  assert.equal(hiddenCount, 0)
  assert.equal(shown.length, 5)
})

test('an all-done branch shows only its last step behind the button', () => {
  const { shown, hiddenCount } = visibleSteps(stepsWith(9, 9), false)
  assert.deepEqual(shown.map((s) => s.achievement.id), [9])
  assert.equal(hiddenCount, 8)
})

const overlaps = (nodes) => {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (Math.abs(nodes[i].x - nodes[j].x) < 68 && Math.abs(nodes[i].y - nodes[j].y) < 68) return true
    }
  }
  return false
}

test('themed: each branch gets its own column, and nodes never overlap at 200 steps in 6 branches', () => {
  const branches = Array.from({ length: 6 }, (_, b) => branch(`B${b}`, range(b * 34 + 1, b * 34 + 34)))
  const view = buildRouteView(route(branches), achs(204), new Set())
  const all = new Set(view.branches.map((b) => b.name))
  const layout = layoutTree(view, all)
  assert.equal(layout.nodes.length, 204)
  assert.equal(new Set(layout.nodes.map((n) => n.x)).size, 6)
  assert.equal(overlaps(layout.nodes), false)
  assert.ok(layout.width >= Math.max(...layout.nodes.map((n) => n.x)) + 198)
  assert.ok(layout.height > Math.max(...layout.nodes.map((n) => n.y)) + 68)
})

test('story: a side branch starts level with the step after its branchesFrom, a null one at the top', () => {
  const r = route([
    branch('Story', [1, 2, 3], { kind: 'main' }),
    branch('Late', [4], { branches_from: 'A2' }),
    branch('Free', [5]),
  ], 'story')
  const layout = layoutTree(buildRouteView(r, achs(5), new Set()), new Set())
  const y = (api) => layout.nodes.find((n) => n.apiName === api).y
  assert.equal(y('A4'), y('A3'))
  assert.equal(y('A5'), y('A1'))
  assert.equal(overlaps(layout.nodes), false)
})

test('story: the trunk is marked, and its column stays the same', () => {
  const r = route([branch('Story', [1, 2], { kind: 'main' }), branch('Side', [3], { branches_from: 'A1' })], 'story')
  const layout = layoutTree(buildRouteView(r, achs(3), new Set()), new Set())
  assert.ok(layout.links.some((l) => l.trunk))
  assert.equal(layout.nodes.find((n) => n.apiName === 'A1').x, layout.nodes.find((n) => n.apiName === 'A2').x)
  assert.equal(layout.root.x, layout.nodes.find((n) => n.apiName === 'A1').x)
})

test('story: a side branch from a hidden step attaches to the last visible step before it', () => {
  const r = route([
    branch('Story', range(1, 10), { kind: 'main' }),
    branch('Side', [11], { branches_from: 'A9' }),
  ], 'story')
  const layout = layoutTree(buildRouteView(r, achs(11), new Set()), new Set())
  const trunkYs = layout.nodes.filter((n) => Number(n.apiName.slice(1)) <= 10).map((n) => n.y)
  assert.equal(trunkYs.length, 3)
  assert.equal(layout.nodes.find((n) => n.apiName === 'A11').y, Math.max(...trunkYs) + (trunkYs[1] - trunkYs[0]))
})

test('expanding a branch grows height, and its button can collapse it again', () => {
  const view = buildRouteView(route([branch('One', range(1, 12))]), achs(12), new Set())
  const closed = layoutTree(view, new Set())
  const open = layoutTree(view, new Set(['One']))
  assert.ok(open.height > closed.height)
  assert.deepEqual(closed.moreButtons.map((m) => m.label), ['+9 more'])
  assert.deepEqual(open.moreButtons.map((m) => m.label), ['Show less'])
})

test('links show progress: done up to the next step, later after it', () => {
  const view = buildRouteView(route([branch('One', [1, 2, 3])]), achs(3), new Set([1]))
  const layout = layoutTree(view, new Set())
  assert.deepEqual(layout.links.map((l) => l.state), ['done', 'done', 'later'])
})
