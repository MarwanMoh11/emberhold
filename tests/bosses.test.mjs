import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { KITS, STRONGHOLD_BOSSES, crossed, due, newBinding, tickBinding, wardenImmune, nearSegment, inArc } = await loadTs('src/systems/bosses.ts')
const { ENEMIES } = await loadTs('src/config/enemies.ts')
const { CAMPS } = await loadTs('src/config/world/index.ts')

test('every stronghold boss is a boss EnemyDef with the hp the design gives it', () => {
  const hp = { gallowsKnight: 3500, thornmother: 3000, seamOverseer: 4200, stairwarden: 5000 }
  for (const key of STRONGHOLD_BOSSES) {
    const d = ENEMIES[key]
    assert.ok(d?.boss && d.healthbar, key)
    assert.equal(d.hp, hp[key], key)
  }
  // each stronghold's `boss` is one of them (the Forges have none)
  for (const c of CAMPS.filter(c => c.boss)) assert.ok(STRONGHOLD_BOSSES.includes(c.boss), c.id)
  assert.equal(ENEMIES.seamOverseer.range, 180)
  assert.equal(ENEMIES.seamOverseer.aura.speedMult, 1.2)
})

test('the hanged rise once, as the knight crosses half health, not when restored below it', () => {
  const at = KITS.gallowsKnight.hanged.at
  assert.equal(crossed(0.52, 0.49, at), true)
  assert.equal(crossed(0.49, 0.3, at), false) // already past: no second rising
  assert.equal(crossed(0.4, 0.4, at), false)  // a reload at 40% starts below it
})

test('a thornling pack every 6 s', () => {
  const s = { t: KITS.thornmother.pack.every }
  let packs = 0
  for (let i = 0; i < 305; i++) if (due(s, 0.1, KITS.thornmother.pack.every)) packs++ // 30.5 s
  assert.equal(packs, 5)
})

test('the Stairwarden is immune while a bound priest lives; the pair rises once more, then never', () => {
  const b = newBinding()
  const rebind = KITS.stairwarden.bound.rebind
  assert.equal(wardenImmune(2), true)
  assert.equal(wardenImmune(1), true)
  assert.equal(wardenImmune(0), false)
  // both alive: no clock
  assert.equal(tickBinding(b, 2, 100), false)
  // both down: the pair rises after `rebind` s
  let rose = 0
  for (let t = 0; t < rebind + 1; t += 0.5) if (tickBinding(b, 0, 0.5)) rose++
  assert.equal(rose, 1)
  // down again: no more respawns
  for (let t = 0; t < rebind * 3; t += 0.5) if (tickBinding(b, 0, 0.5)) rose++
  assert.equal(rose, 1)
})

test('the root lash strikes along its line, the cleave in its arc', () => {
  assert.equal(nearSegment(0, 0, 400, 0, 32, 200, 20), true)
  assert.equal(nearSegment(0, 0, 400, 0, 32, 200, 50), false)
  assert.equal(nearSegment(0, 0, 400, 0, 32, 460, 0), false)
  const { reach, half } = KITS.gallowsKnight.cleave
  assert.equal(inArc(0, 0, 0, reach, half, 100, 40), true)
  assert.equal(inArc(0, 0, 0, reach, half, -100, 0), false) // behind it
  assert.equal(inArc(0, 0, Math.PI, reach, half, -100, 10), true) // facing left, across the seam
})
