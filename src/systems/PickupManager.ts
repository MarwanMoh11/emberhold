import type Phaser from 'phaser'
import { Pool } from '../core/Pool'
import { PICKUP } from '../config/balance'
import { PAL } from '../config/palette'
import { rr, chance } from '../core/math'
import type { ResourceType } from '../core/types'
import type { EnemyDef } from '../config/enemies'
import type { GameScene } from '../scenes/GameScene'

type PickupKind = ResourceType | 'xp' | 'heart' | 'chest'

interface Pickup {
  active: boolean
  kind: PickupKind
  amount: number
  x: number; y: number
  vx: number; vy: number
  z: number; vz: number
  life: number
  magnet: boolean
  /** true when this one is being pulled to the depot rather than the hero */
  toDepot: boolean
  magnetSpeed: number
  sprite: Phaser.GameObjects.Image
  spin: number
}

const TEX: Record<PickupKind, string> = {
  coins: 'res_coins', wood: 'res_wood', food: 'res_food', stone: 'res_stone',
  metal: 'res_metal', crystal: 'res_crystal', xp: 'res_xp', heart: 'res_heart', chest: 'chest',
}

const SFX: Partial<Record<PickupKind, string>> = {
  coins: 'coin', wood: 'wood', food: 'wood', stone: 'stone', metal: 'metal', crystal: 'metal',
}

/**
 * Loot on the ground with a short bounce, then magnetism into the hero.
 * This is the single most-repeated interaction in the game, so it gets a real
 * arc, a spin, a sound and a number rather than a silent counter tick.
 */
export class PickupManager {
  private pool: Pool<Pickup>

  constructor(private scene: GameScene) {
    this.pool = new Pool<Pickup>(() => {
      const sprite = scene.add.image(0, 0, 'res_coins').setVisible(false)
      scene.culler?.addMover(sprite) // test scenes have none
      return {
        active: false, kind: 'coins', amount: 1, x: 0, y: 0, vx: 0, vy: 0,
        z: 0, vz: 0, life: 0, magnet: false, toDepot: false, magnetSpeed: 0, sprite, spin: 0,
      }
    }, 220)
  }

  get activeCount() { return this.pool.activeCount }

  drop(kind: PickupKind, amount: number, x: number, y: number, power = 1) {
    if (this.pool.activeCount >= PICKUP.maxActive) return
    const p = this.pool.obtain()
    p.kind = kind
    p.amount = amount
    p.x = x; p.y = y
    p.vx = rr(-90, 90) * power
    p.vy = rr(-70, 70) * power
    p.z = 10
    p.vz = rr(90, 190) * power
    p.life = PICKUP.lifetime
    p.magnet = false
    p.toDepot = false
    p.magnetSpeed = 0
    p.spin = rr(-7, 7)
    p.sprite.setTexture(TEX[kind])
      .setVisible(true).setActive(true)
      .setPosition(x, y - p.z)
      .setScale(kind === 'chest' ? 1 : kind === 'xp' ? 0.9 : 0.95)
      .setAlpha(1)
      .setRotation(0)
      .setDepth(y)
  }

  /** Scatter a whole loot table from a dead enemy. */
  dropLoot(def: EnemyDef, x: number, y: number, greed: number) {
    const coins = Math.max(1, Math.round(def.coins * greed * rr(0.75, 1.3)))
    const stacks = Math.min(def.boss ? 26 : def.elite ? 8 : 4, Math.max(1, Math.round(coins / 8)))
    const per = Math.max(1, Math.round(coins / stacks))
    for (let i = 0; i < stacks; i++) this.drop('coins', per, x, y, def.boss ? 1.9 : 1)

    if (def.drops) {
      for (const d of def.drops) {
        if (!chance(d.chance)) continue
        const amt = Math.max(1, Math.round(d.amount * greed))
        const n = Math.min(10, Math.max(1, Math.round(amt / 10)))
        for (let i = 0; i < n; i++) this.drop(d.type, Math.ceil(amt / n), x, y, def.boss ? 1.8 : 1)
      }
    }

    const xpStacks = Math.min(def.boss ? 18 : 4, Math.max(1, Math.round(def.xp / 6)))
    for (let i = 0; i < xpStacks; i++) {
      this.drop('xp', Math.max(1, Math.round(def.xp / xpStacks)), x, y, def.boss ? 1.7 : 1)
    }

    if (chance(def.boss ? 1 : def.elite ? 0.25 : 0.022)) this.drop('heart', 1, x, y)
  }

  update(dt: number) {
    const player = this.scene.player
    const pr = player.stats.pickupRadius
    const pr2 = pr * pr
    const canCarry = !this.scene.res.carryFull
    // the depot sweeps up anything dropped near the settlement
    const depot = this.scene.buildings.depot
    const depotOn = depot.level > 0
    const depotR = (depot.stats.range ?? 160) * 2.2
    const depotR2 = depotR * depotR

    this.pool.forEachActive(p => {
      // A haul you cannot lift right now should still be there when you come
      // back for it. Ore mined with a full pack used to sit untouched and rot
      // out on the 60s timer, which reads as the game eating your work.
      const stranded = !canCarry && p.kind !== 'xp' && p.kind !== 'heart'
        && p.kind !== 'chest' && p.kind !== 'coins' && !p.toDepot
      if (!stranded) p.life -= dt
      if (p.life <= 0) {
        p.active = false
        p.sprite.setVisible(false)
        return
      }

      if (p.z > 0 || p.vz !== 0) {
        p.vz -= 900 * dt
        p.z += p.vz * dt
        if (p.z <= 0) { p.z = 0; p.vz = -p.vz * 0.34; if (Math.abs(p.vz) < 26) p.vz = 0 }
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vx -= p.vx * Math.min(1, dt * 4)
        p.vy -= p.vy * Math.min(1, dt * 4)
      }

      // depot pickup: runs when the hero is not already pulling this one in
      if (depotOn && !p.magnet && p.kind !== 'xp' && p.kind !== 'heart' && p.kind !== 'chest') {
        const ddx = depot.x - p.x, ddy = depot.y - p.y
        if (ddx * ddx + ddy * ddy < depotR2) p.toDepot = true
      }
      if (p.toDepot && !p.magnet) {
        const ddx = depot.x - p.x, ddy = depot.y - p.y
        const dd = Math.max(1, Math.hypot(ddx, ddy))
        p.magnetSpeed = Math.min(PICKUP.maxMagnetSpeed, p.magnetSpeed + PICKUP.magnetAccel * 0.5 * dt)
        p.x += (ddx / dd) * p.magnetSpeed * dt
        p.y += (ddy / dd) * p.magnetSpeed * dt
        if (dd < 30) {
          p.active = false
          p.sprite.setVisible(false)
          this.scene.res.addStored(p.kind as ResourceType, p.amount)
          this.scene.audio.play('deposit', 1.2, 0.3)
          return
        }
        p.sprite.setPosition(p.x, p.y - p.z).setDepth(p.y + 1)
        p.sprite.rotation += p.spin * dt
        return
      }

      if (player.alive) {
        const dx = player.x - p.x, dy = player.y - p.y
        const d2 = dx * dx + dy * dy
        // xp, hearts and coins always come to you; cargo needs pack space
        const allowed = p.kind === 'xp' || p.kind === 'heart' || p.kind === 'coins' || canCarry
        if (!p.magnet && allowed && d2 < pr2) {
          p.magnet = true
          p.toDepot = false
          p.magnetSpeed = 160
        }
        if (p.magnet) {
          if (!allowed) { p.magnet = false }
          else {
            const d = Math.max(1, Math.sqrt(d2))
            p.magnetSpeed = Math.min(PICKUP.maxMagnetSpeed, p.magnetSpeed + PICKUP.magnetAccel * dt)
            p.x += (dx / d) * p.magnetSpeed * dt
            p.y += (dy / d) * p.magnetSpeed * dt
            p.z += (Math.max(0, 14 - p.z)) * dt * 4
            if (d2 < 26 * 26) { this.collect(p); return }
          }
        }
      }

      p.spin *= 1 - dt * 0.8
      p.sprite.setPosition(p.x, p.y - p.z)
      p.sprite.setDepth(p.y + 1)
      p.sprite.rotation += p.spin * dt
      if (p.life < 3) p.sprite.setAlpha(0.35 + Math.sin(p.life * 22) * 0.35)
    })
  }

  private collect(p: Pickup) {
    p.active = false
    p.sprite.setVisible(false)
    const s = this.scene
    switch (p.kind) {
      case 'xp':
        s.player.addXp(p.amount)
        s.fx.hitSpark(s.player.x, s.player.y - 20, PAL.xp, 0.5)
        break
      case 'heart':
        s.player.heal(s.player.maxHp * 0.25)
        s.audio.play('chime', 1.2, 0.8)
        break
      case 'chest':
        s.openChest(p.x, p.y)
        break
      default: {
        const got = s.res.pickUp(p.kind, p.amount)
        if (got > 0) {
          s.audio.playVaried(SFX[p.kind] ?? 'coin', 0.55)
          s.fx.hitSpark(s.player.x, s.player.y - 22, p.kind === 'coins' ? PAL.coins : PAL[p.kind], 0.4)
        }
      }
    }
  }

  /** Used by debug + wave clear sweeps. */
  collectAllInRadius(x: number, y: number, r: number) {
    const r2 = r * r
    this.pool.forEachActive(p => {
      const dx = p.x - x, dy = p.y - y
      if (dx * dx + dy * dy < r2) p.magnet = true
    })
  }
}
