import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { Modifiers } = await loadTs('src/systems/Modifiers.ts')
const { Relics, RELICS } = await loadTs('src/systems/Relics.ts')
const { PoiManager } = await loadTs('src/systems/PoiManager.ts')
const { ResourceManager } = await loadTs('src/systems/ResourceManager.ts')
const { SaveManager, parseSave } = await loadTs('src/systems/SaveManager.ts')

const noop = () => {}
const obj = () => {
  const o = { height: 64, width: 40, visible: true, text: '', x: 0 }
  for (const k of ['setOrigin', 'setDepth', 'setBlendMode', 'setAlpha', 'setScale', 'setPosition', 'setTintFill', 'setTexture', 'clear', 'fillStyle', 'fillRect']) o[k] = () => o
  o.setVisible = v => { o.visible = v; return o }
  return o
}

/** A scene with a bus, the modifiers, relics and POIs; `spawned` collects guardians, `drops` the grave goods. */
function world(at = [0, 0]) {
  const handlers = {}, events = [], spawned = [], drops = []
  const scene = {
    add: { image: obj, text: obj, graphics: obj },
    tweens: { add: noop, killTweensOf: noop },
    player: { x: at[0], y: at[1], alive: true, stats: { damage: 20 } },
    mods: new Modifiers(),
    camps: { isBurned: () => false },
    regions: { exploredNear: () => false, revealArea: noop },
    buildings: { buildings: [] },
    enemies: {
      spawn: (key, x, y, hpMult, dmgMult, def) => {
        const e = { key, def, x, y, alive: true, hp: Math.round(def.hp * hpMult), maxHp: Math.round(def.hp * hpMult), damage: def.damage * dmgMult, guard: false, home: null }
        spawned.push(e)
        return e
      },
    },
    pickups: { drop: (k, n) => drops.push([k, n]) },
    fx: { ring: noop, popup: noop, slash: noop, smoke: noop, shake: noop, explosion: noop },
    audio: { play: noop, playVaried: noop },
    bus: {
      on: (k, f) => { (handlers[k] ??= []).push(f) },
      emit: (k, p) => { events.push([k, p]); for (const f of handlers[k] ?? []) f(p) },
    },
  }
  scene.relics = new Relics(scene)
  scene.pois = new PoiManager(scene, { fog: 0, light: 0, labels: 0 })
  return { scene, events, spawned, drops }
}

/** Design 05 §Relics: each relic's stats, as a factor (or, for pierce, an added count). */
const TABLE = {
  barrowCrown: { 'pack.size': 1.15 },
  captainsHorn: { 'soldier.damage': 1.1 },
  gallowsBell: { 'army.speed': 1.15, 'rally.cooldown': 0.8 },
  thornCrown: { 'hero.pierce': '+1' },
  heartOakSeed: { 'wood.yield': 1.25 },
  overseersLash: { 'worker.speed': 1.15, 'worker.gather': 1.15 },
  wardensAegis: { 'tower.range': 1.1 },
}

test('each relic changes its stats by the table amount, once', () => {
  assert.deepEqual(RELICS.map(r => r.id), Object.keys(TABLE))
  const { scene } = world()
  for (const [id, stats] of Object.entries(TABLE)) {
    const before = Object.fromEntries(Object.keys(stats).map(k => [k, scene.mods.value(k, 100)]))
    assert.equal(scene.relics.grant(id), true)
    assert.equal(scene.relics.grant(id), false, `${id} is held once`)
    for (const [k, want] of Object.entries(stats)) {
      const after = scene.mods.value(k, 100)
      if (want === '+1') assert.equal(after - before[k], 1, k)
      else assert.equal(Math.round((after / before[k]) * 1000) / 1000, want, k)
    }
  }
  assert.equal(scene.relics.list().length, 7)
})

test('the Barrow Crown widens the pack by 15%', () => {
  const mods = new Modifiers()
  const res = new ResourceManager({ emit: noop })
  res.mods = mods
  const base = res.carryCapacity
  mods.add('barrowCrown', ...RELICS[0].mods)
  assert.equal(res.carryCapacity, Math.round(base * 1.15))
})

test('barrowKing breaks open in about 6 s, wakes its guardian, and the guardian drops the Barrow Crown', () => {
  const { scene, spawned, drops, events } = world([4950, 655])
  let t = 0
  while (!spawned.length && t < 20) { scene.pois.update(0.1); t += 0.1 }
  assert.ok(t > 5 && t < 7.5, `opened after ${t.toFixed(1)} s`)
  const g = spawned[0]
  assert.equal(g.key, 'elite')
  assert.equal(g.guard, true)
  assert.equal(g.home.id, 'barrowKing')
  assert.equal(scene.pois.state('barrowKing') === 'done', false, 'not done while its guardian stands')
  g.alive = false; g.hp = 0
  scene.pois.update(0.1)
  assert.equal(scene.pois.state('barrowKing'), 'done')
  assert.ok(drops.length > 0, 'grave goods dropped')
  assert.equal(scene.relics.has('barrowCrown'), true)
  assert.equal(Math.round(scene.mods.value('pack.size', 100)), 115)
  assert.ok(events.some(([k, p]) => k === 'relic:granted' && p.id === 'barrowCrown'))
})

test('a stronghold burned hands over its boss relics; relics round-trip through the save', () => {
  const a = world()
  a.scene.bus.emit('camp:burned', { id: 'campThornmother', tier: 'stronghold', boss: 'thornmother' })
  assert.deepEqual(a.scene.relics.list(), ['thornCrown', 'heartOakSeed'])
  assert.equal(a.scene.pois.state('relicThorn'), 'done', 'its marker lights')
  const ids = a.scene.relics.toJSON()

  const b = world()
  b.scene.relics.load(ids, ['campGallows'])
  assert.deepEqual(b.scene.relics.list(), ['gallowsBell', 'thornCrown', 'heartOakSeed'])
  assert.equal(b.scene.mods.value('hero.pierce', 0), 1)
  assert.equal(b.events.length, 0, 'loading is silent')

  const bag = () => ({ coins: 0, wood: 0, food: 0, stone: 0, metal: 0, crystal: 0 })
  const save = {
    v: 2, savedAt: 1_790_000_000_000, playtime: 400,
    res: { carried: bag(), stored: bag(), totalGathered: bag(), discovered: [] },
    player: { level: 3, xp: 0, hp: 200, x: 1700, y: 1400 },
    upgrades: [], buildings: [], workers: [], army: { counts: {} },
    waves: { wave: 2, wavesCleared: 2, phase: 'day', phaseT: 20 },
    quests: { index: 0, done: [], achievements: [] },
    regions: ['hold'], camps: [], abilities: { slots: [], ultimate: false },
    combat: { kills: 0, bossKills: 0 },
  }
  assert.ok(SaveManager.inspectImport(JSON.stringify({ ...save, relics: ids })))
  // a relic the blueprint lost is dropped (S19); a wrong type still refuses the save
  assert.deepEqual(parseSave(JSON.stringify({ ...save, relics: [...ids, 'theHolyGrail'] })).relics, ids)
  assert.equal(SaveManager.inspectImport(JSON.stringify({ ...save, relics: [7] })), null)
})
