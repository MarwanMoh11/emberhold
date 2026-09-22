import Phaser from 'phaser'
import { Enemy } from '../entities/Enemy'
import { ENEMIES, type EnemyKey } from '../config/enemies'
import { PERF, WORLD } from '../config/balance'
import { MAX_ENEMIES } from '../core/device'
import { PAL } from '../config/palette'
import { WALL_RING } from '../config/map'
import { Grid } from '../core/Grid'
import { clamp, rr } from '../core/math'
import type { Targetable } from '../core/types'
import type { GameScene } from '../scenes/GameScene'

/**
 * Hundreds of enemies, one flat loop. The three things that keep it cheap:
 *  - no physics bodies, all proximity through the spatial grid
 *  - target re-acquisition is staggered across frames per enemy
 *  - separation is capped to a handful of neighbours
 */
export class EnemyManager {
  readonly list: Enemy[] = []
  grid = new Grid<Enemy>(PERF.gridCell)

  private free: Enemy[] = []
  private scratch: Enemy[] = []
  private bars: Phaser.GameObjects.Graphics
  private frame = 0

  aliveCount = 0
  /** alive enemies excluding stationary camps — this is what "wave cleared" means */
  walkerCount = 0
  bossRef: Enemy | null = null

  constructor(private scene: GameScene, depth: number) {
    this.bars = scene.add.graphics().setDepth(depth)
  }

  get count() { return this.aliveCount }

  spawn(key: EnemyKey, x: number, y: number, hpMult = 1, dmgMult = 1): Enemy | null {
    if (this.aliveCount >= MAX_ENEMIES) return null
    const def = ENEMIES[key]
    let e = this.free.pop()
    if (!e) {
      if (this.list.length >= MAX_ENEMIES + 40) return null
      e = new Enemy(this.scene)
      this.list.push(e)
    }
    e.spawn(def, clamp(x, 40, WORLD.width - 40), clamp(y, 40, WORLD.height - 40), hpMult, dmgMult)
    this.aliveCount++
    if (def.boss) {
      this.bossRef = e
      this.scene.bus.emit('boss:spawned', { name: def.name })
    }
    this.scene.tweens.add({ targets: e.sprite, scale: 1, duration: 260, ease: 'Back.easeOut' })
    return e
  }

  despawn(e: Enemy) {
    if (!e.active) return
    e.release()
    this.free.push(e)
    this.aliveCount = Math.max(0, this.aliveCount - 1)
    if (this.bossRef === e) this.bossRef = null
  }

  killAll() {
    for (const e of this.list) {
      if (e.active && e.alive) this.scene.combat.killEnemy(e)
    }
  }

  /** Clear a failed night without awarding kills or erasing standing camps. */
  clearWalkers() {
    for (const e of this.list) {
      if (e.active && !e.def.structure) this.despawn(e)
    }
  }

  /** Damage everything at once — used by the wave-clear sweep. */
  forEachAlive(fn: (e: Enemy) => void) {
    for (const e of this.list) if (e.active && e.alive) fn(e)
  }

  // ---- targeting -------------------------------------------------------
  private acquire(e: Enemy): Targetable | null {
    const s = this.scene
    const prefs = e.def.prefers
    let t: Targetable | null = null

    if (prefs === 'player') {
      t = s.player.alive ? s.player : null
    } else if (prefs === 'workers') {
      t = s.allyGrid.nearest(e.x, e.y, 620, a => a.alive && a.kind === 'worker')
    } else if (prefs === 'structures') {
      t = s.buildings.nearestStructure(e.x, e.y, 560, true)
    }

    if (!t) t = s.allyGrid.nearest(e.x, e.y, 440, a => a.alive && a.kind !== 'building')
    if (!t) t = s.buildings.nearestStructure(e.x, e.y, 700, prefs === 'structures')
    if (!t) {
      const hall = s.buildings.townHall
      t = hall && hall.level > 0 && hall.alive ? hall : (s.player.alive ? s.player : null)
    }
    return t
  }

  private nearestGate(x: number, y: number) {
    let best = WALL_RING.gates[0]
    let bd = Infinity
    for (const g of WALL_RING.gates) {
      const d = (g.x - x) ** 2 + (g.y - y) ** 2
      if (d < bd) { bd = d; best = g }
    }
    return best
  }

  // ---- main loop -------------------------------------------------------
  update(dt: number) {
    this.frame++
    this.grid.clear()

    const list = this.list
    this.walkerCount = 0
    let nearestBoss: Enemy | null = null
    let nearestBossD2 = Infinity
    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      if (e.active && e.alive) {
        this.grid.insert(e)
        if (!e.def.structure) this.walkerCount++
        if (e.def.boss) {
          const dx = e.x - this.scene.player.x
          const dy = e.y - this.scene.player.y
          const d2 = dx * dx + dy * dy
          if (d2 < nearestBossD2) { nearestBossD2 = d2; nearestBoss = e }
        }
      }
    }
    // More than one boss can be alive when a night begins during the finale.
    // Show the one the player is actually fighting in the single HUD bar.
    this.bossRef = nearestBoss

    // commander auras: few of them, so a direct pass is fine
    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      if (!e.active || !e.alive || !e.def.aura) continue
      const near = this.grid.query(e.x, e.y, e.def.aura.radius, this.scratch)
      for (let k = 0; k < near.length; k++) {
        const o = near[k]
        o.auraDamage = e.def.aura.damageMult
        o.auraSpeed = e.def.aura.speedMult
        o.auraT = 0.5
      }
    }

    const combat = this.scene.combat

    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      if (!e.active) continue
      if (!e.alive) { this.despawn(e); continue }

      if (e.spawnT > 0) e.spawnT -= dt
      if (e.auraT > 0) {
        e.auraT -= dt
        if (e.auraT <= 0) { e.auraDamage = 1; e.auraSpeed = 1 }
      }

      // damage over time
      if (e.burnT > 0) {
        e.burnT -= dt
        const tick = e.burnDps * dt
        e.hp -= tick
        if (this.frame % 12 === 0) this.scene.fx.embers(e.x, e.y - e.radius, 1)
        if (e.hp <= 0) { e.alive = false; combat.killEnemy(e); continue }
      }
      if (e.slowT > 0) e.slowT -= dt

      // knockback decay
      if (e.kx !== 0 || e.ky !== 0) {
        const d = Math.min(1, dt * 7.5)
        e.x += e.kx * dt
        e.y += e.ky * dt
        e.kx -= e.kx * d
        e.ky -= e.ky * d
        if (Math.abs(e.kx) < 4) e.kx = 0
        if (Math.abs(e.ky) < 4) e.ky = 0
      }

      // stationary objectives (enemy camps) skip all steering
      if (e.def.structure) {
        e.sprite.setPosition(e.x, e.y).setDepth(e.y)
        if (e.flashT > 0) {
          e.flashT -= dt
          e.sprite.setTintFill(0xffffff)
          if (e.flashT <= 0) e.sprite.clearTint()
        }
        continue
      }

      if (e.stunT > 0) {
        e.stunT -= dt
        if (e.stunT <= 0) e.state = 'move'
        this.render(e, dt, true)
        continue
      }

      if (e.chargeT > 0) {
        this.moveBossCharge(e, dt)
        continue
      }

      // staggered re-target
      e.retargetIn -= dt
      if (e.retargetIn <= 0 || !e.target || !e.target.alive) {
        e.target = this.acquire(e)
        e.retargetIn = 0.35 + (e.id % 7) * 0.05
      }

      const t = e.target
      if (!t) { this.render(e, dt); continue }

      const dx = t.x - e.x
      const dy = t.y - e.y
      const d = Math.hypot(dx, dy) || 1
      const reach = e.range + t.radius + e.radius * 0.4

      if (e.def.boss) {
        this.bossUpdate(e, dt, d)
        // A ground warning must stay under the attack that follows it.
        if (e.telegraphT > 0) {
          e.vx = e.vy = 0
          e.state = 'attack'
          this.render(e, dt)
          continue
        }
      }

      if (d <= reach) {
        e.state = 'attack'
        e.attackCd -= dt
        if (e.attackCd <= 0) {
          e.attackCd = 1 / Math.max(0.1, e.attackRate)
          this.strike(e, t)
        }
        // drift to keep a loose ring instead of stacking on one point
        e.vx = -dx / d * 12
        e.vy = -dy / d * 12
      } else {
        e.state = 'move'
        const speedMul = e.auraSpeed * (e.slowT > 0 ? 0.55 : 1) * (e.chargeT > 0 ? 2.6 : 1)
        let mx = dx / d
        let my = dy / d

        // walls: sappers smash, the rest flow toward a gap
        const nx = e.x + mx * e.radius * 2.2
        const ny = e.y + my * e.radius * 2.2
        const blocker = this.scene.buildings.blockerAt(nx, ny, e.radius)
        if (blocker && blocker.id !== t.id) {
          if (e.sapper || blocker.key !== 'wall') {
            e.target = blocker
          } else {
            const g = this.nearestGate(e.x, e.y)
            const gx = g.x - e.x, gy = g.y - e.y
            const gd = Math.hypot(gx, gy) || 1
            mx = mx * 0.25 + (gx / gd) * 0.9
            my = my * 0.25 + (gy / gd) * 0.9
            const ml = Math.hypot(mx, my) || 1
            mx /= ml; my /= ml
          }
        }

        const sp = e.speed * speedMul
        e.vx += (mx * sp - e.vx) * Math.min(1, dt * 9)
        e.vy += (my * sp - e.vy) * Math.min(1, dt * 9)
      }

      // separation against a handful of neighbours
      const near = this.grid.query(e.x, e.y, e.radius * 2.4, this.scratch)
      const lim = Math.min(near.length, PERF.separationNeighbours)
      let sx = 0, sy = 0
      for (let k = 0; k < lim; k++) {
        const o = near[k]
        if (o === e) continue
        const ox = e.x - o.x, oy = e.y - o.y
        const od = ox * ox + oy * oy
        if (od < 0.01) { sx += rr(-1, 1); sy += rr(-1, 1); continue }
        const want = (e.radius + o.radius) * 0.92
        if (od < want * want) {
          const dd = Math.sqrt(od)
          const push = (want - dd) / want
          sx += (ox / dd) * push
          sy += (oy / dd) * push
        }
      }
      if (sx !== 0 || sy !== 0) {
        e.x += sx * 62 * dt
        e.y += sy * 62 * dt
      }

      e.x = clamp(e.x + e.vx * dt, 20, WORLD.width - 20)
      e.y = clamp(e.y + e.vy * dt, 20, WORLD.height - 20)

      if (Math.abs(e.vx) > 6) e.facing = e.vx > 0 ? 1 : -1
      if (e.key === 'cinderRegent' && this.frame % 10 === 0
        && Phaser.Geom.Rectangle.Contains(this.scene.cameras.main.worldView, e.x, e.y)) {
        this.scene.fx.embers(e.x + rr(-24, 24), e.y - e.radius * 1.6, 2)
      }
      this.render(e, dt)
    }

    // players and towers can be swarmed off-screen — let the HUD know
    this.drawBars()
  }

  private strike(e: Enemy, t: Targetable) {
    const dmg = e.damage * e.auraDamage
    const ang = Math.atan2(t.y - e.y, t.x - e.x)
    if (e.def.ranged) {
      this.scene.projectiles.fire(
        e.x + Math.cos(ang) * 14, e.y - e.radius * 0.5 + Math.sin(ang) * 14, ang,
        {
          tex: 'proj_enemyArrow', damage: dmg, speed: e.def.projectileSpeed ?? 380,
          faction: 'enemy', fromPlayer: false, knockback: 20,
        },
      )
      this.scene.audio.playVaried('shoot', 0.18)
    } else {
      this.scene.combat.damageAlly(t, dmg, e.x, e.y, e.def.boss ? 220 : 40)
      this.scene.fx.slash(
        e.x + Math.cos(ang) * (e.radius + 6), e.y - e.radius * 0.6 + Math.sin(ang) * 8,
        ang, e.def.boss ? 1.6 : 0.7, e.def.colour,
      )
      if (e.def.boss) this.scene.fx.shake(0.01, 0.14)
    }
  }

  // ---- boss behaviour ---------------------------------------------------
  private moveBossCharge(e: Enemy, dt: number) {
    e.chargeT = Math.max(0, e.chargeT - dt)
    e.x = clamp(e.x + e.chargeVX * dt, 20, WORLD.width - 20)
    e.y = clamp(e.y + e.chargeVY * dt, 20, WORLD.height - 20)
    const near = this.scene.allyGrid.query(e.x, e.y, e.radius + 48, [])
    for (const ally of near) {
      if (e.chargeHits.has(ally.id) || Math.hypot(ally.x - e.x, ally.y - e.y) > e.radius + ally.radius + 8) continue
      e.chargeHits.add(ally.id)
      this.scene.combat.damageAlly(ally, e.damage * 1.45, e.x, e.y, 260)
      this.scene.fx.hitSpark(ally.x, ally.y - 12, PAL.danger, 2)
    }
    if (e.chargeT <= 0) {
      e.vx = e.chargeVX * 0.18
      e.vy = e.chargeVY * 0.18
    }
    this.render(e, dt)
  }

  private bossUpdate(e: Enemy, dt: number, distToTarget: number) {
    e.bossTimer -= dt
    const hpFrac = e.hp / e.maxHp

    // phase flip at half health
    if (e.bossPhase === 0 && hpFrac < 0.5) {
      e.bossPhase = 1
      e.attackRate *= 1.35
      e.speed *= 1.25
      this.scene.fx.ring(e.x, e.y - 20, 240, PAL.danger, 0.6)
      this.scene.fx.popup(e.x, e.y - e.radius - 46, 'ENRAGED', PAL.danger, 26)
      this.scene.audio.play('bossRoar', 1.15)
      this.scene.fx.shake(0.018, 0.5)
    }

    if (e.telegraphT > 0) {
      e.telegraphT -= dt
      if (e.telegraphT <= 0) this.bossRelease(e)
      return
    }
    if (e.bossTimer > 0) return

    e.bossTimer = e.def.key === 'cinderRegent' ? rr(3.8, 5.4)
      : e.def.key === 'warlord' ? rr(4.5, 7) : rr(5, 8)

    if (e.def.key === 'siegeBeast') {
      if (distToTarget > 220) {
        // lobbed boulder
        const t = e.target
        if (!t) return
        this.scene.fx.warningCircle(t.x, t.y, 96, PAL.danger,
          Math.max(0.28, Math.hypot(t.x - e.x, t.y - e.y) / 420))
        this.scene.projectiles.fire(e.x, e.y - e.radius, 0, {
          tex: 'proj_rock', damage: e.damage * 1.6, speed: 420, faction: 'enemy', fromPlayer: false,
          splash: 96, spin: 6, lobTo: { x: t.x, y: t.y },
        })
        this.scene.fx.popup(e.x, e.y - e.radius - 40, 'BOULDER', PAL.danger, 16)
        this.scene.audio.play('boom', 0.7, 0.6)
      } else {
        e.bossAttack = 'slam'
        e.telegraphT = 0.9
        this.scene.fx.warningCircle(e.x, e.y, 190, PAL.danger, e.telegraphT)
        this.scene.fx.popup(e.x, e.y - e.radius - 40, 'SLAM!', PAL.danger, 20)
      }
    } else if (e.def.key === 'cinderRegent') {
      const t = e.target
      if (!t) return
      if (distToTarget > 155 || Math.random() < 0.55) {
        e.bossAttack = 'cinderVolley'
        e.telegraphT = e.bossPhase ? 1.0 : 1.25
        e.bossAimX = t.x
        e.bossAimY = t.y
        const angle = Math.atan2(t.y - e.y, t.x - e.x)
        const ox = -Math.sin(angle) * 88
        const oy = Math.cos(angle) * 88
        const flight = Math.max(0.28, Math.hypot(t.x - e.x, t.y - e.y) / 1800)
        for (const offset of [-1, 0, 1]) {
          this.scene.fx.warningCircle(t.x + ox * offset, t.y + oy * offset,
            70, PAL.danger, e.telegraphT + flight)
        }
        this.scene.fx.popup(e.x, e.y - e.radius - 40, 'CINDER RAIN', PAL.danger, 20)
      } else {
        e.bossAttack = 'cinderNova'
        e.telegraphT = e.bossPhase ? 0.85 : 1.1
        this.scene.fx.warningCircle(e.x, e.y, 225, PAL.danger, e.telegraphT)
        this.scene.fx.popup(e.x, e.y - e.radius - 40, 'FIRESTORM', PAL.danger, 20)
      }
      this.scene.audio.play('bossRoar', 0.8, 0.6)
    } else if (e.def.key === 'warlord') {
      const roll = Math.random()
      if (roll < 0.4 && distToTarget > 200) {
        // telegraphed charge
        e.bossAttack = 'charge'
        e.telegraphT = 0.7
        const aimX = e.target?.x ?? e.x
        const aimY = e.target?.y ?? e.y
        const aimD = Math.max(1, Math.hypot(aimX - e.x, aimY - e.y))
        const travel = Math.min(aimD, e.speed * 4.2 * 1.2)
        e.bossAimX = e.x + (aimX - e.x) / aimD * travel
        e.bossAimY = e.y + (aimY - e.y) / aimD * travel
        const line = this.scene.add.graphics().setDepth(e.y - 1)
        line.lineStyle(e.radius * 2 + 24, PAL.danger, 0.14)
        line.lineBetween(e.x, e.y, e.bossAimX, e.bossAimY)
        line.lineStyle(4, PAL.danger, 0.8)
        line.lineBetween(e.x, e.y, e.bossAimX, e.bossAimY)
        this.scene.tweens.add({ targets: line, alpha: 0, duration: 700, onComplete: () => line.destroy() })
        this.scene.fx.warningCircle(e.bossAimX, e.bossAimY, e.radius + 30, PAL.danger, e.telegraphT)
        this.scene.fx.popup(e.x, e.y - e.radius - 40, 'CHARGE!', PAL.danger, 20)
        this.scene.fx.ring(e.x, e.y, 120, PAL.gold, 0.7)
      } else if (roll < 0.75) {
        // call reinforcements
        const n = 5 + e.bossPhase * 4
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2
          this.spawn(i % 3 === 0 ? 'runner' : 'grunt', e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 70)
        }
        this.scene.fx.ring(e.x, e.y, 180, PAL.enemyCommander, 0.6)
        this.scene.fx.popup(e.x, e.y - e.radius - 40, 'TO ME!', PAL.enemyCommander, 20)
        this.scene.audio.play('horn', 1.4, 0.7)
      } else {
        e.bossAttack = 'shockwave'
        e.telegraphT = 0.9
        this.scene.fx.warningCircle(e.x, e.y, 240, PAL.danger, e.telegraphT)
        this.scene.fx.popup(e.x, e.y - e.radius - 40, 'SHOCKWAVE', PAL.danger, 20)
      }
    }
  }

  private bossRelease(e: Enemy) {
    const attack = e.bossAttack
    e.bossAttack = null
    e.attackCd = Math.max(e.attackCd, 0.8)
    if (attack === 'slam') {
      this.scene.fx.explosion(e.x, e.y, 190, 0xd4a05a)
      this.scene.combat.areaDamageAllies(e.x, e.y, 190, e.damage * 1.8)
      this.scene.fx.shake(0.025, 0.4)
      this.scene.audio.play('boom', 0.5, 1.2)
    } else if (attack === 'charge') {
        const ang = Math.atan2(e.bossAimY - e.y, e.bossAimX - e.x)
        e.chargeVX = Math.cos(ang) * e.speed * 4.2
        e.chargeVY = Math.sin(ang) * e.speed * 4.2
        e.chargeHits.clear()
        e.chargeT = Math.max(0.3, Math.hypot(e.bossAimX - e.x, e.bossAimY - e.y)
          / Math.max(1, Math.hypot(e.chargeVX, e.chargeVY)))
        this.scene.fx.shake(0.02, 0.3)
        this.scene.audio.play('boom', 1.1, 0.8)
    } else if (attack === 'cinderVolley') {
      const angle = Math.atan2(e.bossAimY - e.y, e.bossAimX - e.x)
      const ox = -Math.sin(angle) * 88
      const oy = Math.cos(angle) * 88
      for (const offset of [-1, 0, 1]) {
        this.scene.projectiles.fire(e.x, e.y - e.radius, angle, {
          tex: 'proj_rock', tint: 0xff7129, damage: e.damage * 1.1,
          speed: 1800, faction: 'enemy', fromPlayer: false, splash: 70, spin: 9,
          lobTo: { x: e.bossAimX + ox * offset, y: e.bossAimY + oy * offset },
        })
      }
      this.scene.audio.play('boom', 0.7, 0.7)
    } else if (attack === 'cinderNova') {
      this.scene.fx.explosion(e.x, e.y, 225, 0xff7129)
      this.scene.combat.areaDamageAllies(e.x, e.y, 225, e.damage * 1.4)
      this.scene.fx.shake(0.025, 0.35)
      this.scene.audio.play('boom', 0.55, 1.1)
    } else if (attack === 'shockwave') {
        this.scene.fx.explosion(e.x, e.y, 240, PAL.enemyBoss)
        this.scene.combat.areaDamageAllies(e.x, e.y, 240, e.damage * 1.5)
        this.scene.fx.shake(0.03, 0.45)
        this.scene.audio.play('boom', 0.45, 1.3)
    }
  }

  // ---- rendering --------------------------------------------------------
  private render(e: Enemy, dt: number, stunned = false) {
    const s = e.sprite
    s.x = e.x
    s.y = e.y
    s.setDepth(e.y)
    s.setFlipX(e.facing < 0)

    if (e.flashT > 0) {
      e.flashT -= dt
      s.setTintFill(0xffffff)
      if (e.flashT <= 0) s.clearTint()
    } else if (e.burnT > 0) {
      s.setTint(0xff9a5a)
    } else if (e.auraT > 0) {
      s.setTint(0xd0a8ff)
    } else if (e.telegraphT > 0) {
      s.setTint(0xffd24a)
    } else if (stunned) {
      s.setTint(0x8fd0ff)
    } else {
      s.clearTint()
    }

    // walk bob keeps a crowd from reading as a slab of static sprites
    if (e.state === 'move' && !stunned) {
      const t = this.scene.now * 0.012 + e.bobSeed
      s.rotation = Math.sin(t * (e.def.speed / 40)) * 0.07
      s.y = e.y - Math.abs(Math.sin(t * (e.def.speed / 26))) * 2.4
    } else {
      s.rotation *= 0.9
    }
  }

  private drawBars() {
    const g = this.bars
    g.clear()
    const cam = this.scene.cameras.main
    const view = cam.worldView
    for (const e of this.list) {
      if (!e.active || !e.alive || !e.def.healthbar) continue
      if (!Phaser.Geom.Rectangle.Contains(view, e.x, e.y)) continue
      if (e.def.boss) continue // bosses get the big HUD bar instead
      const w = Math.max(30, e.radius * 2.4)
      const x = e.x - w / 2
      const y = e.y - e.radius * 2 - 12
      const p = clamp(e.hp / e.maxHp, 0, 1)
      g.fillStyle(0x0a1018, 0.8); g.fillRect(x - 1, y - 1, w + 2, 6)
      g.fillStyle(e.def.elite ? PAL.enemyElite : PAL.danger, 1)
      g.fillRect(x, y, w * p, 4)
    }
    this.scene.buildings.drawHealthBars(g, view)
  }
}
