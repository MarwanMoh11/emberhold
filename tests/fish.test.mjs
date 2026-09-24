import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const W = await loadTs('src/config/world/index.ts')
const F = await loadTs('src/world/fish.ts')
const r = W.raster()

test('fish (S13): every field fills on water, each shoal worked from a reachable bank', () => {
  const fields = W.NODE_CLUSTERS.filter(c => c.type === 'fish')
  const fisheries = W.PADS.filter(p => p.key === 'fishery')
  assert.ok(fields.length >= 4 && fisheries.length >= 4)
  let s = 11
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647
  for (const c of fields) {
    const pad = fisheries.reduce((b, p) => (Math.hypot(p.x - c.x, p.y - c.y) < Math.hypot(b.x - c.x, b.y - c.y) ? p : b))
    const spots = F.placeFish(r, c, pad, rand)
    assert.equal(spots.length, c.count, `${c.region} field`)
    for (const f of spots) {
      assert.ok(F.fishable(r, r.cell(f.x, f.y)), `shoal ${f.x},${f.y} is on water`)
      assert.ok(r.passable(r.cell(f.gx, f.gy)), `bank ${f.gx},${f.gy} is land`)
      assert.ok(Math.hypot(f.gx - f.x, f.gy - f.y) <= F.FISH_BANK)
      assert.ok(Math.hypot(f.gx - pad.x, f.gy - pad.y) < 400, `bank ${f.gx},${f.gy} is by ${pad.id}`)
    }
  }
})
