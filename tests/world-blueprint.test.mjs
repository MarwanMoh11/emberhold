import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'
import { approachRoutes, freeSpots, lint, loadBlueprint, rasterise } from '../docs/world/tools/render.mjs'

const { bp } = await loadBlueprint()
const { ENEMIES } = await loadTs('src/config/enemies.ts')
const r = rasterise(bp)
const issues = lint(bp, r)
const routes = approachRoutes(bp, r)

test('the world blueprint lints clean', () => {
  const errors = issues.filter(i => i.level === 'E').map(i => `${i.what}: ${i.msg}`)
  assert.deepEqual(errors, [])
})

test('the raster covers the world at navCell resolution', () => {
  assert.equal(r.GW, Math.ceil(bp.WORLD2.width / bp.WORLD2.navCell))
  assert.equal(r.GH, Math.ceil(bp.WORLD2.height / bp.WORLD2.navCell))
  for (const k of ['terrain', 'under', 'crossing', 'region', 'road']) assert.equal(r[k].length, r.N, k)
})

test('every road vertex lies on a road cell', () => {
  for (const rd of bp.ROADS) for (const [x, y] of rd.pts) {
    const c = r.cell(Math.min(x, r.W - 1), Math.min(y, r.H - 1))
    assert.equal(r.road[c], 1, `${rd.id} at (${x},${y})`)
  }
})

test('every night route reaches the hall', () => {
  assert.ok(routes.length > 0)
  for (const rt of routes) {
    assert.equal(rt.error, undefined, `${rt.approach}#${rt.k} ${rt.id}: ${rt.error}`)
    assert.ok(rt.cells.length > 1, `${rt.approach}#${rt.k} ${rt.id} has no cells`)
  }
})

test("every approach's first route passes its via crossings in order", () => {
  for (const a of bp.APPROACHES) {
    if (!a.via?.length) continue
    const first = routes.find(rt => rt.approach === a.id && rt.k === 0)
    assert.ok(first, `${a.id} has no first route`)
    let at = -1
    for (const v of a.via) {
      const k = first.crossings.indexOf(v, at + 1)
      assert.ok(k > at, `${a.id} does not pass ${v} (passes ${first.crossings.join(', ') || 'nothing'})`)
      at = k
    }
  }
})

test('every camp spawns an EnemyKey or a name[EnemyKey] placeholder', () => {
  const keys = new Set(Object.keys(ENEMIES))
  for (const c of bp.CAMPS) {
    const key = c.spawns.key
    const m = /^([A-Za-z]+)\[([A-Za-z]+)\]$/.exec(key)
    assert.ok(keys.has(key) || (m && keys.has(m[2])), `${c.id} spawns '${key}'`)
  }
})

test('--free (S13c): every spot it offers, added as a pad, keeps the lint at 0 errors and 0 warnings', () => {
  let b = bp
  const add = (key, near, n) => {
    const f = freeSpots(b, r, 'downs', { key, near, n })
    assert.equal(f.spots.length, n, `${key}: ${f.spots.length} spots`)
    b = { ...b, PADS: [...b.PADS, ...f.spots.map((s, i) => ({ id: `free${key}${i}`, key, x: s.x, y: s.y, region: 'downs', hall: 1 }))] }
  }
  add('cottage', undefined, 10)
  add('farm', [4700, 1500], 5)
  add('watchPost', [5000, 1000], 3)
  add('lumberCamp', [4000, 950], 2)
  const bad = lint(b, r).map(i => `${i.level} ${i.what}: ${i.msg}`)
  assert.deepEqual(bad, [])
})

// 05 §A settled country: pads per region by the endgame (S13c).
const PAD_TARGETS = {
  hold: 34, downs: 16, whisperwood: 12, hollow: 16, greyfall: 12, ferrow: 18, frostmere: 15, saltmere: 16, irontooth: 14,
  barrowmoor: 12, kettle: 12, deepwood: 10, deepvein: 12, rim: 10, ashgate: 12, crown: 8, cinderfall: 9,
}

test('a settled country (S13c): about 238 pads, every region within 2 of its target', () => {
  assert.ok(Math.abs(bp.PADS.length - 238) <= 23.8, `${bp.PADS.length} pads`)
  for (const [id, want] of Object.entries(PAD_TARGETS)) {
    const got = bp.PADS.filter(p => p.region === id).length
    assert.ok(Math.abs(got - want) <= 2, `${id}: ${got} pads, target ${want}`)
  }
})

test('a settled country (S13c): a village of 6+ pads within 600 px of every claim stone', () => {
  // Ashgate's and Cinderfall's stones stand at pass mouths whose maws leave no room;
  // their villages stand round Ashfall and Slagwatch, the outposts.
  const at = { ashgate: 'outAsh', cinderfall: 'outSlag' }
  for (const g of bp.REGIONS) {
    if (g.id === 'hold') continue
    const c = at[g.id] ? bp.PADS.find(p => p.id === at[g.id]) : g.claim
    const n = bp.PADS.filter(p => p.region === g.id && Math.hypot(p.x - c.x, p.y - c.y) <= 600).length
    assert.ok(n >= 6, `${g.id}: ${n} pads within 600 px`)
  }
})
