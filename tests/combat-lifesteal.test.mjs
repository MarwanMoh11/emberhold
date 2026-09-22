import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { CombatSystem } = await loadTs('src/systems/CombatSystem.ts')
const { ProjectileManager } = await loadTs('src/systems/ProjectileManager.ts')

function makeScene() {
  let healed = 0
  const enemy = {
    id: 1, x: 10, y: 0, radius: 12, hp: 200, alive: true,
    applyDamage(n) { this.hp -= n; return this.hp <= 0 },
  }
  const sprite = () => {
    const s = { rotation: 0 }
    for (const name of ['setVisible', 'setActive', 'setPosition', 'setRotation', 'setAlpha',
      'setScale', 'setTint', 'setDepth', 'setTexture']) s[name] = () => s
    return s
  }
  const noop = () => {}
  const scene = {
    player: { stats: { lifesteal: 0.5 }, heal: n => { healed += n } },
    enemies: { grid: { query(_x, _y, _radius, out) { out.length = 0; out.push(enemy); return out } } },
    fx: { damage: noop, hitSpark: noop, explosion: noop },
    audio: { playVaried: noop },
    add: { image: sprite },
  }
  scene.combat = new CombatSystem(scene)
  return { scene, enemy, healed: () => healed }
}

test('hero projectiles heal, allied projectiles do not', () => {
  const { scene, enemy, healed } = makeScene()
  const shots = new ProjectileManager(scene)
  const fire = fromPlayer => {
    shots.fire(0, 0, 0, { faction: 'ally', fromPlayer, damage: 20, speed: 400 })
    shots.update(0.05)
  }
  fire(true)
  assert.equal(enemy.hp, 180)
  assert.equal(healed(), 10)
  fire(false)
  assert.equal(enemy.hp, 160)
  assert.equal(healed(), 10)
})

test('tower splash grants no lifesteal and overkill healing is capped', () => {
  const { scene, enemy, healed } = makeScene()
  const shots = new ProjectileManager(scene)
  enemy.x = 100
  shots.fire(0, 0, 0, {
    faction: 'ally', fromPlayer: false, damage: 20, speed: 1000,
    splash: 60, lobTo: { x: 100, y: 0 },
  })
  shots.update(0.3)
  assert.equal(enemy.hp, 180)
  assert.equal(healed(), 0)

  enemy.hp = 5
  scene.combat.killEnemy = () => {}
  scene.combat.damageEnemy(enemy, 100, 0, 0, 0, false, true)
  assert.equal(healed(), 2.5)
})
