import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { waveDef, WAVE_PACE, FRONTS, frontShare } = await loadTs('src/config/waves.ts')
const { VILLAGE, nightReward } = await loadTs('src/config/balance.ts')

const count = w => Object.values(waveDef(w).enemies).reduce((a, b) => a + b, 0)

test('the nights stretch to the 1.5x pace: 45 threatens like the first pass 30', () => {
  assert.equal(WAVE_PACE, 1.5)
  // first-pass night 30 was procedural t = 18: hp x(1 + 18 x 0.22)
  assert.ok(Math.abs(waveDef(45).hpMult - (1 + 18 * 0.22)) < 1e-9)
  assert.equal(waveDef(8).boss, 'siegeBeast')
  assert.equal(waveDef(15).boss, 'warlord')
  assert.equal(waveDef(1).banner, 'Scouts on the ridge')
  // the scripted first pass keeps its shape, stretched: night 9 is its 6th (58 walkers)
  assert.equal(count(9), 58)
})

test('the village calls S20 made, and a night reward that climbs', () => {
  assert.equal(VILLAGE.cottagePopMax, 150)
  assert.equal(VILLAGE.market.sells, true)
  assert.ok(nightReward(45) > nightReward(8) && nightReward(1) >= 60)
})

test('three fronts ease the night (S22): a share of the deck, and deep musters add less', () => {
  assert.equal(frontShare(2), 1)
  assert.ok(frontShare(3) < 1 && frontShare(4) === frontShare(3))
  // a tier-4 muster's walkers: at most 1.5x hp and 1.35x damage (was 2x and 1.6x)
  assert.ok(1 + 4 * FRONTS.hp <= 1.5 && 1 + 4 * FRONTS.dmg <= 1.35)
})
