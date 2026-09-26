import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const W = await loadTs('src/config/world/index.ts')
const { NavGrid, WALL_COST } = await loadTs('src/world/NavGrid.ts')

const R = W.raster()

/** Follow the field's steps from a cell to the target; the cells visited. */
function walk(f, from) {
  const path = [from]
  let i = from
  for (let guard = 0; guard < 100000; guard++) {
    const j = f.nextCell(i)
    if (j < 0) break
    path.push(j)
    i = j
  }
  return path
}

/** A flat all-land raster, GW × GH cells of C px, shaped like WorldRaster. */
function toyRaster(GW, GH, C = 32) {
  const N = GW * GH
  return {
    W: GW * C, H: GH * C, C, GW, GH, N,
    terrain: new Uint8Array(N), under: new Uint8Array(N),
    crossing: new Int16Array(N).fill(-1), region: new Int8Array(N).fill(-1), road: new Uint8Array(N),
    bp: { FEATURES: { crossings: [] } },
    cell(x, y) {
      const gx = Math.floor(x / C), gy = Math.floor(y / C)
      return gx < 0 || gy < 0 || gx >= GW || gy >= GH ? -1 : gy * GW + gx
    },
    xy: i => [(i % GW) * C + C / 2, Math.floor(i / GW) * C + C / 2],
    slowCost: () => 1,
  }
}

test('the hall field routes the Ferrow Muster over the Old Bridge', () => {
  const nav = new NavGrid(R, { hall: W.HALL })
  const f = nav.field('hall')
  const camp = W.CAMPS.find(c => c.id === 'campFerrow')
  const from = nav.nearestPassable(camp.x, camp.y)
  assert.ok(Number.isFinite(f.d[from]), 'the camp can reach the hall')
  const path = walk(f, from)
  assert.equal(path.at(-1), nav.nearestPassable(W.HALL.x, W.HALL.y), 'the walk ends at the hall')
  const bridge = R.bp.FEATURES.crossings.findIndex(c => c.id === 'oldBridge')
  assert.ok(path.some(i => R.crossing[i] === bridge), 'the walk crosses the Old Bridge')
  assert.ok(path.every(i => nav.passable(i)), 'every step is on passable ground')
})

test('a via field targets its crossing', () => {
  const nav = new NavGrid(R, { hall: W.HALL })
  const f = nav.field('via:oldBridge')
  const bridge = R.bp.FEATURES.crossings.findIndex(c => c.id === 'oldBridge')
  const path = walk(f, nav.nearestPassable(W.HALL.x, W.HALL.y))
  assert.equal(R.crossing[path.at(-1)], bridge)
})

test('a sealed ring still has a finite path, through the wall', () => {
  const R2 = toyRaster(24, 24)
  const hall = { x: 12 * 32 + 16, y: 12 * 32 + 16 }
  const nav = new NavGrid(R2, { hall })
  // a square ring of wall pads every 62 px, 200 px out from the hall, no gaps
  let n = 0
  for (let t = -200; t <= 200; t += 50) {
    for (const [x, y] of [[t, -200], [t, 200], [-200, t], [200, t]]) {
      nav.setBlocker(`w${n++}`, hall.x + x, hall.y + y, 40, true)
    }
  }
  const f = nav.field('hall')
  const corner = R2.cell(16, 16)
  assert.ok(Number.isFinite(f.d[corner]), 'reachable')
  assert.ok(f.d[corner] > WALL_COST * 32, 'and it paid for the wall')
  const path = walk(f, corner)
  assert.equal(path.at(-1), R2.cell(hall.x, hall.y))
  assert.ok(path.some(i => nav.blocked(i)), 'through a blocked cell')
})

test('walls re-route once a sliced rebuild finishes, and the old field serves meanwhile', () => {
  const R2 = toyRaster(40, 40)
  let clock = 0
  const nav = new NavGrid(R2, { hall: { x: 20 * 32, y: 20 * 32 }, now: () => clock })
  const f0 = nav.field('hall')
  const v0 = nav.version
  nav.setBlocker('a', 20 * 32, 15 * 32, 40, true)
  assert.ok(nav.version > v0)
  assert.equal(nav.field('hall'), f0, 'stale field still serves')
  assert.ok(nav.building)
  nav.tick(0) // zero budget: at most one batch of work
  nav.flush()
  const f1 = nav.field('hall')
  assert.notEqual(f1, f0)
  assert.equal(f1.version, nav.version)
  nav.setBlocker('a', 0, 0, 0, false)
  assert.equal(nav.blockedAt(20 * 32, 15 * 32), false, 'cleared')
})

test('slide never ends on an impassable cell', () => {
  const nav = new NavGrid(R, { hall: W.HALL })
  let seed = 7
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
  // around the Old Bridge, Millford and the gorge: banks, water, crossings
  const spots = [[5120, 4230, 400], [3150, 4640, 400], [7500, 2850, 500], [1650, 5320, 400]]
  let moved = 0
  for (const [cx, cy, s] of spots) {
    let x = cx, y = cy
    const start = nav.nearestPassable(x, y)
    ;[x, y] = R.xy(start)
    for (let k = 0; k < 3000; k++) {
      const a = rnd() * Math.PI * 2, m = rnd() * 70
      const p = nav.slide(x, y, Math.cos(a) * m, Math.sin(a) * m, 6 + rnd() * 10)
      assert.ok(nav.passableAt(p.x, p.y), `ended in ${p.x},${p.y}`)
      if (p.x !== x || p.y !== y) moved++
      x = p.x; y = p.y
      if (Math.hypot(x - cx, y - cy) > s) [x, y] = R.xy(nav.nearestPassable(cx, cy))
    }
  }
  assert.ok(moved > 6000, 'walkers mostly move')
  // a walker put in the river comes back to the bank
  const wet = R.xy(R.terrain.findIndex((t, i) => t === 2 && Math.abs(R.xy(i)[0] - 5120) < 400))
  const p = nav.slide(wet[0], wet[1], 3, 0, 10)
  assert.ok(nav.passableAt(p.x, p.y))
})

test('fords slow, and lines stop at water and walls', () => {
  const nav = new NavGrid(R, { hall: W.HALL })
  assert.equal(nav.speedAt(3150, 4640), 0.6, 'Millford')
  assert.equal(nav.speedAt(W.HALL.x, W.HALL.y), 1)
  assert.ok(nav.lineClear(5120, 4450, 5120, 3900), 'over the bridge')
  assert.ok(!nav.lineClear(4800, 4450, 4800, 3900), 'not over the river')
  nav.setBlocker('w', 5120, 4000, 40, true)
  assert.ok(!nav.lineClear(5120, 4450, 5120, 3900), 'not through a wall')
})

test('the Regent\'s Causeway is fire-sealed until it is opened (S10)', () => {
  const nav = new NavGrid(R, { hall: W.HALL })
  const v0 = nav.version
  assert.equal(nav.isSealed('calderaCauseway'), true)
  assert.equal(nav.passableAt(6500, 7655), false)
  nav.setSealed('calderaCauseway', false)
  assert.equal(nav.passableAt(6500, 7655), true)
  assert.ok(nav.version > v0)
})
