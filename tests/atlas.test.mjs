import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { AtlasView, ChartMemory, pickStone, travelOrder, windowCrop } = await loadTs('src/ui/chart.ts')
const { atlasBlocks, ATLAS_W, ATLAS_H } = await loadTs('src/world/AtlasBake.ts')

const W = 10240, H = 9216

test('the atlas bakes the world at 1/16 in 90 blocks, and a claim re-bakes only the blocks under its box', () => {
  assert.deepEqual([ATLAS_W, ATLAS_H], [640, 576])
  assert.equal(atlasBlocks().length, 90)
  const some = atlasBlocks({ x: 4000, y: 2200, width: 2600, height: 2200 })
  assert.equal(some.length, 12) // 4 columns (3072..6144) × 3 rows (2048..4096)
  assert.ok(some.every(([x, y]) => x + 1024 > 4000 && x < 6600 && y + 1024 > 2200 && y < 4400))
})

test('pinch and wheel zoom keep the world point under the fingers, and the world never drifts off', () => {
  const v = new AtlasView(W, H)
  v.resize(0, 50, 800, 500, true)
  assert.equal(v.z, v.zMin)
  // fitted: the whole world shows, centred on the short axis
  const [x0, y0] = v.toScreen(0, 0), [x1, y1] = v.toScreen(W, H)
  assert.ok(x0 >= -1e-6 && x1 <= 800 + 1e-6 && Math.abs(y0 - 50) < 1e-6 && Math.abs(y1 - 550) < 1e-6)

  const before = v.toWorld(300, 200)
  v.zoomAt(300, 200, 3)
  const after = v.toWorld(300, 200)
  assert.ok(Math.abs(before[0] - after[0]) < 1e-6 && Math.abs(before[1] - after[1]) < 1e-6)

  v.pan(1e6, 1e6) // dragged far past the corner: the world's top-left stays at the viewport's
  assert.deepEqual(v.toScreen(0, 0).map(Math.round), [0, 50])
  v.zoomAt(0, 0, 1e-6)
  assert.equal(v.z, v.zMin)
})

test('a tap picks the nearest stone within reach; a controller cycles lit stones, the Hall first', () => {
  const v = new AtlasView(W, H)
  v.resize(0, 0, 1024, 921.6, true)
  const stones = [
    { id: 'wsHall', x: 5120, y: 3000, active: true },
    { id: 'outA', x: 5200, y: 1500, active: true },
    { id: 'outB', x: 3000, y: 5000, active: false },
    { id: 'outC', x: 6000, y: 3100, active: true },
  ]
  const [sx, sy] = v.toScreen(5200, 1500)
  assert.equal(pickStone(stones, v, sx + 5, sy - 5)?.id, 'outA')
  assert.equal(pickStone(stones, v, sx + 60, sy), null)
  const here = stones[1]
  assert.deepEqual(travelOrder(stones, here, 'wsHall').map(s => s.id), ['wsHall', 'outC'])
  assert.deepEqual(travelOrder(stones, null, 'wsHall'), [])
})

test('the minimap window crops the textures to the world, and the seen grid marks what was walked', () => {
  const c = windowCrop(-800, 1000, 4800, 16, 640, 576)
  assert.deepEqual([c.x, c.y, c.w, c.h, c.dx, c.dy], [0, 62.5, 250, 300, 800, 0])
  const m = new ChartMemory(W, H)
  assert.equal(m.seenAt(5120, 3000), false)
  m.reveal(5120, 3000)
  assert.ok(m.seenAt(5120, 3000) && m.seenAt(5120 + 400, 3000) && !m.seenAt(5120 + 900, 3000))
  const square = [[0, 0], [2048, 0], [2048, 2048], [0, 2048]]
  assert.equal(m.anySeenIn(square), false)
  m.revealPoly(square)
  assert.ok(m.anySeenIn(square) && m.seenAt(1000, 1000))
})
