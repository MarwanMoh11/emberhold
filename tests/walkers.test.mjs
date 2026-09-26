import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { applySlow, tickSlow, slowMult, noSlow, mergeAura, noAura, auraHealed, mixHand } = await loadTs('src/systems/walkers.ts')
const { ENEMIES } = await loadTs('src/config/enemies.ts')

const run = (s, seconds, dt = 0.1) => { for (let t = 0; t < seconds - 1e-9; t += dt) tickSlow(s, dt); return s }

test("a wretch's hit slows by 30% for 1.5 s, then lifts", () => {
  const { mult, seconds } = ENEMIES.bogWretch.slows
  const s = applySlow(noSlow(), mult, seconds)
  assert.equal(slowMult(s), 0.7)
  run(s, 1.4)
  assert.equal(slowMult(s), 0.7)
  run(s, 0.2)
  assert.equal(slowMult(s), 1)
})

test('slows never stack: a second hit refreshes the clock, the strongest holds', () => {
  const s = applySlow(noSlow(), 0.7, 1.5)
  run(s, 1)
  applySlow(s, 0.7, 1.5)
  assert.equal(slowMult(s), 0.7) // not 0.49
  assert.ok(Math.abs(s.t - 1.5) < 1e-9) // refreshed to 1.5, not 2.0
  applySlow(s, 0.9, 3) // a weaker slow extends the time but never weakens it
  assert.equal(slowMult(s), 0.7)
  assert.equal(s.t, 3)
  run(s, 3.1)
  applySlow(s, 0.9, 1) // once lifted, the next slow is its own
  assert.equal(slowMult(s), 0.9)
})

test("auras take the strongest of each effect; a priest heals others, not itself", () => {
  const priest = ENEMIES.ashPriest.aura
  const caller = ENEMIES.commander.aura
  assert.deepEqual([priest.radius, priest.damageMult, priest.heal], [220, 1.25, 10])
  const fx = mergeAura(mergeAura(noAura(), priest), caller)
  assert.equal(fx.damage, 1.35) // +35%, not 1.25 × 1.35
  assert.equal(fx.speed, 1.2)
  assert.equal(fx.heal, 10)
  assert.equal(mergeAura(mergeAura(noAura(), priest), priest).heal, 10) // two priests heal 10, not 20
  assert.equal(mergeAura(noAura(), priest, true).heal, 0)
  assert.equal(auraHealed(100, 220, 10, 0.5), 105)
  assert.equal(auraHealed(218, 220, 10, 1), 220)
})

test('the wave mix: wretches by marsh and moor, priests 1 in 12 from tier 4, hounds from tier 5, thornlings in packs', () => {
  const hand = Array(24).fill('grunt')
  const count = (h, k) => h.filter(x => x === k).length
  const moor = mixHand(hand, { own: 'shield', region: 'barrowmoor', tier: 3 }, 0.3)
  assert.equal(count(moor, 'shield'), 7)
  assert.equal(count(moor, 'bogWretch'), 6)
  assert.equal(count(mixHand(hand, { own: 'bogWretch', region: 'saltmere', tier: 3 }, 0.3), 'bogWretch'), 7) // its own 30% covers it
  const stair = mixHand(hand, { own: 'ashPriest', region: 'rim', tier: 4 }, 0.3)
  assert.equal(count(stair, 'ashPriest'), 2) // capped at 1 in 12, its own share included
  assert.equal(count(stair, 'cinderHound'), 0)
  const maw = mixHand(hand, { own: null, region: 'cinderfall', tier: 5 }, 0.3)
  assert.equal(count(maw, 'ashPriest'), 2)
  assert.equal(count(maw, 'cinderHound'), 4)
  assert.ok(maw.indexOf('cinderHound') < 12, 'spread through the hand, not all at the back')
  assert.equal(count(mixHand(hand, { own: null, region: 'kettle', tier: 3 }, 0.3), 'grunt'), 24)
  const den = mixHand(Array(10).fill('grunt'), { own: 'thornling', region: 'deepwood', tier: 3 }, 0.3, { thornling: ENEMIES.thornling.pack })
  assert.equal(count(den, 'thornling'), 15)
  assert.equal(den.length, 22)
})
