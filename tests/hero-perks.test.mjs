import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const perks = await loadTs('src/systems/heroPerks.ts')
const { UPGRADE_BY_ID } = await loadTs('src/config/upgrades.ts')
const { Player, freshStats } = await loadTs('src/entities/Player.ts')
const { LevelSystem } = await loadTs('src/systems/LevelSystem.ts')
const { CombatSystem } = await loadTs('src/systems/CombatSystem.ts')

const NEW = ['thorns', 'executioner', 'chainSpark', 'lastStand', 'bountyHunter', 'adrenaline']
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`)
const noop = () => {}

test('thornmail reflects a share of the blow per rank, and nothing without the pick', () => {
  close(perks.thornsDamage(20, 1), 7)
  close(perks.thornsDamage(20, 3), 21)
  assert.equal(perks.thornsDamage(20, 0), 0)
  assert.equal(perks.thornsDamage(0, 2), 0)
})

test('executioner multiplies hero damage only below 30% health', () => {
  close(perks.executeMult(0.29, 1), 1.4)
  close(perks.executeMult(0.1, 3), 2.2)
  assert.equal(perks.executeMult(0.3, 3), 1)
  assert.equal(perks.executeMult(0.1, 0), 1)
})

test('chain spark: 15% a rank up to certainty, and an arc carries 60% of the hit', () => {
  close(perks.chainChance(1), 0.15)
  close(perks.chainChance(3), 0.45)
  assert.equal(perks.chainChance(0), 0)
  assert.equal(perks.chainChance(20), 1)
  close(perks.chainDamage(50), 30)
  assert.equal(perks.CHAIN_RANGE, 160)
})

test('bounty hunter pays +50% a rank on health-bar foes only', () => {
  close(perks.bountyMult(true, 1), 1.5)
  close(perks.bountyMult(true, 2), 2)
  assert.equal(perks.bountyMult(false, 2), 1)
  assert.equal(perks.bountyMult(true, 0), 1)
})

test('adrenaline speeds the hero up only under 40% health', () => {
  assert.deepEqual(perks.adrenalineMults(0.4, 2), { attack: 1, move: 1 })
  const low = perks.adrenalineMults(0.39, 1)
  close(low.attack, 1.3)
  close(low.move, 1.15)
  const two = perks.adrenalineMults(0.1, 2)
  close(two.attack, 1.6)
  close(two.move, 1.3)
  assert.deepEqual(perks.adrenalineMults(0.1, 0), { attack: 1, move: 1 })
})

test('last stand leaves the hero at 30% of max health, never below 1', () => {
  assert.equal(perks.lastStandHp(200), 60)
  assert.equal(perks.lastStandHp(1), 1)
})

test('each new pick caps at its stacks, and its apply sets only its own stat', () => {
  const caps = { thorns: 3, executioner: 3, chainSpark: 3, lastStand: 1, bountyHunter: 2, adrenaline: 2 }
  for (const id of NEW) {
    const def = UPGRADE_BY_ID.get(id)
    assert.equal(def.maxStacks, caps[id], `${id} stacks`)
    assert.ok(def.weight >= 6 && def.weight <= 9, `${id} weight`)
    assert.ok(!def.evergreen, `${id} is a finite pick`)
    const s = freshStats()
    assert.equal(s[id], 0, `${id} is neutral by default`)
    def.apply(s, 1)
    assert.equal(s[id], 1, `${id} at rank 1`)
    if (caps[id] > 1) {
      def.apply(s, 2)
      assert.equal(s[id], 2, `${id} at rank 2`)
    }
    for (const other of NEW) if (other !== id) assert.equal(s[other], 0, `${id} leaked into ${other}`)
  }
})

test('the six picks each have a card colour of their own', () => {
  const colours = NEW.map(id => UPGRADE_BY_ID.get(id).colour)
  assert.equal(new Set(colours).size, NEW.length)
})

test('picks replay from a save to the same stats, capped at their stacks', () => {
  const scene = { player: { stats: freshStats(), syncStats: noop } }
  const lv = new LevelSystem(scene)
  lv.load([['thorns', 2], ['lastStand', 4], ['adrenaline', 9], ['chainSpark', 1]])
  assert.equal(scene.player.stats.thorns, 2)
  assert.equal(scene.player.stats.lastStand, 1)
  assert.equal(scene.player.stats.adrenaline, 2)
  assert.equal(scene.player.stats.chainSpark, 1)
  assert.equal(lv.stacks('adrenaline'), 2)
})

/** A hero, some foes and the scene bits that combat reads. Kills are recorded, not run. */
function arena({ stats = {}, foes = [] } = {}) {
  const beams = []
  const killed = []
  const hero = {
    kind: 'player', id: 1, x: 0, y: 0, radius: 15, alive: true, hp: 100, maxHp: 100, lastBlow: 0,
    stats: { armor: 0, lifesteal: 0, ...stats },
    heal: noop,
    applyDamage(n) { this.lastBlow = n; this.hp -= n; return this.hp <= 0 },
  }
  const scene = {
    player: hero,
    enemies: { grid: { query: (_x, _y, _r, out) => { out.length = 0; out.push(...foes); return out } } },
    fx: { damage: noop, beam: (...args) => beams.push(args) },
    audio: { playVaried: noop },
  }
  const combat = new CombatSystem(scene)
  combat.killEnemy = e => { killed.push(e); e.alive = false }
  return { combat, hero, beams, killed }
}
const foe = (id, x, hp, maxHp = hp) => ({
  id, x, y: 0, radius: 12, alive: true, shielded: false, hp, maxHp,
  applyDamage(n) { this.hp -= n; return this.hp <= 0 },
})

test('thornmail: a melee blow on the hero is paid back, a share per rank', () => {
  const { combat, hero } = arena({ stats: { thorns: 2 } })
  const attacker = foe(1, 40, 50)
  combat.damageAlly(hero, 20, 40, 0, 0, attacker)
  assert.equal(hero.hp, 80)
  close(attacker.hp, 50 - 20 * 0.35 * 2)
  const before = attacker.hp
  combat.damageAlly(hero, 20, 40, 0)
  assert.equal(attacker.hp, before, 'a hit with no melee attacker pays nothing back')
  const plain = arena({})
  const bystander = foe(2, 40, 50)
  plain.combat.damageAlly(plain.hero, 20, 40, 0, 0, bystander)
  assert.equal(bystander.hp, 50, 'without the pick nothing is reflected')
})

test('executioner: hero blows on a foe under 30% health hit harder', () => {
  const { combat } = arena({ stats: { executioner: 1 } })
  const hurt = foe(1, 0, 20, 100)
  combat.damageEnemy(hurt, 10, 0, 0, 0, false, true)
  close(hurt.hp, 20 - 14)
  const healthy = foe(2, 0, 80, 100)
  combat.damageEnemy(healthy, 10, 0, 0, 0, false, true)
  close(healthy.hp, 70)
})

test('chain spark: a hit can arc to the nearest foe in reach, for 60%, and arcs never arc', () => {
  const a = foe(1, 0, 1e6)
  const near = foe(2, 100, 1e6)
  const far = foe(3, 400, 1e6)
  const { combat, beams } = arena({ stats: { chainSpark: 3 }, foes: [a, near, far] })
  for (let i = 0; i < 300; i++) combat.damageEnemy(a, 10, 0, 0, 0, false, true)
  assert.ok(beams.length > 0, 'some hits arc')
  assert.ok(beams.length <= 300, 'no arc sets off another arc')
  assert.equal(far.hp, 1e6, 'a foe out of reach is never chained to')
  close(1e6 - near.hp, beams.length * 6)
})

/** A hero built without the constructor: just the fields a blow reads. */
function heroAt(hp, lastStand = 0) {
  const hero = Object.create(Player.prototype)
  const fx = { ring: noop, flash: noop, popup: noop, shake: noop, deathBurst: noop }
  hero.scene = { now: 0, fx, audio: { playVaried: noop, play: noop }, bus: { emit: noop } }
  hero.container = { setVisible() { return this } }
  Object.assign(hero, {
    alive: true, maxHp: 200, hp, x: 0, y: 0, hurtCd: 0, dodgeTime: 0, respawnShieldT: 0,
    invincible: false, lastBlow: 0, lastStandReady: true, lastStandT: 0,
  })
  hero.stats = { ...freshStats(), armor: 0, lastStand }
  return hero
}

test('last stand: a fatal blow leaves the hero at 30%, once, and untouchable for 2 s', () => {
  const hero = heroAt(40, 1)
  assert.equal(hero.applyDamage(60, 0, 0), false)
  assert.equal(hero.alive, true)
  assert.equal(hero.hp, 60)
  assert.equal(hero.lastBlow, 60)
  assert.equal(hero.lastStandReady, false)
  assert.equal(hero.applyDamage(60, 0, 0), false, 'inside the two seconds')
  assert.equal(hero.hp, 60)
  assert.equal(hero.lastBlow, 0, 'an untouchable hit is never reflected')
  hero.lastStandT = 0
  assert.equal(hero.applyDamage(100, 0, 0), true, 'the charge is spent, so the next fatal blow kills')
  assert.equal(hero.alive, false)
})

test('without the pick a fatal blow kills, and a survivable one keeps the charge', () => {
  assert.equal(heroAt(40, 0).applyDamage(60, 0, 0), true)
  const hero = heroAt(100, 1)
  assert.equal(hero.applyDamage(30, 0, 0), false)
  assert.equal(hero.lastStandReady, true)
  assert.equal(hero.hp, 70)
})
