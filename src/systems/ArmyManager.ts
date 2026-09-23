import Phaser from 'phaser'
import { Soldier } from '../entities/Soldier'
import { SOLDIERS, type SoldierKey } from '../config/units'
import { PAL } from '../config/palette'
import { WORLD } from '../config/world'
import { walkRadius } from '../world/NavGrid'
import { clamp, rr } from '../core/math'
import type { Enemy } from '../entities/Enemy'
import type { GameScene } from '../scenes/GameScene'

/** Front-to-back ordering so tanks screen the shooters. */
const LINE_ORDER: Record<SoldierKey, number> = {
  guard: 0, swordsman: 1, outrider: 1, spearman: 2, archer: 3, crossbow: 4,
}

const ENGAGE_RADIUS = 300
const LEASH = 420

export class ArmyManager {
  soldiers: Soldier[] = []
  private free: Soldier[] = []
  private ordered: Soldier[] = []
  private dirty = true

  /** false = the army follows you, true = it holds the settlement */
  holding = false

  buffDamage = 1
  buffRate = 1
  totalRecruited = 0


  constructor(private scene: GameScene) {}

  get count() { return this.soldiers.length }
  get popUsed() {
    let p = 0
    for (const s of this.soldiers) p += s.def.pop
    return p
  }

  countOf(key: SoldierKey) {
    let c = 0
    for (const s of this.soldiers) if (s.key === key) c++
    return c
  }

  recruit(key: SoldierKey, x: number, y: number, silent = false): Soldier {
    const def = SOLDIERS[key]
    let s = this.free.pop()
    if (!s) s = new Soldier(this.scene)
    const hpMult = 1 + this.scene.buildings.bonus.troopDmg * 0.3
    s.spawn(def, x + (silent ? 0 : rr(-8, 8)), y + (silent ? 0 : rr(-4, 4)), this.soldiers.length, hpMult)
    this.soldiers.push(s)
    this.dirty = true
    this.totalRecruited++

    if (silent) {
      s.spawnT = 0
      s.sprite.setScale(1)
    } else {
      this.scene.fx.dust(x, y, 5)
      this.scene.fx.popup(x, y - 28, def.name.toUpperCase(), PAL.allyBody, 14)
      this.scene.audio.play('recruit', rr(0.95, 1.1))
      this.scene.bus.emit('soldier:recruited', { key })
      // little march-out from the door
      this.scene.tweens.add({ targets: s.sprite, scale: 1, duration: 260, ease: 'Back.easeOut' })
    }
    return s
  }

  onSoldierDied(s: Soldier) {
    this.scene.fx.deathBurst(s.x, s.y - 10, s.def.colour, 1)
    this.scene.fx.popup(s.x, s.y - 30, 'DOWN', PAL.danger, 13)
    this.scene.audio.playVaried('enemyDie', 0.3)
    this.remove(s)
  }

  private remove(s: Soldier) {
    const i = this.soldiers.indexOf(s)
    if (i >= 0) this.soldiers.splice(i, 1)
    s.release()
    this.free.push(s)
    this.dirty = true
  }

  disbandAll() {
    for (const s of this.soldiers.slice()) this.remove(s)
  }

  /** Formation anchor: behind the hero relative to where they are heading. */
  private slotPosition(index: number, ax: number, ay: number, heading: number) {
    const perRow = 5
    const row = Math.floor(index / perRow)
    const col = (index % perRow) - (perRow - 1) / 2
    const back = 46 + row * 30
    const side = col * 34
    const cos = Math.cos(heading), sin = Math.sin(heading)
    return {
      x: ax - cos * back - sin * side,
      y: ay - sin * back + cos * side,
    }
  }

  update(dt: number) {
    const player = this.scene.player
    const scene = this.scene

    if (this.dirty) {
      this.ordered = this.soldiers.slice().sort((a, b) => LINE_ORDER[a.key] - LINE_ORDER[b.key])
      this.ordered.forEach((s, i) => { s.slot = i })
      this.dirty = false
    }

    const heading = Math.atan2(player.vy, player.vx) || 0
    const anchorX = this.holding ? scene.buildings.townHall.x : player.x
    const anchorY = this.holding ? scene.buildings.townHall.y + 60 : player.y

    for (let i = 0; i < this.soldiers.length; i++) {
      const s = this.soldiers[i]
      if (!s.alive) { this.remove(s); i--; continue }

      if (s.spawnT > 0) s.spawnT -= dt
      s.targetLockT -= dt

      // find something to fight
      if (!s.target || !s.target.alive || s.targetLockT <= 0) {
        const t = scene.enemies.grid.nearest(s.x, s.y, ENGAGE_RADIUS, e => e.alive)
        if (t) {
          s.target = t
          s.targetLockT = 1.3
        } else if (!s.target?.alive) {
          s.target = null
        }
      }

      // leash: never chase so far that the hero is left naked
      if (s.target) {
        const leashD = Math.hypot(s.target.x - anchorX, s.target.y - anchorY)
        if (leashD > LEASH) { s.target = null }
      }

      const def = s.def
      let mx = 0, my = 0
      let speed = def.speed

      if (s.target) {
        s.state = 'engage'
        const dx = s.target.x - s.x, dy = s.target.y - s.y
        const d = Math.hypot(dx, dy) || 1
        const reach = def.range + s.target.radius + s.radius * 0.4
        if (d <= reach) {
          s.attackCd -= dt
          if (s.attackCd <= 0) {
            s.attackCd = 1 / Math.max(0.1, def.attackRate * this.buffRate)
            this.strike(s, s.target as Enemy)
          }
          mx = -dx / d * 0.18
          my = -dy / d * 0.18
        } else {
          mx = dx / d
          my = dy / d
        }
        if (Math.abs(dx) > 4) s.facing = dx > 0 ? 1 : -1
      } else {
        s.state = this.holding ? 'hold' : 'form'
        const p = this.slotPosition(s.slot, anchorX, anchorY, heading)
        const dx = p.x - s.x, dy = p.y - s.y
        const d = Math.hypot(dx, dy)
        if (d > 16) {
          mx = dx / d
          my = dy / d
          // catch-up sprint so the formation does not string out forever
          speed = def.speed * (d > 220 ? 1.7 : d > 110 ? 1.25 : 1)
          if (Math.abs(dx) > 4) s.facing = dx > 0 ? 1 : -1
        }
      }

      s.vx += (mx * speed - s.vx) * Math.min(1, dt * 10)
      s.vy += (my * speed - s.vy) * Math.min(1, dt * 10)

      // keep the line from collapsing into one pixel
      const near = scene.allyGrid.query(s.x, s.y, s.radius * 2.3, [])
      let sx = 0, sy = 0, n = 0
      for (let k = 0; k < near.length && n < 4; k++) {
        const o = near[k]
        if (o === s || o.kind === 'building') continue
        const ox = s.x - o.x, oy = s.y - o.y
        const od = Math.hypot(ox, oy)
        if (od > 0.01 && od < s.radius + o.radius) {
          sx += (ox / od) * (1 - od / (s.radius + o.radius))
          sy += (oy / od) * (1 - od / (s.radius + o.radius))
          n++
        }
      }
      // terrain collision (S05): fords slow, banks stop. No pathing until S06, so a
      // soldier chasing straight across a river snags on the bank.
      const nav = scene.nav
      const slow = nav.speedAt(s.x, s.y)
      const p = nav.slide(s.x, s.y, sx * 56 * dt + s.vx * dt * slow, sy * 56 * dt + s.vy * dt * slow, walkRadius(s.radius))
      s.x = clamp(p.x, 20, WORLD.width - 20)
      s.y = clamp(p.y, 20, WORLD.height - 20)
      scene.buildings.resolveCollision(s)
      scene.allyGrid.insert(s)

      const spr = s.sprite
      spr.x = s.x
      spr.setDepth(s.y)
      spr.setFlipX(s.facing < 0)
      const moving = Math.hypot(s.vx, s.vy) > 20
      if (moving) {
        const t = scene.now * 0.014 + s.bobSeed
        spr.y = s.y - Math.abs(Math.sin(t * 6)) * 2.6
        spr.rotation = Math.sin(t * 3) * 0.05
      } else {
        spr.y = s.y
        spr.rotation *= 0.88
      }
      if (s.flashT > 0) {
        s.flashT -= dt
        spr.setTintFill(0xffffff)
        if (s.flashT <= 0) spr.clearTint()
      }
    }

    this.drawBars()
  }

  private strike(s: Soldier, target: Enemy) {
    const def = s.def
    const bonus = 1 + this.scene.buildings.bonus.troopDmg
    let dmg = def.damage * bonus * this.buffDamage * this.scene.player.stats.troopDamage
    if (def.vsHeavy && target.radius >= 17) dmg *= def.vsHeavy

    const ang = Math.atan2(target.y - s.y, target.x - s.x)
    if (def.ranged) {
      this.scene.projectiles.fire(s.x + Math.cos(ang) * 12, s.y - 14 + Math.sin(ang) * 6, ang, {
        tex: def.key === 'crossbow' ? 'proj_bolt' : 'proj_arrow',
        damage: dmg, speed: def.projectileSpeed ?? 540, faction: 'ally', fromPlayer: false, knockback: 26,
      })
      this.scene.audio.playVaried('shoot', 0.16)
    } else {
      this.scene.combat.damageEnemy(target, dmg, s.x, s.y, 70, false, false)
      this.scene.fx.slash(s.x + Math.cos(ang) * 16, s.y - 14 + Math.sin(ang) * 8, ang, 0.55, def.colour)
    }
  }

  private bars?: Phaser.GameObjects.Graphics
  private drawBars() {
    if (!this.bars) this.bars = this.scene.add.graphics().setDepth(760_000)
    const g = this.bars
    g.clear()
    const view = this.scene.cameras.main.worldView
    for (const s of this.soldiers) {
      if (s.hp >= s.maxHp) continue
      if (!Phaser.Geom.Rectangle.Contains(view, s.x, s.y)) continue
      const w = 26
      const x = s.x - w / 2
      const y = s.y - 34
      const p = clamp(s.hp / s.maxHp, 0, 1)
      g.fillStyle(0x0a1018, 0.75); g.fillRect(x - 1, y - 1, w + 2, 5)
      g.fillStyle(PAL.allyBody, 1); g.fillRect(x, y, w * p, 3)
    }
  }

  /** Rally: a short, loud army-wide buff. */
  applyRally(damageMult: number, rateMult: number, seconds: number) {
    this.buffDamage = damageMult
    this.buffRate = rateMult
    this.scene.player.buffDamage = damageMult
    this.scene.player.buffRate = rateMult
    for (const s of this.soldiers) this.scene.fx.ring(s.x, s.y - 10, 44, PAL.gold, 0.5)
    this.scene.time.delayedCall(seconds * 1000, () => {
      this.buffDamage = 1
      this.buffRate = 1
      this.scene.player.buffDamage = 1
      this.scene.player.buffRate = 1
    })
  }

  toJSON() {
    const counts: Partial<Record<SoldierKey, number>> = {}
    for (const s of this.soldiers) counts[s.key] = (counts[s.key] ?? 0) + 1
    const units = this.soldiers.map(s => ({ key: s.key, x: s.x, y: s.y, hp: s.hp }))
    return { counts, units, totalRecruited: this.totalRecruited, holding: this.holding }
  }

  load(d: ReturnType<ArmyManager['toJSON']>) {
    const hall = this.scene.buildings.townHall
    if (Array.isArray(d.units)) {
      for (const rec of d.units) {
        const s = this.recruit(rec.key, rec.x, rec.y, true)
        s.hp = Math.max(1, Math.min(s.maxHp, rec.hp))
      }
    } else {
      // Older saves stored counts only. Keep their army, then write unit state
      // in the next autosave.
      for (const k of Object.keys(d.counts) as SoldierKey[]) {
        for (let i = 0; i < (d.counts[k] ?? 0); i++) {
          this.recruit(k, hall.x + rr(-70, 70), hall.y + rr(40, 90), true)
        }
      }
    }
    this.totalRecruited = Math.max(this.soldiers.length, d.totalRecruited ?? this.soldiers.length)
    this.holding = !!d.holding
  }
}
