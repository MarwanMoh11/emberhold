import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { omenFor, rollOf, hordeSize, swarmExtra } = await loadTs('src/systems/omens.ts')
const { OMENS } = await loadTs('src/config/omens.ts')
const { dawnParts } = await loadTs('src/ui/threatMath.ts')

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const keyAt = w => omenFor(w)?.key ?? null
const isRandom = o => !!o && o.key !== 'bloodMoon'

test('Blood Moon on every seventh night from wave 7, and on no other', () => {
  for (const w of range(1, 300)) {
    const blood = w >= 7 && w % 7 === 0
    assert.equal(keyAt(w) === 'bloodMoon', blood, `wave ${w}`)
  }
  assert.deepEqual([7, 14, 21].map(keyAt), ['bloodMoon', 'bloodMoon', 'bloodMoon'])
})

test('no omen before wave 4', () => {
  assert.deepEqual([0, 1, 2, 3].map(keyAt), [null, null, null, null])
})

test('an omen is a pure function of the wave, whatever order it is asked in', () => {
  const waves = range(1, 200)
  const forward = waves.map(keyAt)
  assert.deepEqual([...waves].reverse().map(keyAt).reverse(), forward)
  for (const w of waves) assert.ok(rollOf(w) >= 0 && rollOf(w) < 1)
  assert.equal(rollOf(42, 1), rollOf(42, 1))
})

test('never two random omens in a row, over waves 1 to 200', () => {
  for (const w of range(2, 200)) {
    assert.ok(!(isRandom(omenFor(w - 1)) && isRandom(omenFor(w))), `waves ${w - 1} and ${w}`)
  }
})

test('about a quarter of eligible nights get a random omen, split evenly', () => {
  const eligible = range(4, 2000).filter(w => w % 7 !== 0)
  const picks = eligible.map(w => omenFor(w)).filter(isRandom)
  const rate = picks.length / eligible.length
  // the no-repeat rule trims the 25% roll to about a fifth of nights: inside the band
  assert.ok(Math.abs(rate - 0.25) <= 0.08, `rate ${rate.toFixed(3)}`)
  const swarm = picks.filter(o => o.key === 'swarm').length / picks.length
  assert.ok(Math.abs(swarm - 0.5) <= 0.1, `swarm share ${swarm.toFixed(3)}`)
})

test('an omen changes the horde, the swarm and the coins it names', () => {
  assert.equal(hordeSize(10, OMENS.bloodMoon), 14)
  assert.equal(hordeSize(10, OMENS.quiet), 7)
  assert.equal(hordeSize(10, OMENS.swarm), 10)
  assert.equal(hordeSize(10, null), 10)
  assert.equal(swarmExtra(20, OMENS.swarm), 10)
  assert.equal(swarmExtra(20, OMENS.bloodMoon), 0)
  assert.equal(swarmExtra(20, null), 0)
  assert.equal(OMENS.bloodMoon.coinMult, 1.6)
  assert.equal(OMENS.swarm.coinMult, 1.2)
  assert.equal(OMENS.quiet.coinMult, 1)
})

test('the dawn card names the omen the night held', () => {
  const log = { wave: 14, kills: 3, coins: 9, swept: {}, sacked: 0 }
  assert.equal(dawnParts({ ...log, omen: 'bloodMoon' })[0][1], 'Blood Moon survived')
  assert.ok(!dawnParts(log)[0].some(s => s.includes('survived')))
})

test('a kill pays the omen\'s coins while its night is on', async () => {
  const { PickupManager } = await loadTs('src/systems/PickupManager.ts')
  const { ENEMIES } = await loadTs('src/config/enemies.ts')
  const sprite = () => {
    const s = {}
    for (const name of ['setVisible', 'setActive', 'setPosition', 'setRotation', 'setAlpha', 'setScale', 'setTexture', 'setDepth']) s[name] = () => s
    return s
  }
  // a far kill banks its coins whole, so the total is the coin rolls alone
  const coinsFor = omen => {
    const banked = { coins: 0 }
    const scene = {
      add: { image: sprite },
      player: { x: 0, y: 0, alive: true, addXp() {} },
      res: { addStored: (k, n) => { banked[k] += n } },
      waves: { omen },
    }
    const pickups = new PickupManager(scene)
    for (let i = 0; i < 400; i++) pickups.dropLoot(ENEMIES.elite, 2000, 0, 1)
    return banked.coins
  }
  const plain = coinsFor(null)
  assert.ok(Math.abs(coinsFor(OMENS.bloodMoon) / plain - 1.6) < 0.05)
  assert.ok(Math.abs(coinsFor(OMENS.swarm) / plain - 1.2) < 0.05)
  assert.ok(Math.abs(coinsFor(OMENS.quiet) / plain - 1) < 0.05)
})
