const COL = 260
const ROW = 125
const ICON = 68
const NODE_WIDTH = 198
const FIRST_X = 58
const COVER_HEIGHT = 102
const THEMED_TOP = 200
const STORY_TOP = 150
const OTHER = 'Other'

// Unlock status comes from the player's achievements on every load, so the saved route never goes stale.
export function buildRouteView(route, achievements, unlockedIds) {
  const byApi = new Map(achievements.map((a) => [a.api_name, a]))
  const placed = new Set()
  const branches = route.branches.map((b) => ({
    name: b.name,
    kind: b.kind,
    branchesFrom: b.branches_from ?? null,
    steps: b.steps.filter((s) => byApi.has(s.api_name)).map((s) => {
      placed.add(s.api_name)
      return { achievement: byApi.get(s.api_name), missable: !!s.missable, missableNote: s.missable_note ?? null }
    }),
  }))

  const added = achievements
    .filter((a) => !placed.has(a.api_name))
    .sort((a, b) => Number(b.global_percent ?? 0) - Number(a.global_percent ?? 0))
    .map((achievement) => ({ achievement, missable: false, missableNote: null }))
  if (added.length) {
    const other = branches.find((b) => b.name === OTHER)
    if (other) other.steps.push(...added)
    else branches.push({ name: OTHER, kind: 'side', branchesFrom: null, steps: added })
  }

  for (const b of branches) {
    let foundNext = false
    for (const s of b.steps) {
      if (unlockedIds.has(s.achievement.id)) s.state = 'done'
      else {
        s.state = foundNext ? 'later' : 'next'
        foundNext = true
      }
    }
  }

  return {
    message: route.message,
    shape: route.shape,
    branches: branches.filter((b) => b.steps.length),
    done: achievements.filter((a) => unlockedIds.has(a.id)).length,
    total: achievements.length,
  }
}

export function visibleSteps(steps, expanded, nextCount = 3) {
  if (expanded) return { shown: steps, hiddenCount: 0 }
  const lastDone = steps.findLastIndex((s) => s.state === 'done')
  const keep = new Set(steps.flatMap((s, i) => (s.state === 'done' ? [] : [i])).slice(0, nextCount))
  if (lastDone >= 0) keep.add(lastDone)
  const hiddenCount = steps.length - keep.size
  // a button for one step takes as much room as the step
  if (hiddenCount <= 1) return { shown: steps, hiddenCount: 0 }
  return { shown: steps.filter((_, i) => keep.has(i)), hiddenCount }
}

const center = (x) => x + ICON / 2

function placeBranch(out, branch, x, top, startRow, expandedNames, entryPath, trunk = false) {
  const expanded = expandedNames.has(branch.name)
  const { shown, hiddenCount } = visibleSteps(branch.steps, expanded)
  const cx = center(x)
  const rowY = (i) => top + ROW * (startRow + i)

  shown.forEach((step, i) => {
    const y = rowY(i)
    if (i === 0) out.links.push({ d: entryPath(cx, y), state: step.state === 'done' ? 'done' : 'ready', trunk })
    else out.links.push({ d: `M${cx} ${rowY(i - 1) + ICON + 8} L${cx} ${y - 8}`, state: step.state === 'later' ? 'later' : 'done', trunk })
    out.nodes.push({ apiName: step.achievement.api_name, x, y, step })
  })

  const lastY = rowY(shown.length - 1)
  const buttonY = lastY + ICON + 30
  let bottom = lastY + ICON
  const collapsible = expanded && visibleSteps(branch.steps, false).hiddenCount > 0
  if (hiddenCount || collapsible) {
    out.links.push({ d: `M${cx} ${lastY + ICON + 8} L${cx} ${buttonY}`, state: 'later', trunk })
    out.moreButtons.push({ branchName: branch.name, label: hiddenCount ? `+${hiddenCount} more` : 'Show less', x: cx, y: buttonY })
    bottom = buttonY + 30
  }
  out.bottom = Math.max(out.bottom, bottom)
  return shown
}

function layoutThemed(view, expandedNames, out) {
  const lastX = FIRST_X + COL * (view.branches.length - 1)
  out.root = { x: (FIRST_X + lastX) / 2, y: 0 }
  const rootCx = center(out.root.x)
  view.branches.forEach((branch, i) => {
    const x = FIRST_X + COL * i
    out.labels.push({ name: branch.name, x: center(x), y: THEMED_TOP - 50 })
    placeBranch(out, branch, x, THEMED_TOP, 0, expandedNames,
      (cx, y) => `M${rootCx} ${COVER_HEIGHT} C${rootCx} ${COVER_HEIGHT + 63} ${cx} ${COVER_HEIGHT + 23} ${cx} ${y - 4}`)
  })
  return lastX
}

function layoutStory(view, main, expandedNames, out) {
  const sides = view.branches.filter((b) => b !== main)
  const trunkX = FIRST_X + (sides.length ? COL : 0)
  out.root = { x: trunkX, y: 0 }
  const trunkCx = center(trunkX)
  out.labels.push({ name: main.name, x: trunkCx, y: STORY_TOP - 34 })
  const shownTrunk = placeBranch(out, main, trunkX, STORY_TOP, 0, expandedNames,
    (cx, y) => `M${cx} ${COVER_HEIGHT} L${cx} ${y - 8}`, true)

  let lastX = trunkX
  sides.forEach((branch, i) => {
    // first side goes left of the trunk, the rest fill columns to the right
    const x = i === 0 ? FIRST_X : FIRST_X + COL * (i + 1)
    lastX = Math.max(lastX, x)
    const fromIndex = main.steps.findIndex((s) => s.achievement.api_name === branch.branchesFrom)
    let startRow = 0
    let entry
    if (fromIndex >= 0) {
      const attached = shownTrunk.findLastIndex((s) => main.steps.indexOf(s) <= fromIndex)
      const row = Math.max(attached, 0)
      startRow = row + 1
      const fromBottom = STORY_TOP + ROW * row + ICON + 6
      entry = (cx, y) => `M${trunkCx} ${fromBottom} C${trunkCx} ${fromBottom + 40} ${cx} ${y - 52} ${cx} ${y - 8}`
    } else {
      const edge = x < trunkX ? trunkX : trunkX + ICON
      entry = (cx, y) => `M${edge} 60 C${(edge + cx) / 2} 60 ${cx} 70 ${cx} ${y - 8}`
    }
    out.labels.push({ name: branch.name, x: center(x), y: STORY_TOP + ROW * startRow - 34 })
    placeBranch(out, branch, x, STORY_TOP, startRow, expandedNames, entry)
  })
  return lastX
}

export function layoutTree(view, expandedNames) {
  const out = { nodes: [], links: [], labels: [], moreButtons: [], root: null, bottom: 0 }
  const main = view.shape === 'story' ? view.branches.find((b) => b.kind === 'main') : null
  const lastX = main ? layoutStory(view, main, expandedNames, out) : layoutThemed(view, expandedNames, out)
  const { bottom, ...layout } = out
  return { ...layout, width: lastX + NODE_WIDTH + 16, height: bottom + 24 }
}
