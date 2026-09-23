import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { FogMemory } = await loadTs('src/core/FogMemory.ts')
const { ZoneManager, FOG_SCALE } = await loadTs('src/systems/ZoneManager.ts')
const { Minimap } = await loadTs('src/ui/Minimap.ts')
const { WORLD } = await loadTs('src/config/world/index.ts')

test('explored cells round trip in a compact save field', () => {
  const map = new FogMemory(256, 256)
  map.mark(1, 1)
  map.mark(130, 200)
  map.mark(-1, 20)
  const encoded = map.toJSON()
  assert.equal(encoded.length, 5)
  assert.ok(encoded.length <= FogMemory.maxEncodedLength(256, 256))
  const loaded = new FogMemory(256, 256)
  loaded.load(encoded)
  const points = []
  loaded.forEachMarked((x, y) => points.push([x, y]))
  assert.deepEqual(points, [[32, 32], [160, 224]])
})

const NEW = { width: 10240, height: 9216 }
const OLD = { width: 3400, height: 2800 }
const marked = map => { const out = []; map.forEachMarked((x, y) => out.push(x, y)); return out }
function seeded(seed) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
}
/** About `share` of the cells explored in round blobs, the way walking reveals ground. */
function explore({ width, height }, share, seed = 7) {
  const rnd = seeded(seed)
  const map = new FogMemory(width, height)
  const cells = map.cols * map.rows
  const seen = new Set()
  while (seen.size < share * cells) {
    const cx = rnd() * width, cy = rnd() * height, r = 300 + rnd() * 900
    for (let y = Math.max(0, cy - r); y < Math.min(height, cy + r); y += 32) {
      for (let x = Math.max(0, cx - r); x < Math.min(width, cx + r); x += 32) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue
        map.mark(x, y)
        seen.add(Math.floor(y / 64) * map.cols + Math.floor(x / 64))
      }
    }
  }
  return map
}

test('the frontier fog is sized from the world and bounded by maxEncodedLength', () => {
  const map = new FogMemory(NEW.width, NEW.height)
  assert.equal(map.cols, 160)
  assert.equal(map.rows, 144)
  assert.equal(FogMemory.maxEncodedLength(NEW.width, NEW.height), 3842)
  assert.equal(FogMemory.maxEncodedLength(OLD.width, OLD.height), 398)
  assert.equal(map.toJSON().length <= 8, true) // nothing explored is one run
})

for (const [name, world] of [['old', OLD], ['new', NEW]]) {
  test(`${name} world: fog round trips at every level of exploration`, () => {
    const max = FogMemory.maxEncodedLength(world.width, world.height)
    const rnd = seeded(3)
    const noisy = new FogMemory(world.width, world.height)
    const full = new FogMemory(world.width, world.height)
    for (let y = 0; y < world.height; y += 64) {
      for (let x = 0; x < world.width; x += 64) {
        if (rnd() < 0.5) noisy.mark(x, y)
        full.mark(x, y)
      }
    }
    for (const map of [explore(world, 0.3), noisy, full, new FogMemory(world.width, world.height)]) {
      const encoded = map.toJSON()
      assert.ok(encoded.length <= max, `${encoded.length} > ${max}`)
      assert.deepEqual(marked(FogMemory.fromJSON(encoded, world.width, world.height)), marked(map))
    }
    // noise has no runs to speak of, so it falls back to the bitset
    assert.equal(noisy.toJSON().length, max)
    assert.ok(full.toJSON().length < 10)
  })
}

test('a 30%-explored frontier saves as runs, well under the bitset', () => {
  const encoded = explore(NEW, 0.3).toJSON()
  assert.match(encoded, /^r:/)
  assert.ok(encoded.length < FogMemory.maxEncodedLength(NEW.width, NEW.height) / 3, `${encoded.length}`)
})

test('the v1 bitset still loads while the old map is live', () => {
  const map = explore(OLD, 0.3)
  let raw = ''
  for (const b of map['bits']) raw += String.fromCharCode(b)
  const legacy = btoa(raw)
  assert.equal(legacy.length, 396)
  assert.deepEqual(marked(FogMemory.fromJSON(legacy, OLD.width, OLD.height)), marked(map))
})

test('foreign or damaged fog strings load nothing', () => {
  const small = explore(OLD, 0.3).toJSON()
  const big = explore(NEW, 0.3).toJSON()
  for (const bad of [small, 'r:A', 'r:' + big.slice(2, -1), big + 'B', 'r:!!', 'b:AAAA', 'not base64 at all', '', null]) {
    assert.deepEqual(marked(FogMemory.fromJSON(bad, NEW.width, NEW.height)), [], String(bad).slice(0, 12))
  }
})

test('loading exploration restores the fog brush marks', () => {
  const makeZones = () => {
    const marks = []
    const zones = Object.create(ZoneManager.prototype)
    zones.explored = new FogMemory(WORLD.width, WORLD.height)
    zones.fog = { erase(_brush, x, y) { marks.push([x, y]) } }
    zones.brush = {}
    return { zones, marks }
  }
  const first = makeZones()
  first.zones.revealArea(1200, 800, 0)
  const second = makeZones()
  second.zones.loadFog(first.zones.fogJSON())
  assert.equal(second.marks.length, 1)
  assert.ok(Math.abs(second.marks[0][0] * FOG_SCALE - 1200) < 64)
  assert.ok(Math.abs(second.marks[0][1] * FOG_SCALE - 800) < 64)
  second.zones.loadFog('corrupt')
  assert.equal(second.marks.length, 2) // the remembered mark survives bad data
})

test('the minimap rebuilds travel outside the hold from saved world fog', () => {
  const saved = new FogMemory(WORLD.width, WORLD.height)
  saved.mark(3100, 2400)
  const restored = new FogMemory(WORLD.width, WORLD.height)
  restored.load(saved.toJSON())

  const minimap = Object.create(Minimap.prototype)
  minimap.explored = new Uint8Array(34 * 28)
  minimap.coldDirty = false
  minimap.game = {
    zones: { forEachExplored: fn => restored.forEachMarked(fn) },
  }
  minimap.restoreWorldExploration()
  assert.equal(minimap.exploredAt(3100, 2400), true)
  assert.equal(minimap.exploredAt(100, 100), false)
  assert.equal(minimap.coldDirty, true)
})
