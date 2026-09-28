import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { PickupManager, sweepPickups } = await loadTs('src/systems/PickupManager.ts')
const { ENEMIES } = await loadTs('src/config/enemies.ts')

function makeScene(heroAt) {
  const banked = { coins: 0 }
  let xp = 0
  const sprite = () => {
    const s = { rotation: 0 }
    for (const name of ['setVisible', 'setActive', 'setPosition', 'setRotation', 'setAlpha',
      'setScale', 'setTexture', 'setDepth']) s[name] = () => s
    return s
  }
  const scene = {
    add: { image: sprite },
    player: { ...heroAt, alive: true, addXp: n => { xp += n } },
    res: { addStored: (k, n) => { banked[k] = (banked[k] ?? 0) + n; return n } },
  }
  return { scene, banked, xp: () => xp }
}

test('a kill far from the hero banks its coins and owes half its xp, with nothing left on the ground', () => {
  const { scene, banked } = makeScene({ x: 0, y: 0 })
  const pickups = new PickupManager(scene)
  const def = { ...Object.values(ENEMIES)[0], drops: undefined }
  pickups.dropLoot(def, 2000, 0, 1)
  assert.ok(banked.coins >= 1)
  assert.equal(pickups.xpOwed, def.xp * 0.5)
  // only a rare heart can be left behind; no coin or xp sprite
  assert.ok(pickups.activeCount <= 1)
})

test('a kill near the hero still scatters coins to fly home', () => {
  const { scene, banked } = makeScene({ x: 0, y: 0 })
  const pickups = new PickupManager(scene)
  pickups.dropLoot({ ...Object.values(ENEMIES)[0], drops: undefined }, 300, 0, 1)
  assert.equal(banked.coins, 0)
  assert.ok(pickups.activeCount >= 2)
})

test('the dawn sweep banks cargo on claimed ground and leaves cargo off it', () => {
  const items = [
    { active: true, kind: 'stone', amount: 12, x: 50, y: 0 },
    { active: true, kind: 'stone', amount: 8, x: 60, y: 0 },
    { active: true, kind: 'wood', amount: 5, x: 500, y: 0 },
    { active: true, kind: 'xp', amount: 3, x: 50, y: 0 },
    { active: true, kind: 'coins', amount: 4, x: 900, y: 0 },
    { active: false, kind: 'food', amount: 9, x: 10, y: 0 },
  ]
  const taken = []
  const bag = sweepPickups(items, x => x < 100, p => taken.push(p.kind))
  assert.deepEqual(bag, { stone: 20 })
  assert.deepEqual(taken, ['stone', 'stone', 'coins'])
  assert.deepEqual(items.map(p => p.active), [false, false, true, true, false, false])
})
