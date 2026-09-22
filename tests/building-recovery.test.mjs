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
