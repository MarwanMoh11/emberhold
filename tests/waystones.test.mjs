import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { Waystones } = await loadTs('src/systems/Waystones.ts')
const { BuildingManager } = await loadTs('src/systems/BuildingManager.ts')

const noop = () => {}
const img = () => {
  const o = { height: 64, visible: true }
  for (const k of ['setOrigin', 'setDepth', 'setBlendMode', 'setAlpha', 'setScale', 'setPosition']) o[k] = () => o
  o.setVisible = v => { o.visible = v; return o }
  return o
}

/** A scene with the Downs outpost built, the hero at `at`, and `night` as given. */
function world({ at, night = false, soldiers = [] }) {
  const outDowns = { padId: 'outDowns', key: 'outpost', x: 5000, y: 1500, region: 'downs', level: 1, alive: true }
  const player = { x: at[0], y: at[1], hp: 100, alive: true, vx: 0, vy: 0, container: { setPosition: noop } }
  const events = []
  const scene = {
    add: { image: img },
    player,
    waves: { isNight: night },
    buildings: { outposts: () => [outDowns] },
    army: { soldiers },
    nav: { passableAt: () => true },
    fx: { ring: noop, popup: noop },
    audio: { play: noop },
    bus: { emit: (k, p) => events.push([k, p]) },
    cameras: { main: { centerOn: noop } },
    terrain: { prime: noop },
  }
  return { ws: new Waystones(scene), scene, player, events }
}

const soldier = (x, y) => ({ x, y, vx: 0, vy: 0, alive: true, target: {}, state: 'fight', pathTicket: {},
  follower: { clear: noop }, sprite: { setPosition() { return this }, setDepth() { return this } } })

test('touching an outpost stone lights it; the Hall Stone starts lit', () => {
  const { ws } = world({ at: [5044, 1508] })
  assert.deepEqual(ws.toJSON(), ['wsHall'])
  ws.update(0.033)
  assert.equal(ws.here, 'outDowns')
  assert.ok(ws.isActive('outDowns'))
  assert.equal(ws.list().find(s => s.id === 'wsIsle').active, false)
})

test('by day the hero and the army within 500 px travel; at night only the Hall Stone answers', () => {
  const near = soldier(5100, 1600), far = soldier(5000, 2400)
  const { ws, scene, player, events } = world({ at: [5044, 1508], soldiers: [near, far] })
  ws.update(0.033)
  ws.load(['outDowns', 'wsIsle'])
  assert.equal(ws.travel('wsIsle'), true)
  for (let i = 0; i < 40; i++) ws.update(0.033)
  assert.ok(Math.hypot(player.x - 8680, player.y - 1250) < 1, 'arrived at the Isle Stone')
  assert.ok(Math.hypot(near.x - player.x, near.y - player.y) < 120, 'the escort came along')
  assert.equal(far.y, 2400, 'a soldier out of range stays')
  assert.equal(events.at(-1)[0], 'waystone:travelled')

  // back to the outpost, then night falls
  player.x = 5044; player.y = 1508
  scene.waves.isNight = true
  ws.update(0.033)
  assert.equal(ws.canTravel('wsIsle').ok, false)
  assert.match(ws.canTravel('wsIsle').why, /Hall Stone/)
  assert.equal(ws.travel('wsIsle'), false)
  assert.equal(ws.travel('wsHall'), true)
})

test('a blow breaks the channel', () => {
  const { ws, player } = world({ at: [5044, 1508] })
  ws.update(0.033)
  assert.equal(ws.travel('wsHall'), true)
  ws.update(0.5)
  player.hp -= 10
  ws.update(0.033)
  assert.equal(ws.channel, null)
  assert.equal(ws.lastWhy, 'Interrupted')
  assert.ok(Math.hypot(player.x - 5044, player.y - 1508) < 1, 'still at the outpost')
})

test('dropoffFor sends a hauler to the outpost nearer by path, and home when it falls', () => {
  const m = Object.create(BuildingManager.prototype)
  const depot = { key: 'depot', x: 5120, y: 3330, level: 1, alive: true }
  const hall = { key: 'townHall', x: 5120, y: 3150, level: 1, alive: true }
  const out = { key: 'outpost', x: 5000, y: 1500, level: 1, alive: true }
  let detour = 1
  m.scene = { nav: { findPath: (ax, ay, bx, by) => [[ax, ay], [(ax + bx) / 2 + (bx === 5000 ? detour : 0), (ay + by) / 2], [bx, by]] } }
  m.byPad = new Map([['depot', depot], ['hall', hall]])
  m.dropSites = [depot, out]
  m.dropCache = new Map()
  m.dropSig = 'a'; m.dropCacheSig = ''
  assert.deepEqual(m.dropoffFor(4180, 1180), { x: 5000, y: 1514 })
  // the river between: the outpost is 3000 px round by path, the depot nearer
  m.dropSig = 'b'; detour = 3000
  assert.deepEqual(m.dropoffFor(4180, 1180), { x: 5120, y: 3344 })
  detour = 1; m.dropSig = 'c'
  out.alive = false
  assert.deepEqual(m.dropoffFor(4180, 1180), { x: 5120, y: 3344 })
})

