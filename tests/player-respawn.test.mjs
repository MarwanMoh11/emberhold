import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { Player } = await loadTs('src/entities/Player.ts')

test('a returning hero can move out of a surrounding horde before taking damage', () => {
  const hero = Object.create(Player.prototype)
  const container = { setVisible() { return this }, setPosition() { return this } }
  hero.scene = { fx: { ring() {} }, now: 0 }
  hero.container = container
  hero.alive = false
  hero.maxHp = 200
  hero.hp = 0
  hero.vx = hero.vy = 0
  hero.dodgeTime = 0
  hero.invincible = false
  hero.hurtCd = 1
  hero.stats = { armor: 0 }

  hero.respawn(100, 200)
  assert.equal(hero.hp, 200)
  assert.equal(hero.alive, true)
  assert.ok(hero.respawnShieldT >= 2)
  assert.equal(hero.applyDamage(60, 100, 200), false)
  assert.equal(hero.hp, 200)

  hero.respawnShieldT = 0
  assert.equal(hero.applyDamage(60, 100, 200), false)
  assert.equal(hero.hp, 140)
})
