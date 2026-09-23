import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'
import { approachRoutes, lint, loadBlueprint, rasterise } from '../docs/world/tools/render.mjs'

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
