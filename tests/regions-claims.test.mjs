import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { RegionManager } = await loadTs('src/systems/RegionManager.ts')
const { CampManager, CampRec, WAKE_RADIUS, BRAZIERS } = await loadTs('src/systems/CampManager.ts')
const { REGIONS, REGION_BY_ID, CAMPS, raster } = await loadTs('src/config/world/index.ts')

const nop = () => {}
const stub = { clear: nop, setVisible: nop, setTexture: nop }

/** A RegionManager without Phaser: rules, flags and the mask, over a scene made of plain objects. */
function regions({ hall = 1, burned = [], afford = true } = {}) {
  const invalidated = []
  const scene = {
    buildings: { townHallLevel: hall, recomputeBonuses: nop },
    camps: { isBurned: id => burned.includes(id) },
    res: { canAfford: () => afford },
    terrain: { invalidate: r => invalidated.push(r) },
  }
  const m = Object.create(RegionManager.prototype)
  Object.assign(m, { scene, owned: new Uint8Array(REGIONS.length), mask: null, claimedCount: 1, lastClaimMs: 0 })
  m.owned[REGION_BY_ID.get('hold').index] = 1
  m.views = new Map(REGIONS.map(r => [r.id, { spec: r, cx: r.claim.x, cy: r.claim.y, stone: null, marker: stub, banner: stub, dwell: 0 }]))
  return { m, scene, invalidated }
}

test('canClaim names the first rule in the way: hall, adjacency, camps, then cost', () => {
  const { m, scene } = regions()
  assert.deepEqual(m.canClaim('ferrow'), { ok: false, reason: 'hall', why: 'Needs a Timber Hall' })
  assert.equal(m.canClaim('downs').ok, true)
  scene.buildings.townHallLevel = 3
  assert.deepEqual(m.canClaim('frostmere'), { ok: false, reason: 'adjacent', why: 'Claim The Barrow Downs first' })
  scene.res.canAfford = () => false
  assert.deepEqual(m.canClaim('ferrow'), { ok: false, reason: 'cost', why: 'Not enough yet' })
  assert.equal(m.canClaim('hold').ok, false) // already claimed
})

test('the Blackened Rim waits on the Ferrow Muster', () => {
  const burned = []
  const { m } = regions({ hall: 4, burned })
  m.claim('ferrow', true)
  assert.deepEqual(m.canClaim('rim'), { ok: false, reason: 'camps', why: 'Burn the Ferrow Muster first' })
  burned.push('campFerrow')
  assert.equal(m.canClaim('rim').ok, true)
})

test('a claim sets the flag, rebuilds the mask and repaints the region box', () => {
  const { m, invalidated } = regions({ hall: 2 })
  const r = raster()
  const i = r.cell(4650, 4650) // farm5, in the Ferrow Fields
  assert.equal(m.claimedAt(4650, 4650), false)
  assert.equal(m.claimMask()[i], 0)
  assert.equal(m.claimMask()[r.cell(5120, 3150)], 1) // the hall
  m.claim('ferrow', true)
  assert.equal(m.claimed('ferrow'), true)
  assert.equal(m.claimedAt(4650, 4650), true)
  assert.equal(m.claimMask()[i], 1)
  assert.equal(m.claimedCount, 2)
  assert.equal(invalidated.length, 1)
  const box = invalidated[0]
  for (const [x, y] of REGION_BY_ID.get('ferrow').poly) {
    assert.ok(x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height)
  }
  const cells = m.claimMask().reduce((n, v) => n + v, 0)
  const expected = r.region.reduce((n, k) => n + (k === REGION_BY_ID.get('hold').index || k === REGION_BY_ID.get('ferrow').index ? 1 : 0), 0)
  assert.equal(cells, expected)
})

test('claimed regions survive toJSON and load', () => {
  const a = regions({ hall: 5 })
  a.m.claim('downs', true)
  a.m.claim('ferrow', true)
  const saved = a.m.toJSON()
  assert.deepEqual(saved, ['hold', 'downs', 'ferrow'])
  const b = regions()
  b.m.load(saved)
  assert.deepEqual(b.m.toJSON(), saved)
  assert.equal(b.m.claimedCount, 3)
})

/** A CampManager whose camps are records only: no sprites, enemies as plain objects. */
function camps({ hero = [0, 0], claimed = ['hold'] } = {}) {
  const events = []
  const spawned = []
  const scene = {
    player: { x: hero[0], y: hero[1], alive: true },
    regions: { claimed: id => claimed.includes(id) },
    bus: { emit: (k, p) => events.push([k, p.id]) },
    fx: { popup: nop }, audio: { play: nop },
    enemies: {
      walkerCount: 0,
      spawn: (key, x, y, _hp, _dmg, def) => {
        const e = { key, x, y, def, active: true, alive: true, hp: 1, maxHp: 1, sprite: { setScale: nop } }
        spawned.push(e)
        return e
      },
    },
    waves: { wave: 0 },
  }
  const label = { setVisible: nop, setText: nop }
  const c = Object.create(CampManager.prototype)
  Object.assign(c, { scene, destroyedCount: 0, guardsDown: new Set(), camps: CAMPS.map(spec => new CampRec(spec, label, null)) })
  return { c, scene, events, spawned }
}

test('camps sleep until their region is claimed or the hero comes within the wake radius', () => {
  const ferrow = CAMPS.find(k => k.id === 'campFerrow')
  const { c, scene, events, spawned } = camps({ hero: [ferrow.x, ferrow.y - WAKE_RADIUS - 40] })
  for (let i = 0; i < 20; i++) c.update(1)
  assert.ok(c.camps.every(k => k.state === 'asleep'))
  assert.equal(spawned.length, 0) // asleep: no camp to hit, no patrols
  scene.player.y = ferrow.y - WAKE_RADIUS + 40
  c.update(0.1)
  assert.deepEqual(c.awakeJSON(), ['campFerrow'])
  assert.deepEqual(events, [['camp:woke', 'campFerrow']])
  assert.equal(spawned[0].key, 'camp')
  scene.player.y = 0 // walking away does not put it back to sleep
  for (let i = 0; i < 10; i++) c.update(1)
  assert.equal(c.camps.find(k => k.spec.id === 'campFerrow').state, 'awake')
  assert.ok(spawned.length > 1) // it sends patrols now
  scene.regions.claimed = id => id === 'downs' || id === 'hold'
  c.update(0.1)
  assert.deepEqual(c.awakeJSON().sort(), ['campDiggers', 'campFerrow'])
})

test('burned and awake camps survive a save and load; sleepers stay asleep', () => {
  const a = camps()
  a.c.wake('campRotwood')
  a.c.camps.find(k => k.spec.id === 'campScarp').state = 'burned'
  const b = camps()
  b.c.load(a.c.toJSON(), a.c.awakeJSON())
  assert.deepEqual(b.c.toJSON(), ['campScarp'])
  assert.deepEqual(b.c.awakeJSON(), ['campRotwood'])
  assert.equal(b.c.isBurned('campScarp'), true)
  assert.equal(b.c.isBurned('campRotwood'), false)
  assert.equal(b.events.length, 0) // loading wakes quietly
  assert.equal(b.c.camps.filter(k => k.state === 'asleep').length, CAMPS.length - 2)
})

test('an awake camp keeps at most two bands of patrols, tied to it (S10)', () => {
  const ferrow = CAMPS.find(k => k.id === 'campFerrow')
  const { c, spawned } = camps()
  c.wake('campFerrow')
  for (let i = 0; i < 12; i++) c.update(ferrow.spawns.every)
  const patrols = spawned.filter(e => e.key !== 'camp')
  assert.equal(patrols.length, 2 * ferrow.spawns.count)
  assert.ok(patrols.every(e => e.home?.id === 'campFerrow' && e.home.leash === 700 && e.home.siege === 600))
  patrols[0].alive = false // one falls: the next band only tops it back up
  c.update(ferrow.spawns.every)
  assert.equal(spawned.filter(e => e.key !== 'camp').length, 2 * ferrow.spawns.count + 1)
})

test('a stronghold is warded while its boss lives; the fortress while a brazier burns (S10)', () => {
  const { c, spawned, events } = camps()
  c.wake('campGallows')
  c.wake('campAshgate')
  c.update(0.1)
  const gallows = c.camps.find(k => k.spec.id === 'campGallows')
  const boss = spawned.find(e => e.key === 'elite')
  assert.match(boss.def.name, /GALLOWS KNIGHT/)
  assert.ok(boss.guard && boss.home.id === 'campGallows')
  assert.equal(gallows.enemy.shielded, true)
  const braziers = spawned.filter(e => e.key === 'brazier')
  const ash = CAMPS.find(k => k.id === 'campAshgate')
  assert.equal(braziers.length, BRAZIERS.count)
  for (const b of braziers) assert.equal(Math.round(Math.hypot(b.x - ash.x, b.y - ash.y)), 260)
  assert.ok(braziers.every(b => b.hp === 2000))

  boss.alive = false; boss.hp = 0
  c.update(0.1)
  assert.equal(gallows.enemy.shielded, false)
  const ashgate = c.camps.find(k => k.spec.id === 'campAshgate')
  for (let k = 0; k < braziers.length; k++) {
    assert.equal(ashgate.enemy.shielded, true)
    braziers[k].alive = false; braziers[k].hp = 0
    c.update(0.1)
  }
  assert.equal(ashgate.enemy.shielded, false)
  assert.deepEqual(c.guardsJSON().sort(), ['campAshgate.brazier0', 'campAshgate.brazier1', 'campAshgate.brazier2', 'campGallows.boss'])

  // a reload remembers the fallen; a swept-away (not killed) boss comes back
  const b = camps()
  b.c.load([], ['campGallows', 'campAshgate', 'campOverseers'], c.guardsJSON())
  b.c.update(0.1)
  assert.deepEqual(b.spawned.filter(e => e.key === 'elite').map(e => e.home.id), ['campOverseers'])
  assert.equal(b.spawned.filter(e => e.key === 'brazier').length, 0)
  assert.ok(events.every(([k]) => k !== 'camp:burned'))
})
