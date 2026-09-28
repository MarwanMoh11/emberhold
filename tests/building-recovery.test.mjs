import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { BuildingManager } = await loadTs('src/systems/BuildingManager.ts')

function destroyHall(level) {
  let losses = 0
  let recomputes = 0
  const dismissed = []
  const noop = () => {}
  const scene = {
    fx: { explosion: noop, smoke: noop, shake: noop, popup: noop },
    audio: { play: noop },
    workers: { dismiss: id => dismissed.push(id) },
    onCoreLost: () => { losses++ },
  }
  const manager = Object.create(BuildingManager.prototype)
  manager.scene = scene
  manager.recomputeBonuses = () => { recomputes++ }
  const hall = {
    key: 'townHall', x: 100, y: 100, level, hp: 0, maxHp: 2200,
    alive: false, state: 'done', workers: [7], progress: {},
    def: { short: 'HALL', levels: [{ hp: 1400 }, { hp: 2200 }] },
    get nextCost() { return { coins: 100, wood: 50 } },
    applyTexture: noop,
  }
  manager.onBuildingDestroyed(hall)
  return { hall, losses, recomputes, dismissed }
}

test('a fortified Hall loses a tier without ending the night', () => {
  const { hall, losses, recomputes, dismissed } = destroyHall(2)
  assert.equal(hall.level, 1)
  assert.equal(hall.hp, 560)
  assert.equal(hall.alive, true)
  assert.equal(losses, 0)
  assert.equal(recomputes, 1)
  assert.deepEqual(dismissed, [])
})

test('the Hall collapse starts recovery and leaves salvage', () => {
  const { hall, losses, recomputes, dismissed } = destroyHall(1)
  assert.equal(hall.level, 0)
  assert.equal(hall.alive, false)
  assert.equal(hall.state, 'empty')
  assert.deepEqual(hall.progress, { coins: 60, wood: 30 })
  assert.equal(losses, 1)
  assert.equal(recomputes, 1)
  assert.deepEqual(dismissed, [7])
})

function strike(b) {
  const dismissed = []
  const events = []
  const log = { sacked: 0 }
  const noop = () => {}
  const scene = {
    fx: { explosion: noop, smoke: noop, shake: noop, popup: noop, dust: noop },
    audio: { play: noop },
    workers: { dismiss: id => dismissed.push(id) },
    nav: { setBlocker: noop, setBlockerDiscs: noop },
    bus: { emit: k => events.push(k) },
    waves: { nightLog: log },
    onCoreLost: noop,
  }
  const manager = Object.create(BuildingManager.prototype)
  manager.scene = scene
  manager.bonus = { repair: 0 }
  manager.recomputeBonuses = noop
  b.alive = false // Building.applyDamage leaves it so at 0 hp
  manager.onBuildingDestroyed(b)
  return { manager, dismissed, events, log }
}

const sprite = () => ({ setTint() {}, clearTint() {} })

test('a farm at 0 hp is sacked with its level and crew, and mends to restored', () => {
  const farm = {
    key: 'farm', padId: 'farm1', x: 0, y: 0, level: 2, hp: 0, maxHp: 500,
    alive: true, state: 'done', workers: [3, 4], progress: {}, sacked: false,
    def: { short: 'FARM', category: 'production', levels: [{ hp: 400 }, { hp: 500 }] },
    sprite: sprite(), applyTexture() {},
  }
  const { manager, dismissed, events, log } = strike(farm)
  assert.equal(farm.level, 2)
  assert.equal(farm.sacked, true)
  assert.equal(farm.alive, false)
  assert.deepEqual(dismissed, [])
  assert.deepEqual(farm.workers, [3, 4])
  assert.equal(log.sacked, 1)
  assert.ok(events.includes('building:sacked'))

  manager.mendSacked(farm, 60, false) // a walker near, or night: no mending
  assert.equal(farm.hp, 0)
  manager.mendSacked(farm, 60, true)
  assert.equal(farm.sacked, false)
  assert.equal(farm.alive, true)
  assert.equal(farm.hp, 500)
  assert.ok(events.includes('building:restored'))
})

test('a wall at 0 hp still drops a level', () => {
  const wall = {
    key: 'wall', padId: 'w1', x: 0, y: 0, level: 2, hp: 0, maxHp: 900,
    alive: true, state: 'done', workers: [], progress: {}, sacked: false,
    def: { short: 'WALL', category: 'defense', levels: [{ hp: 600 }, { hp: 900 }] },
    sprite: sprite(), applyTexture() {},
  }
  strike(wall)
  assert.equal(wall.level, 1)
  assert.equal(wall.sacked, false)
  assert.equal(wall.alive, true)
})

test('a holding outside the hold calls for help, at most every few seconds', () => {
  const events = []
  const noop = () => {}
  const manager = Object.create(BuildingManager.prototype)
  manager.raids = new Map()
  manager.raidAlarmAt = -Infinity
  const farm = { key: 'farm', padId: 'farm1', x: 10, y: 20, level: 1, def: { short: 'FARM', h: 50, category: 'production' } }
  manager.byPad = new Map([['farm1', farm]])
  manager.scene = {
    now: 1000, fx: { popup: noop }, audio: { play: noop },
    bus: { emit: (k, p) => events.push([k, p]) },
    regions: { regionAt: () => ({ id: 'downs' }) },
  }
  manager.onStruck(farm)
  manager.scene.now = 2000
  manager.onStruck(farm)
  assert.equal(events.length, 1)
  assert.deepEqual(events[0], ['holding:raided', { padId: 'farm1', x: 10, y: 20, key: 'farm' }])
  assert.equal(manager.raided(3000).length, 1)
  assert.equal(manager.raided(60000).length, 0)
})
