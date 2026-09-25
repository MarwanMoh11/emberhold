import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const W = await loadTs('src/config/world/index.ts')
const BP = await loadTs('src/config/world/blueprint.ts')
const { ENEMIES } = await loadTs('src/config/enemies.ts')

const regionIds = new Set(BP.REGIONS.map(r => r.id))

test('the world is the blueprint size', () => {
  assert.equal(W.WORLD.width, BP.WORLD2.width)
  assert.equal(W.WORLD.height, BP.WORLD2.height)
  assert.equal(W.raster().W, BP.WORLD2.width)
  assert.equal(W.raster(), W.raster(), 'the raster is memoised')
})

test('counts match the blueprint', () => {
  assert.equal(W.REGIONS.length, BP.REGIONS.length)
  assert.equal(W.PADS.length, BP.PADS.length, 'every pad is a building since S13')
  assert.equal(W.FUTURE_PADS, undefined)
  assert.equal(W.CAMPS.length, BP.CAMPS.length)
  assert.equal(W.NODE_CLUSTERS.length, BP.NODES.length) // fish fields joined in S13
  assert.equal(W.WALL_LINES.length, BP.WALLS.length)
  assert.ok(W.WALL_LINES.every(l => l.active), 'S10 lays every line')
  W.REGIONS.forEach((r, i) => assert.equal(r.index, i))
})

test('outposts are pads (S11): exactly one in every region but the hold', () => {
  const outs = W.PADS.filter(p => p.key === 'outpost')
  for (const r of W.REGIONS) {
    assert.equal(outs.filter(p => p.region === r.id).length, r.id === 'hold' ? 0 : 1, r.id)
  }
  assert.ok(W.POIS.some(p => p.id === 'wsHall' && p.kind === 'waystone'))
  assert.ok(W.POIS.some(p => p.id === 'wsIsle' && p.kind === 'waystone'))
})

test('every pad, camp and cluster names a region', () => {
  for (const p of W.PADS) assert.ok(regionIds.has(p.region), `pad ${p.id}: ${p.region}`)
  for (const c of W.CAMPS) assert.ok(regionIds.has(c.region), `camp ${c.id}: ${c.region}`)
  for (const n of W.NODE_CLUSTERS) assert.ok(regionIds.has(n.region), `field at ${n.x},${n.y}: ${n.region}`)
})

test('the hall pad sits at HALL, pre-built', () => {
  const hall = W.PADS.find(p => p.id === 'hall')
  assert.ok(hall)
  assert.deepEqual({ x: hall.x, y: hall.y }, W.HALL)
  assert.equal(hall.key, 'townHall')
  assert.equal(hall.startLevel, 1)
  assert.equal(W.raster().regionAt(W.HALL.x, W.HALL.y), 'hold')
})

test('ids the game hardcodes still resolve', () => {
  for (const id of ['hall', 'depot', 'lumber1']) assert.ok(W.PADS.some(p => p.id === id), id)
  assert.ok(W.CAMPS.some(c => c.id === 'campAshgate'))
})

test('camp spawn keys resolve to enemies the game has', () => {
  for (const c of W.CAMPS) assert.ok(ENEMIES[c.spawns.key], `${c.id}: ${c.spawns.key}`)
  // S16: the four walkers march from their own camps, not stand-ins
  const own = Object.fromEntries(W.CAMPS.map(c => [c.id, c.spawns.key]))
  assert.deepEqual(
    [own.campDrowned, own.campThornmother, own.campStairwarden, own.campForges],
    ['bogWretch', 'thornling', 'ashPriest', 'cinderHound'],
  )
})

test('camps carry their tier, leash and radii (S10)', () => {
  for (const c of W.CAMPS) {
    const bp = BP.CAMPS.find(b => b.id === c.id)
    assert.equal(c.tier, bp.tier)
    assert.equal(c.boss, bp.boss)
    assert.deepEqual([c.leash, c.wakeRadius, c.siegeRadius], [700, 900, 600])
  }
  assert.deepEqual(W.CAMPS.filter(c => c.tier === 'fortress').map(c => c.id), ['campAshgate'])
  assert.equal(W.CAMPS.filter(c => c.tier === 'stronghold' && c.boss).length, 4, 'four stronghold bosses; the Slag Forges have none')
})

test('the palisade rings the hall with four gates', () => {
  const pal = W.WALL_LINES.find(l => l.id === 'palisade')
  const xs = pal.pts.map(p => p[0]), ys = pal.pts.map(p => p[1])
  assert.ok(pal.ring && Math.min(...xs) < W.HALL.x && W.HALL.x < Math.max(...xs) && Math.min(...ys) < W.HALL.y && W.HALL.y < Math.max(...ys))
  assert.equal(pal.gates.length, 4)
})

test('the temporary night gates are gone (S09 approaches replace them)', () => {
  assert.equal(W.SPAWN_GATES, undefined)
  assert.equal(W.GATE_BY_ID, undefined)
  // every approach's chain resolves to camps and maws the world has
  const ids = new Set([...W.CAMPS.map(c => c.id), ...W.MAWS.map(m => m.id)])
  for (const a of W.APPROACHES) for (const m of a.chain) assert.ok(ids.has(m), `${a.id}: ${m}`)
})
