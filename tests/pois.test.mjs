import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { Modifiers } = await loadTs('src/systems/Modifiers.ts')
const { PoiManager } = await loadTs('src/systems/PoiManager.ts')
const { SaveManager, parseSave } = await loadTs('src/systems/SaveManager.ts')

const noop = () => {}
const obj = () => {
  const o = { height: 64, width: 40, visible: true, text: '' }
  for (const k of ['setOrigin', 'setDepth', 'setBlendMode', 'setAlpha', 'setScale', 'setPosition', 'setTintFill', 'setTexture']) o[k] = () => o
  o.setVisible = v => { o.visible = v; return o }
  o.setText = t => { o.text = t; return o }
  return o
}

/** A scene with the hero at `at`, stores of `coins`, and the camps in `burned` burned. */
function world({ at = [0, 0], coins = 0, burned = [] } = {}) {
  const events = []
  const stored = { coins, wood: 0, food: 1000, stone: 0, metal: 0, crystal: 0 }
  const scene = {
    add: { image: obj, text: obj },
    tweens: { add: noop },
    player: { x: at[0], y: at[1], alive: true },
    mods: new Modifiers(),
    camps: { isBurned: id => burned.includes(id) },
    regions: { exploredNear: () => false, revealArea: noop },
    buildings: { buildings: [], recomputeBonuses: noop, refreshWallHp: noop, slotsOf: () => 0 },
    army: { soldiers: [] },
    workers: { hire: () => null },
    res: {
      canAfford: bag => Object.entries(bag).every(([k, v]) => stored[k] >= v),
      spend: bag => { for (const [k, v] of Object.entries(bag)) stored[k] -= v },
      take: (k, n) => { const got = Math.min(n, stored[k]); stored[k] -= got; return { carried: 0, stored: got } },
      addStored: (k, n) => { stored[k] += n; return n },
    },
    fx: { ring: noop, popup: noop, flyResource: noop },
    audio: { play: noop },
    openChest: noop,
    bus: { emit: (k, p) => events.push([k, p]) },
  }
  return { pois: new PoiManager(scene, { fog: 0, light: 0, labels: 0 }), scene, stored, events }
}

test('modifiers apply every add, then every mult; a source registered twice replaces itself', () => {
  const m = new Modifiers()
  m.add('a', { stat: 'food.yield', mult: 1.15 })
  m.add('b', { stat: 'hero.regen', add: 2 }, { stat: 'hero.regen', mult: 2 })
  m.add('a', { stat: 'food.yield', mult: 1.15 })
  assert.equal(Math.round(m.value('food.yield', 100) * 1000) / 1000, 115)
  assert.equal(m.value('hero.regen', 3), 10)
  assert.equal(m.value('wall.hp', 50), 50)
})

test('POIs are seen when the fog clears near them, and a cache opens once', () => {
  const { pois, events } = world()
  assert.equal(pois.state('cache1'), 'unseen')
  pois.revealAt(4300, 700)
  assert.equal(pois.state('cache1'), 'seen')
  assert.deepEqual(events[0], ['poi:seen', { id: 'cache1', kind: 'cache' }])
  assert.equal(pois.interact('cache1'), true)
  assert.equal(pois.state('cache1'), 'done')
  assert.equal(pois.interact('cache1'), false)
})

test('standing on the Shrine of the Harvest pays its cost in drips and registers +15% food', () => {
  const { pois, scene, stored } = world({ at: [5850, 5452], coins: 700 })
  for (let i = 0; i < 60 && pois.state('shrineHarvest') !== 'done'; i++) pois.update(0.08)
  assert.equal(pois.state('shrineHarvest'), 'done')
  assert.equal(stored.coins, 100)
  assert.equal(stored.food, 700)
  assert.equal(Math.round(scene.mods.value('food.yield', 100)), 115)
})

test('survHollow stays locked until Rotwood burns; survSalt waits on the Saltmere Light', () => {
  const locked = world({ at: [3450, 3902] })
  locked.pois.update(0.1)
  assert.equal(locked.pois.lockedBy('survHollow'), 'campRotwood')
  assert.equal(locked.pois.state('survHollow'), 'unseen')
  const open = world({ at: [3450, 3902], burned: ['campRotwood'] })
  open.pois.update(0.1)
  assert.equal(open.pois.state('survHollow'), 'done')
  assert.equal(open.pois.popBonus(), 6)
  assert.equal(open.pois.lockedBy('survSalt'), 'shrineTide')
})

test('done POIs round-trip through the save and re-register their shrines', () => {
  const a = world({ coins: 5000 })
  a.stored.stone = 400
  for (const id of ['lore3', 'shrineMason', 'lmBell']) assert.equal(a.pois.interact(id), true)
  const ids = a.pois.toJSON()
  assert.deepEqual(ids, ['shrineMason', 'lmBell', 'lore3'])
  const b = world()
  b.pois.load(ids)
  assert.equal(b.pois.state('lore3'), 'done')
  assert.equal(b.pois.count('shrine'), 1)
  assert.equal(Math.round(b.scene.mods.value('wall.hp', 100)), 120)
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
  assert.ok(SaveManager.inspectImport(JSON.stringify({ ...save, pois: ids })))
  // a POI the blueprint lost is dropped (S19); a wrong type still refuses the save
  assert.deepEqual(parseSave(JSON.stringify({ ...save, pois: [...ids, 'shrineNowhere'] })).pois, ids)
  assert.equal(SaveManager.inspectImport(JSON.stringify({ ...save, pois: [7] })), null)
})
