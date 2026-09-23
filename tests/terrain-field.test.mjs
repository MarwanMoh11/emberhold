import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const TF = await loadTs('src/world/terrainField.ts')
const { T } = await loadTs('src/world/raster.ts')
const F = TF.terrainFields()
const r = F.r
const BP = r.bp

/** Cells whose whole 3×3 neighbourhood has the same `under` class. */
function interior(pred) {
  const out = []
  for (let gy = 1; gy < r.GH - 1; gy++) for (let gx = 1; gx < r.GW - 1; gx++) {
    let all = true
    for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1; dx++) if (!pred(r.under[(gy + dy) * r.GW + gx + dx])) { all = false; break }
    if (all) out.push(gy * r.GW + gx)
  }
  return out
}

test('signed distances agree with the raster the NavGrid reads', () => {
  const wet = t => t === T.SEA || t === T.WATER
  for (const [field, pred] of [[F.wet, wet], [F.cliff, t => t === T.CLIFF], [F.lava, t => t === T.LAVA]]) {
    const inside = interior(pred), outside = interior(t => !pred(t))
    assert.ok(inside.length > 100)
    for (const i of inside) assert.ok(field[i] < 0, `cell ${i} is inside but reads ${field[i]}`)
    for (const i of outside) assert.ok(field[i] > 0, `cell ${i} is outside but reads ${field[i]}`)
  }
})

test('every shore is traced, the isle as a loop of its own', () => {
  assert.ok(F.contours.wet.length > 20 && F.contours.cliff.length > 10 && F.contours.lava.length > 10)
  const isle = BP.FEATURES.lakes[0].isle
  const near = F.contours.wet.flatMap(c => {
    const out = []
    for (let k = 0; k < c.pts.length; k += 2) out.push(Math.hypot(c.pts[k] - isle.cx, c.pts[k + 1] - isle.cy))
    return out
  }).filter(d => d < isle.r + 80)
  assert.ok(near.length > 20, 'the isle has a shore')
  for (const d of near) assert.ok(Math.abs(d - isle.r) < 48, `isle shore point ${d.toFixed(0)} px from the centre`)
  // cliff runs are split into crest (-1) and foot (1)
  assert.deepEqual([...new Set(F.contours.cliff.map(c => c.side))].sort(), [-1, 1])
})

test('cliffS runs from the crest to the foot, downhill to the south (the Slagwall to the east)', () => {
  for (const cl of BP.FEATURES.cliffs) {
    const [ax, ay] = cl.pts[1], [bx, by] = cl.pts[2]
    const mx = (ax + bx) / 2, my = (ay + by) / 2
    const [nx, ny] = TF.downhill(ax, ay, bx, by)
    if (cl.id === 'slagwall') assert.ok(nx > 0.9)
    else assert.ok(ny > 0.5)
    const half = cl.thickness / 2
    assert.ok(Math.abs(TF.sample(F, F.cliffS, mx, my)) < 0.3, `${cl.id} centre`)
    assert.ok(TF.sample(F, F.cliffS, mx + nx * half * 0.8, my + ny * half * 0.8) > 0.5, `${cl.id} foot`)
    assert.ok(TF.sample(F, F.cliffS, mx - nx * half * 0.8, my - ny * half * 0.8) < -0.5, `${cl.id} crest`)
  }
})

test('the sea flag is 1 offshore and 0 inland', () => {
  assert.ok(TF.sample(F, F.sea, 100, 4000) > 0.95)
  assert.ok(TF.sample(F, F.sea, 5120, 4608) < 0.01)
})
