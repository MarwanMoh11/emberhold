import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { FogMemory } = await loadTs('src/core/FogMemory.ts')
const { ZoneManager } = await loadTs('src/systems/ZoneManager.ts')
const { Minimap } = await loadTs('src/ui/Minimap.ts')
const { WORLD } = await loadTs('src/config/balance.ts')

test('explored cells round trip in a compact save field', () => {
  const map = new FogMemory(256, 256)
  map.mark(1, 1)
  map.mark(130, 200)
  map.mark(-1, 20)
  const encoded = map.toJSON()
  assert.equal(encoded.length, 4)
  const loaded = new FogMemory(256, 256)
  loaded.load(encoded)
  const points = []
  loaded.forEachMarked((x, y) => points.push([x, y]))
  assert.deepEqual(points, [[32, 32], [160, 224]])
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
  assert.ok(Math.abs(second.marks[0][0] * 4 - 1200) < 64)
  assert.ok(Math.abs(second.marks[0][1] * 4 - 800) < 64)
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
