import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { Approaches, SPAWN_CLAMP, frontsFor, splitBudget } = await loadTs('src/systems/Approaches.ts')
const { NavGrid } = await loadTs('src/world/NavGrid.ts')
const { raster, HALL, REGIONS, REGION_BY_ID, CAMPS } = await loadTs('src/config/world/index.ts')

const r = raster()
const nav = new NavGrid(r, { hall: HALL })

/** Approaches over the real raster with the given regions claimed and camp states. */
function world({ claimed = ['hold'], burned = [], awake = [] } = {}) {
  const flags = new Set(claimed)
  const idx = new Set(claimed.map(id => REGION_BY_ID.get(id).index))
  const mask = new Uint8Array(r.N)
  for (let i = 0; i < r.N; i++) if (idx.has(r.region[i])) mask[i] = 1
  const state = id => {
    if (!CAMPS.some(c => c.id === id)) return null
    return burned.includes(id) ? 'burned' : awake.includes(id) ? 'awake' : 'asleep'
  }
  return new Approaches({ nav, claimMask: () => mask, claimed: id => flags.has(id), campState: state })
}

const near = (p, x, y, tol = 48) => Math.hypot(p[0] - x, p[1] - y) <= tol
const camp = id => CAMPS.find(c => c.id === id)

test('with only the hold claimed, the south road musters and spawns at the Ferrow Muster', () => {
  const a = world()
  assert.equal(a.muster('south').id, 'campFerrow')
  assert.ok(a.toClaimed('south').d < SPAWN_CLAMP)
  const f = camp('campFerrow')
  assert.ok(near(a.spawnPoint('south'), f.x, f.y), `spawn ${a.spawnPoint('south')}`)
  // the route crosses the Old Bridge and ends at the hall
  const cells = a.routeCells('south')
  const bridge = r.bp.FEATURES.crossings.findIndex(c => c.id === 'oldBridge')
  assert.ok(cells.some(i => r.crossing[i] === bridge))
  assert.equal(cells.at(-1), r.cell(HALL.x, HALL.y))
})

test('the west ford is clamped to 2400 px of path before claimed ground', () => {
  const a = world()
  const { d, cells } = a.toClaimed('west')
  assert.ok(d > SPAWN_CLAMP, `d ${d}`)
  const sp = a.spawnPoint('west')
  const g = camp('campGallows')
  assert.ok(!near(sp, g.x, g.y, 400), 'spawned forward of the muster')
  assert.ok(nav.passableAt(sp[0], sp[1]))
  // the spawn point lies on the route, about 2400 px of path out
  let run = 0, k = -1
  for (let s = 1; s < cells.length; s++) {
    const [x0, y0] = r.xy(cells[s - 1]), [x1, y1] = r.xy(cells[s])
    run += Math.hypot(x1 - x0, y1 - y0)
    if (x1 === sp[0] && y1 === sp[1]) { k = s; break }
  }
  assert.ok(k > 0)
  assert.ok(Math.abs(d - run - SPAWN_CLAMP) < 48, `left ${d - run}`)
  // the west ford routes over Millford
  const mill = r.bp.FEATURES.crossings.findIndex(c => c.id === 'millford')
  assert.ok(cells.some(i => r.crossing[i] === mill))
})

test('after the Ferrow Muster burns, the south road musters at the Stairwarden', () => {
  const a = world({ burned: ['campFerrow'] })
  assert.equal(a.muster('south').id, 'campStairwarden')
  assert.equal(a.muster('south').kind, 'camp')
  const b = world({ burned: ['campFerrow', 'campStairwarden'] })
  assert.deepEqual([b.muster('south').id, b.muster('south').kind], ['mawStair', 'maw'])
})

test('the gorge closes for good when Irontooth burns', () => {
  assert.ok(world().live(8).includes('east'))
  const a = world({ burned: ['campIrontooth'] })
  assert.equal(a.muster('east'), null)
  assert.ok(!a.live(30).includes('east'))
  assert.deepEqual(a.spawnPoint('east').map(Number.isNaN), [true, true])
})

test('approaches open by wave or by claim; raids only while their camp is awake', () => {
  const a = world()
  assert.deepEqual(a.live(1), ['south'])
  assert.deepEqual(a.live(5), ['south', 'west'])
  assert.deepEqual(a.live(11), ['south', 'west', 'east', 'southeast'])
  assert.deepEqual(world({ claimed: ['hold', 'hollow'] }).live(1), ['south', 'west'])
  assert.deepEqual(world({ claimed: ['hold', 'ferrow'] }).live(2), ['south', 'southeast'])
  assert.deepEqual(world({ awake: ['campDiggers'] }).live(1), ['south', 'north'])
  // a burned raid camp never raids again; a chain raid moves to its next camp, which must be awake
  assert.deepEqual(world({ burned: ['campThornstake'], awake: [] }).live(1), ['south'])
  assert.deepEqual(world({ burned: ['campThornstake'], awake: ['campThornmother'] }).live(1), ['south', 'northwest'])
})

test('fronts per night, and the budget split', () => {
  assert.deepEqual([1, 4, 5, 9, 10, 19].map(frontsFor), [1, 1, 2, 2, 3, 3])
  assert.equal(frontsFor(20), Infinity)
  const a = world({ awake: ['campDiggers'] })
  const p1 = a.tonight(1)
  assert.deepEqual(p1.fronts, ['south'])
  assert.equal(p1.raid, 'north')
  const p12 = world().tonight(12)
  assert.equal(p12.fronts.length, 3)
  assert.equal(p12.fronts[0], 'south')
  assert.equal(world().tonight(25).fronts.length, 4)
  const s = splitBudget({ fronts: ['south', 'west'], raid: 'north' }, 40)
  assert.equal([...s.values()].reduce((x, y) => x + y, 0), 40)
  assert.equal(s.get('north'), 12)
  assert.ok(s.get('south') > s.get('west'))
  assert.equal(splitBudget({ fronts: [], raid: 'north' }, 10).get('north'), 10)
})

test('marchers take the tier of their muster region', () => {
  const a = world()
  assert.equal(a.tier('south'), REGION_BY_ID.get(camp('campFerrow').region).tier)
  assert.equal(typeof a.campKey('south'), 'string')
  const maw = world({ burned: ['campFerrow', 'campStairwarden'] })
  assert.equal(maw.campKey('south'), null)
})
