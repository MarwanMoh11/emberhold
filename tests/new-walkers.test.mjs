import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { ENEMIES } = await loadTs('src/config/enemies.ts')
const { waveDef } = await loadTs('src/config/waves.ts')
const { blinkTarget, summonRing, summonRoom, inDeck, DECK_FROM, BLINK_STANDOFF, SUMMON_RADIUS } = await loadTs('src/systems/newWalkers.ts')

test('the hexcaller and the ashen shade are defined with their behaviours', () => {
  const h = ENEMIES.hexcaller
  assert.equal(h.key, 'hexcaller')
  assert.equal(h.hp, 70)
  assert.equal(h.speed, 56)
  assert.equal(h.healthbar, true)
  assert.equal(h.keepsDistance, 200)
  assert.equal(h.damage, 0) // it holds off and summons; it never melees
  assert.deepEqual(h.summons, { key: 'swarm', count: 3, every: 7, cap: 9 })
  assert.equal(h.xp, 12)
  assert.equal(h.coins, 16)
  assert.ok(h.drops.some(d => d.type === 'crystal' && d.chance > 0 && d.chance < 0.3)) // a small crystal chance

  const s = ENEMIES.shade
  assert.equal(s.key, 'shade')
  assert.equal(s.hp, 60)
  assert.equal(s.speed, 92)
  assert.equal(s.damage, 9)
  assert.equal(s.prefers, 'player')
  assert.deepEqual(s.blinks, { range: 150, every: 4, minDist: 120 })
  assert.equal(s.xp, 7)
  assert.equal(s.coins, 9)
})

test('decks take the shade from night 6 and the hexcaller from night 8, never sooner', () => {
  assert.equal(DECK_FROM.shade, 6)
  assert.equal(DECK_FROM.hexcaller, 8)
  for (let n = 1; n <= 60; n++) {
    const enemies = waveDef(n).enemies
    for (const key of Object.keys(enemies)) assert.ok(ENEMIES[key], `night ${n}: ${key} is a real enemy`)
    assert.equal((enemies.shade ?? 0) > 0, n >= 6, `shade on night ${n}`)
    assert.equal((enemies.hexcaller ?? 0) > 0, n >= 8, `hexcaller on night ${n}`)
  }
  assert.equal(inDeck('shade', 5), false)
  assert.equal(inDeck('shade', 6), true)
  assert.equal(inDeck('hexcaller', 7), false)
  assert.equal(inDeck('hexcaller', 8), true)
  assert.equal(inDeck('grunt', 1), true)
})

test('blink: 150 px toward the target, stopped short of it, never onto blocked ground', () => {
  const rule = ENEMIES.shade.blinks
  const open = () => true
  assert.deepEqual(blinkTarget({ x: 0, y: 0 }, { x: 300, y: 0 }, rule, open), { x: 150, y: 0 })
  // a 130 px target would be overshot: the hop stops BLINK_STANDOFF short of it
  assert.deepEqual(blinkTarget({ x: 0, y: 0 }, { x: 130, y: 0 }, rule, open), { x: 130 - BLINK_STANDOFF, y: 0 })
  // diagonal: the hop is still exactly `range` long
  const p = blinkTarget({ x: 0, y: 0 }, { x: 300, y: 400 }, rule, open)
  assert.ok(Math.abs(Math.hypot(p.x, p.y) - 150) < 1e-9)
  // not more than minDist away (120 px): no blink
  assert.equal(blinkTarget({ x: 0, y: 0 }, { x: 100, y: 0 }, rule, open), null)
  assert.equal(blinkTarget({ x: 0, y: 0 }, { x: 120, y: 0 }, rule, open), null)
  // a blocked landing spot skips the blink
  assert.equal(blinkTarget({ x: 0, y: 0 }, { x: 300, y: 0 }, rule, x => x < 100), null)
  // the landing spot is the one the nav grid is asked about
  let seen = null
  blinkTarget({ x: 0, y: 0 }, { x: 300, y: 0 }, rule, (x, y) => { seen = [x, y]; return true })
  assert.deepEqual(seen, [150, 0])
})

test('summon ring: evenly spaced round the summoner, and the cap holds at nine', () => {
  const ring = summonRing(100, 200, 3, SUMMON_RADIUS, 0)
  assert.equal(ring.length, 3)
  for (const p of ring) assert.ok(Math.abs(Math.hypot(p.x - 100, p.y - 200) - SUMMON_RADIUS) < 1e-9)
  assert.deepEqual(ring[0], { x: 100 + SUMMON_RADIUS, y: 200 })
  // three points 120 degrees apart: every side of the triangle is the same length
  const side = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  assert.ok(Math.abs(side(ring[0], ring[1]) - side(ring[1], ring[2])) < 1e-9)
  assert.ok(Math.abs(side(ring[0], ring[1]) - SUMMON_RADIUS * Math.sqrt(3)) < 1e-9)
  assert.equal(summonRing(0, 0, 0, 10).length, 0)

  // room is the count when clear, cut to the cap, and never negative
  assert.equal(summonRoom(0, 3, 9), 3)
  assert.equal(summonRoom(7, 3, 9), 2)
  assert.equal(summonRoom(9, 3, 9), 0)
  assert.equal(summonRoom(12, 3, 9), 0)
  // casting ring after ring stops at the cap
  let living = 0
  for (let c = 0; c < 10; c++) living += summonRoom(living, 3, 9)
  assert.equal(living, 9)
})
