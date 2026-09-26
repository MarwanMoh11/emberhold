import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const W = await loadTs('src/config/world/index.ts')
const { NavGrid, walkRadius, ROAD_SPEED } = await loadTs('src/world/NavGrid.ts')
const { pathLength } = await loadTs('src/world/PathFind.ts')
const { PathFollower } = await loadTs('src/world/PathFollower.ts')

const R = W.raster()
const pad = id => W.PADS.find(p => p.id === id)
const depot = pad('depot'), farm5 = pad('farm5')
const bridge = R.bp.FEATURES.crossings.findIndex(c => c.id === 'oldBridge')

/** Cells a walk along the polyline passes over, sampled every 4 px. */
function cellsAlong(path) {
  const out = []
  for (let k = 1; k < path.length; k++) {
    const [ax, ay] = path[k - 1], [bx, by] = path[k]
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4))
    for (let s = 0; s <= n; s++) out.push(R.cell(ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n))
  }
  return out
}

test('the depot to farm5 crosses the Old Bridge, on passable ground throughout', () => {
  const nav = new NavGrid(R, { hall: W.HALL })
  const path = nav.findPath(depot.x, depot.y, farm5.x, farm5.y)
  assert.ok(path, 'a path exists')
  assert.deepEqual(path[0], [depot.x, depot.y])
  assert.deepEqual(path.at(-1), [farm5.x, farm5.y])
  assert.ok(path.every(([x, y]) => nav.passableAt(x, y)), 'no path point is impassable')
  const cells = cellsAlong(path)
  assert.ok(cells.every(i => nav.passable(i)), 'no leg crosses impassable ground')
  assert.ok(cells.some(i => R.crossing[i] === bridge), 'the path crosses the Old Bridge')
  assert.ok(path.length < 12, `string-pulled to a few legs (${path.length})`)
  const L = pathLength(path)
  const straight = Math.hypot(farm5.x - depot.x, farm5.y - depot.y)
  assert.ok(L >= straight && L < straight * 1.35, `length ${Math.round(L)} vs straight ${Math.round(straight)}`)
})

test('a walker following the path with slide reaches farm5 and never stands off the ground', () => {
  const nav = new NavGrid(R, { hall: W.HALL })
  const f = new PathFollower()
  f.set(nav.findPath(depot.x, depot.y + 14, farm5.x, farm5.y + 12))
  let x = depot.x, y = depot.y + 14, t = 0, onBridge = 0
  const dt = 1 / 30, speed = 124, rad = walkRadius(11)
  for (; t < 60 && f.active; t += dt) {
    const s = f.step(x, y, dt)
    const dx = s.x - x, dy = s.y - y, d = Math.hypot(dx, dy) || 1
    const k = speed * dt * nav.allySpeedAt(x, y)
    const p = nav.slide(x, y, (dx / d) * k, (dy / d) * k, rad)
    x = p.x; y = p.y
    assert.ok(nav.passableAt(x, y), `on the ground at ${Math.round(x)},${Math.round(y)}`)
    assert.ok(f.stuck < 1, `not stuck at ${Math.round(x)},${Math.round(y)}`)
    if (R.crossing[R.cell(x, y)] === bridge) onBridge++
  }
  assert.ok(!f.active, `arrived (t=${t.toFixed(1)} s, at ${Math.round(x)},${Math.round(y)})`)
  assert.ok(Math.hypot(farm5.x - x, farm5.y + 12 - y) < 30)
  assert.ok(onBridge > 0, 'walked over the bridge')
})

test('the cache serves a nearby repeat, and empties when the grid changes', () => {
  const nav = new NavGrid(R, { hall: W.HALL })
  const a = nav.findPath(depot.x, depot.y, farm5.x, farm5.y)
  const s0 = nav.paths.stats()
  const b = nav.findPath(depot.x + 10, depot.y + 6, farm5.x - 8, farm5.y)
  const s1 = nav.paths.stats()
  assert.equal(s1.cacheHits, s0.cacheHits + 1, 'a hit')
  assert.equal(s1.searches, s0.searches, 'no new search')
  assert.deepEqual(b[0], [depot.x + 10, depot.y + 6], 're-ended at the caller')
  assert.deepEqual(b.slice(1, -1), a.slice(1, -1), 'same middle')
  nav.setBlocker('w', 3000, 3000, 40, true)
  nav.findPath(depot.x, depot.y, farm5.x, farm5.y)
  assert.equal(nav.paths.stats().searches, s1.searches + 1, 'searched again after a version bump')
})

test('maxLen gives up on a far goal and finds a near one', () => {
  const nav = new NavGrid(R, { hall: W.HALL })
  assert.equal(nav.findPath(depot.x, depot.y, farm5.x, farm5.y, 760), null)
  const near = nav.findPath(depot.x, depot.y, depot.x + 300, depot.y - 200, 760)
  assert.ok(near && pathLength(near) <= 760)
})

test('the queue resolves within its budget and matches a direct search', () => {
  let clock = 0
  const nav = new NavGrid(R, { hall: W.HALL, now: () => clock })
  const t = nav.requestPath(depot.x, depot.y, farm5.x, farm5.y)
  assert.equal(t.done, false)
  const same = nav.requestPath(depot.x + 4, depot.y, farm5.x, farm5.y)
  assert.equal(same, t, 'the same coarse ends share a ticket')
  nav.paths.flush()
  assert.equal(t.done, true)
  const direct = new NavGrid(R, { hall: W.HALL }).findPath(depot.x, depot.y, farm5.x, farm5.y)
  assert.deepEqual(t.path, direct)
  const st = nav.paths.stats()
  assert.equal(st.queued, 0)
  assert.ok(st.lastExpanded > 0 && st.lastExpanded <= 20000)
})

test('an unreachable goal returns null and is remembered', () => {
  const nav = new NavGrid(R, { hall: W.HALL })
  // the sea off the south-west corner has no passable cell within 8 rings
  assert.equal(nav.findPath(depot.x, depot.y, 40, 9170), null)
  // an island of land cut off by a wall of water: ring a toy grid
  const GW = 40, GH = 40, C = 32, N = GW * GH
  const terrain = new Uint8Array(N)
  for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) if (x === 10 || x === 19 || y === 10 || y === 19) terrain[y * GW + x] = 2
  const toy = {
    W: GW * C, H: GH * C, C, GW, GH, N, terrain, under: terrain,
    crossing: new Int16Array(N).fill(-1), region: new Int8Array(N).fill(-1), road: new Uint8Array(N),
    bp: { FEATURES: { crossings: [] } },
    cell(x, y) { const gx = Math.floor(x / C), gy = Math.floor(y / C); return gx < 0 || gy < 0 || gx >= GW || gy >= GH ? -1 : gy * GW + gx },
    xy: i => [(i % GW) * C + C / 2, Math.floor(i / GW) * C + C / 2],
    slowCost: () => 1,
  }
  const tn = new NavGrid(toy, { hall: { x: 16, y: 16 } })
  assert.equal(tn.findPath(16, 16, 15 * C, 15 * C), null, 'the island is out of reach')
  const s = tn.paths.stats()
  assert.equal(s.failed, 1)
  assert.equal(tn.findPath(20, 20, 15 * C + 4, 15 * C), null)
  assert.equal(tn.paths.stats().cacheHits, s.cacheHits + 1, 'the failure is cached')
})

test('roads: the King\'s Road is fast ground for allies', () => {
  const nav = new NavGrid(R, { hall: W.HALL })
  assert.equal(ROAD_SPEED, 1.2)
  assert.ok(nav.onRoad(5120, 3500), 'the King\'s Road below the depot')
  assert.ok(!nav.onRoad(5400, 3000))
  assert.equal(nav.allySpeedAt(5120, 3500), 1.2)
  assert.equal(nav.allySpeedAt(5400, 3000), 1)
  assert.equal(nav.speedAt(5120, 3500), 1, 'enemies read speedAt: no road bonus')
})
