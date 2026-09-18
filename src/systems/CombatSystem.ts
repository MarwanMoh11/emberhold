import { PAL } from '../config/palette'
import { rnd } from '../core/math'
import type { Enemy } from '../entities/Enemy'
import type { Targetable } from '../core/types'
import type { GameScene } from '../scenes/GameScene'

/**
 * The single funnel for every point of damage in the game. Keeping it in one
 * place means crits, lifesteal, floating numbers, kill rewards and combo
 * tracking can never get out of sync between the hero, towers and soldiers.
 */
export class CombatSystem {
  private scratch: Enemy[] = []
  private scratchA: Targetable[] = []

  kills = 0
  bossKills = 0

  constructor(private scene: GameScene) {}

  rollCrit(): boolean {
    return rnd() < this.scene.player.stats.critChance
  }

  damageEnemy(e: Enemy, amount: number, srcX: number, srcY: number, knockback = 0, crit = false, fromPlayer = true, showNumber = true) {
    if (!e.alive) return
    const dmg = Math.max(1, amount)
    const killed = e.applyDamage(dmg, srcX, srcY, knockback)
    if (showNumber) this.scene.fx.damage(e.x, e.y - e.radius - 16, Math.round(dmg), crit)
    if (fromPlayer && this.scene.player.stats.lifesteal > 0) {
      this.scene.player.heal(dmg * this.scene.player.stats.lifesteal)
    }
    this.scene.audio.playVaried(crit ? 'crit' : 'hit', crit ? 0.9 : 0.45)
    if (killed) this.killEnemy(e)
  }

  killEnemy(e: Enemy) {
    const def = e.def
    this.kills++
    if (def.boss) {
      this.bossKills++
      this.scene.bus.emit('boss:killed', { name: def.name })
    }

    this.scene.pickups.dropLoot(def, e.x, e.y, this.scene.player.stats.greed)

    if (def.explodes) {
      this.scene.fx.explosion(e.x, e.y, def.explodes.radius, 0xff9840)
      this.areaDamageAllies(e.x, e.y, def.explodes.radius, def.explodes.damage)
      this.scene.audio.playVaried('boom', 0.7)
      this.scene.fx.shake(0.008, 0.16)
    }

    this.scene.fx.deathBurst(e.x, e.y - e.radius * 0.5, def.colour, def.boss ? 3.5 : def.elite ? 1.8 : 1)
    if (def.boss) {
      this.scene.fx.explosion(e.x, e.y, 220, PAL.gold)
      this.scene.fx.shake(0.03, 0.7)
      this.scene.fx.flash(0xffffff, 0.2)
      this.scene.audio.play('boom', 0.5, 1.2)
      this.scene.fx.coinBurst(e.x, e.y, 40)
    } else {
      this.scene.audio.playVaried('enemyDie', 0.4)
    }

    this.scene.waves.notifyKilled(e.fromWave)
    this.scene.fx.registerKill(e.x, e.y)
    this.scene.bus.emit('enemy:killed', { key: def.key, x: e.x, y: e.y, boss: !!def.boss })
    this.scene.enemies.despawn(e)
  }

  damageAlly(t: Targetable, amount: number, srcX: number, srcY: number, knockback = 0) {
    if (!t.alive) return
    const killed = t.applyDamage(amount, srcX, srcY, knockback)
    if (t.kind !== 'player') {
      this.scene.fx.damage(t.x, t.y - t.radius - 14, Math.round(amount), false, '#ff9a8a')
    }
    if (killed) {
      if (t.kind === 'soldier') this.scene.army.onSoldierDied(t as never)
      else if (t.kind === 'worker') this.scene.workers.onWorkerDied(t as never)
      else if (t.kind === 'building') this.scene.buildings.onBuildingDestroyed(t as never)
    }
  }

  areaDamageEnemies(x: number, y: number, radius: number, amount: number, knockback = 0, crit = false, stun = 0, showNumbers = true) {
    const list = this.scene.enemies.grid.query(x, y, radius, this.scratch)
    // copy ids first: killing mutates the grid's arrays underneath us
    const snapshot = list.slice()
    for (const e of snapshot) {
      if (!e.alive) continue
      const falloff = 1 - Math.min(1, Math.hypot(e.x - x, e.y - y) / radius) * 0.35
      if (stun > 0) e.stun(stun)
      this.damageEnemy(e, amount * falloff, x, y, knockback, crit, true, showNumbers)
    }
    return snapshot.length
  }

  areaDamageAllies(x: number, y: number, radius: number, amount: number) {
    const list = this.scene.allyGrid.query(x, y, radius, this.scratchA)
    const snapshot = list.slice()
    for (const a of snapshot) {
      if (!a.alive) continue
      const falloff = 1 - Math.min(1, Math.hypot(a.x - x, a.y - y) / radius) * 0.4
      this.damageAlly(a, amount * falloff, x, y)
    }
  }

  healAllies(x: number, y: number, radius: number, amount: number) {
    const list = this.scene.allyGrid.query(x, y, radius, this.scratchA)
    for (const a of list) {
      if (!a.alive || a.kind === 'building') continue
      const before = a.hp
      a.hp = Math.min(a.maxHp, a.hp + amount)
      if (a.hp > before && a.kind !== 'player') {
        this.scene.fx.hitSpark(a.x, a.y - 16, PAL.good, 0.4)
      }
    }
  }
}
