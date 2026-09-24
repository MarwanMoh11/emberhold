import Phaser from 'phaser'
import { Enemy, type CampHome } from '../entities/Enemy'
import { ENEMIES, type EnemyDef, type EnemyKey } from '../config/enemies'
import { PERF } from '../config/balance'
import { MAX_ENEMIES } from '../core/device'
import { PAL } from '../config/palette'
import { WORLD } from '../config/world'
import { walkRadius, type FlowField } from '../world/NavGrid'
import { MARCH_SPEED, VIA_REACH, viaMid } from './Approaches'
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

  /** `def` overrides the key's own (a stronghold's stand-in boss is a renamed elite until S17). */
  spawn(key: EnemyKey, x: number, y: number, hpMult = 1, dmgMult = 1, def: EnemyDef = ENEMIES[key]): Enemy | null {
    if (this.aliveCount >= MAX_ENEMIES) return null
    let e = this.free.pop()
    if (!e) {
      if (this.list.length >= MAX_ENEMIES + 40) return null
      e = new Enemy(this.scene)
      this.list.push(e)
    }
    x = clamp(x, 40, WORLD.width - 40)
    y = clamp(y, 40, WORLD.height - 40)
    const nav = this.scene.nav
    if (!def.structure && !nav.passableAt(x, y)) {
      // ring spawns and camp musters can land in water: stand on the nearest bank
      const i = nav.nearestPassable(x, y)
      if (i >= 0) [x, y] = nav.r.xy(i)
    }
    e.spawn(def, x, y, hpMult, dmgMult)
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
      if (e.active && !e.def.structure && !e.guard) this.despawn(e)
    }
  }

  /** Damage everything at once — used by the wave-clear sweep. */
  forEachAlive(fn: (e: Enemy) => void) {
    for (const e of this.list) if (e.active && e.alive) fn(e)
  }

  // ---- targeting -------------------------------------------------------
  private acquire(e: Enemy): Targetable | null {
    if (e.home) return this.acquirePatrol(e, e.home)
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

  /**
   * A camp's patrol (S10) only fights inside its leash: the hero or an ally
   * within it, else the nearest structure within the camp's siege radius.
   * Nothing there: null, and it strolls about the camp.
   */
  private acquirePatrol(e: Enemy, h: CampHome): Targetable | null {
    const s = this.scene
    const inside = (t: { x: number; y: number }) => (t.x - h.x) ** 2 + (t.y - h.y) ** 2 <= h.leash * h.leash
    // arrows sail over structures, so only a walker that strikes in person besieges
    const siege = () => (e.def.ranged ? null : s.buildings.nearestStructure(h.x, h.y, h.siege, e.sapper))
    if (e.def.prefers === 'structures') { const b = siege(); if (b) return b }
    const p = s.player
    if (p.alive && inside(p) && (p.x - e.x) ** 2 + (p.y - e.y) ** 2 < 520 * 520) return p
    return s.allyGrid.nearest(e.x, e.y, 440, a => a.alive && a.kind !== 'building' && inside(a)) ?? siege()
  }

  /** Past the leash with nothing inside it to fight: walk home. */
  private strayed(e: Enemy, h: CampHome) {
    const far = (x: number, y: number, r: number) => (x - h.x) ** 2 + (y - h.y) ** 2 > r * r
    if (e.returning) {
      if (!far(e.x, e.y, h.leash * 0.5)) e.returning = false
    } else if (far(e.x, e.y, h.leash + 60) || (e.target && far(e.target.x, e.target.y, h.leash + 40))) {
      e.returning = true
      e.target = null
      e.los = this.scene.nav.lineClear(e.x, e.y, h.x, h.y)
    }
    return e.returning
  }

  /** Somewhere to stroll inside the leash; home itself when heading back. */
  private wanderGoal(e: Enemy, h: CampHome, dt: number): { x: number; y: number } {
    if (e.returning) return h
    e.wanderT -= dt
    if (e.wanderT <= 0) {
      e.wanderT = rr(4, 9)
      const a = rr(0, Math.PI * 2), r = rr(90, h.leash * 0.45)
      const x = h.x + Math.cos(a) * r, y = h.y + Math.sin(a) * r
      const ok = this.scene.nav.passableAt(x, y)
      e.wanderX = ok ? x : h.x
      e.wanderY = ok ? y : h.y + 90
      e.los = this.scene.nav.lineClear(e.x, e.y, e.wanderX, e.wanderY)
    }
    return { x: e.wanderX, y: e.wanderY }
  }

  /**
   * The next waypoint on a patrol's path to (gx, gy), asked of the path queue
   * when the goal moves. Null while the path is pending (it walks straight
   * meanwhile); an unreachable goal is given up.
   */
  private patrolWay(e: Enemy, gx: number, gy: number): [number, number] | null {
    if (!e.path || Math.hypot(gx - e.pathX, gy - e.pathY) > 64) {
      e.path = this.scene.nav.requestPath(e.x, e.y, gx, gy)
      e.pathX = gx; e.pathY = gy; e.pathI = 1
    }
    if (!e.path.done) return null
    const p = e.path.path
    if (!p || p.length < 2) {
      e.path = null
      if (e.target) { e.target = null; e.retargetIn = 1.5 } else { e.wanderT = 0; e.returning = false }
      return null
    }
    while (e.pathI < p.length - 1 && Math.hypot(p[e.pathI][0] - e.x, p[e.pathI][1] - e.y) < 24) e.pathI++
    return p[Math.min(e.pathI, p.length - 1)]
  }

  /**
   * Can e walk straight at t? The line stops short of t's body, so a wall
   * you are aiming at does not hide itself.
   */
  private sight(e: Enemy, t: Targetable): boolean {
    const dx = t.x - e.x, dy = t.y - e.y
    const d = Math.hypot(dx, dy)
    const stop = Math.min(d, t.radius + 24)
    if (d - stop < 1) return true
    return this.scene.nav.lineClear(e.x, e.y, t.x - (dx / d) * stop, t.y - (dy / d) * stop)
  }

  /** Aim at a wall and hold it for a while: the flow field said the way on is through it. */
  private latch(e: Enemy, wall: Targetable) {
    e.target = wall
    e.los = true
    e.retargetIn = Math.max(e.retargetIn, 1.5)
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
    const nav = this.scene.nav
    const hallField = nav.field('hall')
    const claim = this.scene.regions.claimMask()

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
      if (e.burnT > 0 && !e.shielded) {
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
        const p = nav.slide(e.x, e.y, e.kx * dt, e.ky * dt, walkRadius(e.radius))
        e.x = p.x
        e.y = p.y
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

      // the night's approach: legs in order until the first claimed cell,
      // which ends the march and logs the arrival
      if (e.route) {
        const ci = nav.r.cell(e.x, e.y)
        if (ci >= 0 && claim[ci]) {
          e.route = null
          if (e.marching) { e.marching = false; e.retargetIn = 0 }
          if (e.fromWave) this.scene.waves.arrived(e)
        } else {
          this.advanceLeg(e, hallField)
        }
      }

      if (e.marching) {
        this.march(e, dt)
      } else {
        // staggered re-target
        e.retargetIn -= dt
        const home = e.home, back = !!home && this.strayed(e, home)
        // a patrol with nothing to fight looks again on its timer, not every frame
        if (!back && (e.retargetIn <= 0 || (e.target ? !e.target.alive : !home))) {
          e.target = this.acquire(e)
          e.retargetIn = 0.35 + (e.id % 7) * 0.05
          e.los = e.target ? this.sight(e, e.target) : !!home && nav.lineClear(e.x, e.y, e.wanderX, e.wanderY)
        }

        const t = e.target
        if (!t && !home) { this.render(e, dt); continue }
        // a patrol with nothing to fight strolls about its camp, or walks back to it
        const goal = t ?? this.wanderGoal(e, home!, dt)

        const dx = goal.x - e.x
        const dy = goal.y - e.y
        const d = Math.hypot(dx, dy) || 1
        const reach = t ? e.range + t.radius + e.radius * 0.4 : 24

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

        if (!t && d <= reach) {
          e.state = 'move'
          e.vx *= 0.85
          e.vy *= 0.85
        } else if (d <= reach && t) {
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
          const speedMul = e.auraSpeed * (e.slowT > 0 ? 0.55 : 1) * (e.chargeT > 0 ? 2.6 : 1) * nav.speedAt(e.x, e.y)
          let mx = dx / d
          let my = dy / d

          if (!e.los && home) {
            // a patrol keeps to its camp: round the obstacle by a path, never down the hall's field
            const w = this.patrolWay(e, goal.x, goal.y)
            if (w) {
              const fx = w[0] - e.x, fy = w[1] - e.y
              const fl = Math.hypot(fx, fy) || 1
              mx = fx / fl; my = fy / fl
            }
          } else if (!e.los) {
            // no straight line: take the flow field (its approach's leg until it
            // reaches claimed ground, then the hall's), over the crossings and
            // through the gates. If its next cell is a wall, that wall is the way on.
            const j = (e.route ? nav.field(e.route[e.leg]) : hallField).nextCell(nav.r.cell(e.x, e.y))
            if (j >= 0) {
              const [cx, cy] = nav.r.xy(j)
              if (nav.blocked(j)) {
                const wall = this.scene.buildings.blockerAt(cx, cy, nav.r.C / 2)
                if (wall && wall.id !== t?.id) this.latch(e, wall)
              }
              if (!e.los) {
                const fx = cx - e.x, fy = cy - e.y
                const fl = Math.hypot(fx, fy) || 1
                mx = fx / fl; my = fy / fl
              }
            }
          }

          // buildings in the way: sappers smash walls, everyone smashes the rest;
          // a wall across a straight line sends the walker back to the field
          const nx = e.x + mx * e.radius * 2.2
          const ny = e.y + my * e.radius * 2.2
          const blocker = this.scene.buildings.blockerAt(nx, ny, e.radius)
          if (blocker && blocker.id !== e.target?.id) {
            if (e.sapper || blocker.key !== 'wall') {
              e.target = blocker
              e.los = true
            } else if (e.los) {
              e.los = false
            }
          }

          const sp = e.speed * speedMul
          e.vx += (mx * sp - e.vx) * Math.min(1, dt * 9)
          e.vy += (my * sp - e.vy) * Math.min(1, dt * 9)
        }
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
      const p = nav.slide(e.x, e.y, sx * 62 * dt + e.vx * dt, sy * 62 * dt + e.vy * dt, walkRadius(e.radius))
      e.x = clamp(p.x, 20, WORLD.width - 20)
      e.y = clamp(p.y, 20, WORLD.height - 20)

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

  /** Past its via crossing (within VIA_REACH of the midpoint, on the crossing, or nearer the hall than it): take the next leg. */
  private advanceLeg(e: Enemy, hallField: FlowField) {
    const route = e.route
    if (!route) return
    const nav = this.scene.nav
    while (e.leg < route.length - 1) {
      const leg = route[e.leg]
      const [mx, my] = this.viaMid(leg)
      const onIt = nav.field(leg).dist(e.x, e.y) <= 0
      const near = Math.hypot(e.x - mx, e.y - my) <= VIA_REACH
      const past = hallField.dist(e.x, e.y) < hallField.dist(mx, my)
      if (!onIt && !near && !past) break
      e.leg++
    }
  }

  private viaMids = new Map<string, [number, number]>()
  private viaMid(leg: string): [number, number] {
    let m = this.viaMids.get(leg)
    if (!m) { m = viaMid(leg.slice(4)); this.viaMids.set(leg, m) }
    return m
  }

  /**
   * The march: down the current leg's field at MARCH_SPEED, no targets, no
   * detours. A wall across the way, or ground the field cannot reach, ends it.
   */
  private march(e: Enemy, dt: number) {
    const nav = this.scene.nav
    const route = e.route
    e.target = null
    e.state = 'move'
    if (!route) { e.marching = false; return }
    const j = nav.field(route[e.leg]).nextCell(nav.r.cell(e.x, e.y))
    if (j < 0 || nav.blocked(j)) {
      e.marching = false
      e.retargetIn = 0
      return
    }
    const [cx, cy] = nav.r.xy(j)
    const fx = cx - e.x, fy = cy - e.y
    const fl = Math.hypot(fx, fy) || 1
    const sp = e.speed * MARCH_SPEED * e.auraSpeed * (e.slowT > 0 ? 0.55 : 1) * nav.speedAt(e.x, e.y)
    const k = Math.min(1, dt * 9)
    e.vx += ((fx / fl) * sp - e.vx) * k
    e.vy += ((fy / fl) * sp - e.vy) * k
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
    const p = this.scene.nav.slide(e.x, e.y, e.chargeVX * dt, e.chargeVY * dt, walkRadius(e.radius))
    e.x = clamp(p.x, 20, WORLD.width - 20)
    e.y = clamp(p.y, 20, WORLD.height - 20)
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
