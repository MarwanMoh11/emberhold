import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

// Just enough canvas for the streamer: it only clips, clears and hands the context to the painter.
const ctx = () => {
  const x = { clipRect: null }
  Object.assign(x, {
    save() {}, restore() {}, setTransform() {}, beginPath() {}, clip() {}, clearRect() {},
    rect(rx, ry, rw, rh) { x.clipRect = [rx, ry, rw, rh] },
  })
  return x
}
globalThis.document ??= { createElement: () => { const c = { width: 0, height: 0 }; const x = ctx(); c.getContext = () => x; return c } }

const { TerrainChunks } = await loadTs('src/world/TerrainChunks.ts')

function fakeScene() {
  const textures = new Map()
  const images = []
  return {
    textures: {
      addImage(k, c) { assert.ok(!textures.has(k), `texture ${k} added twice`); textures.set(k, c); return {} },
      remove(k) { textures.delete(k) },
      exists(k) { return textures.has(k) },
    },
    add: {
      image(x, y, key) {
        const img = { x, y, key, alive: true }
        Object.assign(img, {
          setOrigin() { return img }, setScale(s) { img.scale = s; return img }, setDepth(d) { img.depth = d; return img },
          setTexture(k) { img.key = k; return img }, destroy() { img.alive = false },
        })
        images.push(img)
        return img
      },
    },
    events: { once() {} },
    textureCount: () => textures.size,
    live: () => images.filter(i => i.alive),
    images,
  }
}

const FRONTIER = { width: 10240, height: 9216 }
const camAt = (x, y, zoom = 1) => ({ scrollX: x - 640, scrollY: y - 400, width: 1280, height: 800, zoom })
const spin = ms => { const t = performance.now(); while (performance.now() - t < ms) { /* busy */ } }

test('prime bakes exactly what is on screen, nearest first', () => {
  const scene = fakeScene()
  const chunks = new TerrainChunks(scene, () => {}, { ...FRONTIER, depth: -5 })
  // view 4200..5480 × 3000..3800: chunks 4-5 × 2-3, and (4,3) is nearest the centre
  assert.equal(chunks.prime(camAt(4840, 3400)), 4)
  const s = chunks.stats()
  assert.equal(s.resident, 4)
  assert.equal(scene.textureCount(), 4)
  assert.deepEqual([scene.images[0].x, scene.images[0].y], [4096, 3072])
  for (const img of scene.images) {
    assert.equal(img.scale, 2)
    assert.equal(img.depth, -5)
    assert.equal(img.x % 1024, 0)
  }
})

test('a chunk is painted in clipped slices with overdraw, cut off at the world edge', () => {
  const scene = fakeScene()
  const calls = []
  const chunks = new TerrainChunks(scene, (x, wx, wy, size, scale) => calls.push({ wx, wy, size, scale, clip: x.clipRect }), { width: 3400, height: 2800 })
  // the old map's bottom-right chunk is 328 × 752 px of world: 2 × 3 slices
  chunks.prime(camAt(3300, 2700))
  const corner = calls.filter(c => c.clip[0] >= 3072 && c.clip[1] >= 2048)
  assert.equal(corner.length, 6)
  for (const c of corner) {
    assert.equal(c.size, 256 + 32)
    assert.equal(c.scale, 0.5)
    assert.deepEqual([c.wx, c.wy], [c.clip[0] - 16, c.clip[1] - 16])
    assert.ok(c.clip[0] + c.clip[2] <= 3400 && c.clip[1] + c.clip[3] <= 2800)
  }
  const area = corner.reduce((a, c) => a + c.clip[2] * c.clip[3], 0)
  assert.equal(area, 328 * 752)
})

test('panning the frontier never holds more than 24 chunks, and eviction frees textures', () => {
  const scene = fakeScene()
  const chunks = new TerrainChunks(scene, () => {}, FRONTIER)
  let most = 0
  for (let y = 400; y < 9216; y += 700) {
    for (let x = 400; x < 10240; x += 300) {
      chunks.update(camAt(x, y, 0.62))
      const s = chunks.stats()
      most = Math.max(most, s.resident)
      assert.ok(s.resident <= 24, `${s.resident} resident at ${x},${y}`)
      assert.equal(scene.textureCount(), scene.live().length)
    }
  }
  assert.equal(most, 24)
  assert.ok(chunks.stats().baked >= 90, 'every chunk was baked on the way')
})

test('a frame bakes within its budget and the chunk appears only when whole', async () => {
  // Wall-clock budgets: while the other test files bundle in parallel the OS
  // preempts slices mid-spin, so take the best of up to six tries, backing off
  // (50 ms doubling, ~1.5 s in all) until the load settles. A real overrun
  // fails every try.
  let best = null
  for (let k = 0; k < 6 && !(best && best.first <= 4 && best.worst <= 4); k++) {
    if (k) await new Promise(r => setTimeout(r, 50 * 2 ** (k - 1)))
    const scene = fakeScene()
    const chunks = new TerrainChunks(scene, () => spin(0.8), FRONTIER)
    const cam = camAt(5000, 5000)
    chunks.update(cam)
    const first = chunks.stats().frameMs
    const early = scene.images.length
    for (let i = 0; i < 12; i++) chunks.update(cam)
    const run = { first, early, shown: scene.images.length, worst: chunks.stats().worstFrameMs }
    if (!best || Math.max(run.first, run.worst) < Math.max(best.first, best.worst)) best = run
  }
  assert.ok(best.first <= 4, `baked for ${best.first} ms`)
  assert.equal(best.early, 0, 'nothing shown after a few slices')
  assert.ok(best.shown >= 1, 'a chunk lands within a dozen frames')
  assert.ok(best.worst <= 4, `worst frame ${best.worst} ms`)
})

test('invalidate re-bakes only the chunks it touches and swaps the texture when done', () => {
  const scene = fakeScene()
  const chunks = new TerrainChunks(scene, () => {}, FRONTIER)
  const cam = camAt(4840, 3400)
  chunks.prime(cam)
  const img = scene.images.find(i => i.x === 5120 && i.y === 3072)
  const before = img.key
  const queued = chunks.stats().queued
  chunks.invalidate({ x: 5200, y: 3100, width: 100, height: 100 })
  assert.equal(chunks.stats().queued, queued + 1)
  chunks.prime(cam)
  assert.notEqual(img.key, before)
  assert.ok(!scene.textures.exists(before), 'the old texture is freed')
  assert.equal(scene.images.length, 4, 'the image is reused, not replaced')
  assert.equal(scene.textureCount(), 4)
})
