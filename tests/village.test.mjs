import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const V = await loadTs('src/systems/village.ts')
const { VILLAGE } = await loadTs('src/config/balance.ts')
const { BUILDINGS } = await loadTs('src/config/buildings.ts')

test('localBonus: the best mill in reach counts, mills never stack', () => {
  const mill = lvl => ({ bonus: BUILDINGS.mill.levels[lvl - 1].stats.bonus, reach: BUILDINGS.mill.levels[lvl - 1].stats.reach })
  const a = { x: 0, y: 0, ...mill(1) }, b = { x: 300, y: 0, ...mill(3) }
  assert.equal(V.bestBonus([], 0, 0), 1)
  assert.equal(V.bestBonus([a], 100, 0), 1.15)
  assert.equal(V.bestBonus([a, b], 100, 0), 1.35)
  assert.equal(V.bestBonus([a], 601, 0), 1, 'out of reach')
  assert.equal(V.bestBonus([a, { ...a }], 0, 0), 1.15, 'two of the same do not stack')
})

test('market: its rate, +5% a home up to +50%, and the floor', () => {
  const sell = BUILDINGS.market.levels.map(l => l.stats.sell)
  assert.deepEqual(sell, [0.2, 0.4, 0.6])
  assert.equal(V.marketRate(0.6, 0), 0.6)
  assert.ok(Math.abs(V.marketRate(0.6, 2) - 0.66) < 1e-9)
  assert.ok(Math.abs(V.marketRate(1, 40) - 1.5) < 1e-9, 'capped at +50%')
  const f = VILLAGE.market.floor, k = VILLAGE.market.goodsPerCoin
  assert.equal(V.marketGood(1000, 1000), 'food')
  assert.equal(V.marketGood(400, 1000), 'wood')
  assert.equal(V.marketGood(f + k - 1, f), null, 'less than a coin of surplus left: stops')
  assert.equal(V.marketGood(f + k, 0), 'food')
})

test('chapel: blessings add, capped at +50%', () => {
  assert.equal(V.blessingMultiplier([]), 1)
  assert.equal(V.blessingMultiplier([0.1, 0.2]), 1 + 0.1 + 0.2)
  assert.equal(V.blessingMultiplier([0.2, 0.2, 0.2, 0.1]), 1 + VILLAGE.chapel.blessingMax)
})

test('watch post: a route passing within its light', () => {
  const route = [[0, 0], [1000, 0], [1000, 1000]]
  assert.ok(V.routeNear(route, 300, 590, 600))
  assert.ok(!V.routeNear(route, 300, 610, 600))
  assert.ok(V.routeNear(route, 1500, 500, 600))
})
