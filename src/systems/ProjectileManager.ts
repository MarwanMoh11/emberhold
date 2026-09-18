import type Phaser from 'phaser'
import { Pool } from '../core/Pool'
import { PERF, WORLD } from '../config/balance'
import type { Enemy } from '../entities/Enemy'
import type { Targetable } from '../core/types'
import type { GameScene } from '../scenes/GameScene'

export type Faction = 'ally' | 'enemy'

interface Projectile {
  active: boolean
  faction: Faction
  x: number; y: number
  vx: number; vy: number
  damage: number
  crit: boolean
  knockback: number
  pierce: number
  splash: number
  life: number
  spin: number
  trail: boolean
  tint: number
  /** arcing shells land at a point instead of hitting the first thing they touch */
  lobTo: { x: number; y: number } | null
  lobT: number
  lobDur: number
  lobZ: number
  hit: Set<number>
  sprite: Phaser.GameObjects.Image
  onLand: ((x: number, y: number) => void) | null
}

export interface FireOpts {
  tex?: string
  tint?: number
  damage: number
  crit?: boolean
  knockback?: number
  pierce?: number
  splash?: number
  speed: number
  faction: Faction
  spin?: number
  trail?: boolean
  scale?: number
  /** lobbed shot: travels to a fixed point and detonates */
  lobTo?: { x: number; y: number }
  onLand?: (x: number, y: number) => void
}

export class ProjectileManager {
  private pool: Pool<Projectile>
  private scratchE: Enemy[] = []
  private scratchA: Targetable[] = []

  constructor(private scene: GameScene) {
    this.pool = new Pool<Projectile>(() => {
      const sprite = scene.add.image(0, 0, 'proj_arrow').setVisible(false)
      return {
        active: false, faction: 'ally', x: 0, y: 0, vx: 0, vy: 0, damage: 0, crit: false,
        knockback: 0, pierce: 0, splash: 0, life: 0, spin: 0, trail: false, tint: 0xffffff,
        lobTo: null, lobT: 0, lobDur: 0, lobZ: 0, hit: new Set(), sprite, onLand: null,
      }
    }, 140)
  }

  get activeCount() { return this.pool.activeCount }

  fire(x: number, y: number, angle: number, o: FireOpts) {
    if (this.pool.activeCount >= PERF.maxProjectiles) return
    const p = this.pool.obtain()
    p.faction = o.faction
    p.x = x; p.y = y
    p.damage = o.damage
    p.crit = o.crit ?? false
    p.knockback = o.knockback ?? 0
    p.pierce = o.pierce ?? 0
    p.splash = o.splash ?? 0
    p.spin = o.spin ?? 0
    p.trail = o.trail ?? false
    p.tint = o.tint ?? 0xffffff
    p.hit.clear()
    p.onLand = o.onLand ?? null
    p.lobTo = o.lobTo ?? null

    if (p.lobTo) {
      const d = Math.hypot(p.lobTo.x - x, p.lobTo.y - y)
      p.lobDur = Math.max(0.28, d / o.speed)
      p.lobT = 0
      p.vx = (p.lobTo.x - x) / p.lobDur
      p.vy = (p.lobTo.y - y) / p.lobDur
      p.life = p.lobDur + 0.05
    } else {
      p.vx = Math.cos(angle) * o.speed
      p.vy = Math.sin(angle) * o.speed
      p.life = 2.2
    }

    p.sprite.setTexture(o.tex ?? 'proj_arrow')
      .setVisible(true).setActive(true)
      .setPosition(x, y).setRotation(angle).setAlpha(1)
      .setScale(o.scale ?? 1).setTint(p.tint).setDepth(y + 40)
  }

  update(dt: number) {
    const enemies = this.scene.enemies
    const combat = this.scene.combat

    this.pool.forEachActive(p => {
      p.life -= dt
      if (p.life <= 0) { this.land(p); return }

      const px = p.x, py = p.y
      p.x += p.vx * dt
      p.y += p.vy * dt

      if (p.lobTo) {
        p.lobT += dt
        const t = Math.min(1, p.lobT / p.lobDur)
        p.lobZ = Math.sin(t * Math.PI) * 120
        p.sprite.setPosition(p.x, p.y - p.lobZ).setDepth(p.y + 60)
        p.sprite.rotation += (p.spin || 9) * dt
        p.sprite.setScale(1 + p.lobZ / 260)
        if (t >= 1) { this.land(p) }
        return
      }

      if (p.x < -60 || p.x > WORLD.width + 60 || p.y < -60 || p.y > WORLD.height + 60) {
        p.active = false; p.sprite.setVisible(false); return
      }

      p.sprite.setPosition(p.x, p.y).setDepth(p.y + 40)
      if (p.spin) p.sprite.rotation += p.spin * dt

      // swept check against the segment we just travelled
      const midX = (px + p.x) / 2, midY = (py + p.y) / 2
      const reach = Math.max(18, Math.hypot(p.x - px, p.y - py) * 0.6 + 14)

      if (p.faction === 'ally') {
        const list = enemies.grid.query(midX, midY, reach, this.scratchE)
        for (let i = 0; i < list.length; i++) {
          const e = list[i]
          if (!e.alive || p.hit.has(e.id)) continue
          if (Math.hypot(e.x - midX, e.y - midY) > reach + e.radius * 0.8) continue
          p.hit.add(e.id)
          combat.damageEnemy(e, p.damage, p.x, p.y, p.knockback, p.crit)
          if (p.splash > 0) { this.land(p); return }
          this.scene.fx.hitSpark(p.x, p.y, p.tint, 0.7)
          if (p.pierce <= 0) { p.active = false; p.sprite.setVisible(false); return }
          p.pierce--
          p.damage *= 0.86
        }
      } else {
        const list = this.scene.allyGrid.query(midX, midY, reach, this.scratchA)
        for (let i = 0; i < list.length; i++) {
          const a = list[i]
          if (!a.alive || p.hit.has(a.id)) continue
          if (a.kind === 'building') continue // arrows sail over structures
          if (Math.hypot(a.x - midX, a.y - midY) > reach + a.radius * 0.8) continue
          p.hit.add(a.id)
          combat.damageAlly(a, p.damage, p.x, p.y, p.knockback)
          this.scene.fx.hitSpark(p.x, p.y, 0xffd8c8, 0.6)
          p.active = false; p.sprite.setVisible(false); return
        }
      }
    })
  }

  private land(p: Projectile) {
    p.active = false
    p.sprite.setVisible(false)
    const x = p.lobTo ? p.lobTo.x : p.x
    const y = p.lobTo ? p.lobTo.y : p.y
    if (p.splash > 0) {
      this.scene.fx.explosion(x, y, p.splash, p.tint)
      this.scene.audio.playVaried('boom', 0.5)
      if (p.faction === 'ally') {
        this.scene.combat.areaDamageEnemies(x, y, p.splash, p.damage, 180, p.crit)
      } else {
        this.scene.combat.areaDamageAllies(x, y, p.splash, p.damage)
      }
    }
    p.onLand?.(x, y)
  }
}
