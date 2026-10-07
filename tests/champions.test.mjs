import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { affixMods, championCap, championChance, rollAffix } = await loadTs('src/systems/champions.ts')
const { AFFIXES, CHAMPION, CHAMPION_BOUNTY } = await loadTs('src/config/champions.ts')

test('champions start on wave 3, and their chance climbs to a cap', () => {
  assert.equal(championChance(1), 0)
  assert.equal(championChance(2), 0)
  assert.equal(+championChance(3).toFixed(6), 0.038)
  assert.ok(championChance(4) > championChance(3))
  assert.equal(championChance(20), CHAMPION.chance.max)
})

test('a night holds at most 4 + floor(wave / 4) champions', () => {
  assert.equal(championCap(3), 4)
  assert.equal(championCap(4), 5)
  assert.equal(championCap(7), 5)
  assert.equal(championCap(8), 6)
})

test('an affix is picked evenly, and a rand of 1 still lands on the last', () => {
  const keys = Object.keys(AFFIXES)
  assert.equal(rollAffix(() => 0), keys[0])
  assert.equal(rollAffix(() => 0.9999), keys[keys.length - 1])
  assert.equal(rollAffix(() => 1), keys[keys.length - 1])
  const seen = new Set(keys.map((_, i) => rollAffix(() => (i + 0.5) / keys.length)))
  assert.equal(seen.size, keys.length)
})

test('each affix gives its own multiples, and a plain walker none', () => {
  assert.equal(affixMods('swift').speed, 1.45)
  assert.equal(affixMods('swift').attackRate, 1.25)
  assert.equal(affixMods('vampiric').leech, 0.4)
  assert.equal(affixMods('warded').taken, 0.65)
  assert.ok(affixMods('molten').patch.dps > 0)
  assert.deepEqual(affixMods('splitting').split, { count: 2, key: 'grunt' })
  // an affix leaves the stats it does not name alone
  assert.equal(affixMods('molten').speed, 1)
  assert.equal(affixMods('splitting').taken, 1)
  const plain = affixMods(null)
  assert.deepEqual([plain.speed, plain.attackRate, plain.leech, plain.taken], [1, 1, 0, 1])
  assert.equal(plain.patch, null)
  assert.equal(plain.split, null)
})

test('one tint per affix, and a bounty of three times the coins with a crystal drop', () => {
  const tints = Object.keys(AFFIXES).map(k => affixMods(k).tint)
  assert.equal(new Set(tints).size, tints.length)
  assert.equal(CHAMPION_BOUNTY.coins, 3)
  assert.ok(CHAMPION_BOUNTY.drops.some(d => d.type === 'crystal' && d.chance === 1))
})
