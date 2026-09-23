import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const S = await loadTs('src/world/scatter.ts')
const W = await loadTs('src/config/world/index.ts')
const { T, segProj } = await loadTs('src/world/raster.ts')
const spots = S.scatterProps()
const r = W.raster()
const C = S.PROP_CLEAR

test('scatter stays inside the budget and is the same every time', () => {
  assert.ok(spots.length > 600 && spots.length <= S.PROP_BUDGET, `${spots.length} props`)
  assert.equal(S.scatterProps(), spots, 'memoised')
})

test('props keep off pads, fields, camps, roads, crossings and blocked ground', () => {
  const pads = [...W.PADS, ...W.FUTURE_PADS]
  for (const s of spots) {
    const i = r.cell(s.x, s.y)
    assert.equal(r.terrain[i], T.LAND)
    assert.equal(r.road[i], 0)
    assert.equal(r.crossing[i], -1)
    for (const p of pads) assert.ok(Math.hypot(p.x - s.x, p.y - s.y) >= C.pad, `${s.key} at ${s.x},${s.y} is by pad ${p.id}`)
    for (const n of W.NODE_CLUSTERS) assert.ok(Math.hypot(n.x - s.x, n.y - s.y) >= n.radius + C.node)
    for (const c of W.CAMPS) assert.ok(Math.hypot(c.x - s.x, c.y - s.y) >= C.camp)
    for (const c of W.CROSSINGS) assert.ok(segProj(s.x, s.y, c.a[0], c.a[1], c.b[0], c.b[1]).d >= c.width / 2 + C.crossing)
  }
})

test('each region reads at a glance: the card\'s props stand in their biomes', () => {
  const by = new Map()
  for (const s of spots) {
    const b = W.REGIONS[r.region[r.cell(s.x, s.y)]].biome
    by.set(b, (by.get(b) ?? new Set()).add(s.key))
  }
  assert.ok(by.get('highland').has('sc_pineSnow') && by.get('highland').has('sc_pine'))
  assert.ok(by.get('marsh').has('sc_reeds'))
  assert.ok(by.get('moor').has('sc_deadTree'))
  assert.ok(by.get('ash').has('sc_bones') && by.get('ash').has('sc_standard'))
  assert.ok(by.get('farmland').has('sc_fence'))
})
