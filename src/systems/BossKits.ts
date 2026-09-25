import { PAL } from '../config/palette'
import { rr } from '../core/math'
import type { Targetable } from '../core/types'
import type { Enemy } from '../entities/Enemy'
import type { GameScene } from '../scenes/GameScene'
import { applySlow, type Slow } from './walkers'
import {
  KITS, crossed, due, inArc, isStrongholdBoss, nearSegment, newKit, tickBinding, wardenImmune, type KitState,
} from './bosses'

const alive = (xs: { active: boolean; alive: boolean }[]) => xs.filter(q => q.active && q.alive)

/**
 * S17: the stronghold bosses' kits, driven from `EnemyManager.bossUpdate`.
 * `tick` runs every frame (the hanged, the packs, the binding), `choose` when
 * the boss timer runs out (telegraph a move), `release` when the telegraph ends.
 */
export class BossKits {
  private scratch: Targetable[] = []

  constructor(private readonly scene: GameScene) {}

  handles(e: Enemy) { return isStrongholdBoss(e.def.key) }

  private kitOf(e: Enemy): KitState {
    if (!e.kit) e.kit = newKit(e.hp / e.maxHp)
    return e.kit
  }

  /** Something the boss called up: tied to its post, so it fights there and no further. */
  private summon(e: Enemy, key: Parameters<GameScene['enemies']['spawn']>[0], x: number, y: number) {
    const s = this.scene
    if (s.enemies.walkerCount > 240) return null
    const q = s.enemies.spawn(key, x, y)
    if (q) q.home = e.home
    return q
  }

  tick(e: Enemy, dt: number) {
    const k = this.kitOf(e)
    const s = this.scene
    const frac = e.hp / e.maxHp
    switch (e.def.key) {
      case 'gallowsKnight': {
        const h = KITS.gallowsKnight.hanged
        if (!k.risen && crossed(k.prev, frac, h.at)) {
          k.risen = true
          for (let i = 0; i < h.count; i++) {
            const a = (i / h.count) * Math.PI * 2 + rr(-0.3, 0.3)
            const x = e.x + Math.cos(a) * h.ring, y = e.y + Math.sin(a) * h.ring * 0.7
            s.fx.smoke(x, y, 5)
            const q = this.summon(e, h.key, x, y)
            if (q) k.summons.push(q)
          }
          s.fx.popup(e.x, e.y - e.radius * 2 - 30, 'THE HANGED RISE', PAL.danger, 22)
          s.audio.play('horn', 1.2, 0.6)
        }
        break
      }
      case 'thornmother': {
        const p = KITS.thornmother.pack
        k.summons = alive(k.summons)
        if (due(k.pack, dt, p.every) && k.summons.length < p.cap) {
          for (let i = 0; i < p.count; i++) {
            const a = rr(0, Math.PI * 2)
            const q = this.summon(e, p.key, e.x + Math.cos(a) * p.ring, e.y + Math.sin(a) * p.ring * 0.7)
            if (q) k.summons.push(q)
          }
          s.fx.ring(e.x, e.y, p.ring + 30, 0x9ab04a, 0.5)
        }
        break
      }
      case 'stairwarden': {
        k.bound = alive(k.bound)
        // on its first update it binds the pair; they rise once more after the last falls
        if (!k.risen) { k.risen = true; this.bind(e, k) } else if (tickBinding(k.binding, k.bound.length, dt)) this.bind(e, k)
        const immune = wardenImmune(k.bound.length)
        if (immune !== e.shielded) {
          e.shielded = immune
          s.fx.popup(e.x, e.y - e.radius * 2 - 30, immune ? 'BOUND' : 'THE BINDING BREAKS', immune ? PAL.danger : PAL.gold, 20)
        }
        break
      }
    }
    k.prev = frac
  }

  private bind(e: Enemy, k: KitState) {
    const b = KITS.stairwarden.bound
    for (let i = 0; i < b.count; i++) {
      const a = Math.PI * (i ? 0.15 : 0.85)
      const q = this.summon(e, b.key, e.x + Math.cos(a) * b.ring, e.y + Math.sin(a) * b.ring * 0.6)
      if (q) { q.guard = true; k.bound.push(q) }
    }
    this.scene.fx.ring(e.x, e.y, b.ring + 40, 0xff9a44, 0.7)
  }

  /** The boss timer ran out: telegraph the next move. */
  choose(e: Enemy, dist: number) {
    const s = this.scene
    const kit = KITS[e.def.key as keyof typeof KITS]
    e.bossTimer = rr(kit.every[0], kit.every[1]) / (e.bossPhase ? 1.25 : 1)
    const t = e.target
    if (!t) return
    const top = e.y - e.radius * 2 - 30
    switch (e.def.key) {
      case 'gallowsKnight': {
        const c = KITS.gallowsKnight.cleave
        if (dist > c.reach + 40) { e.bossTimer = 0.6; return }
        e.bossAttack = 'cleave'
        e.telegraphT = c.telegraph
        const ang = Math.atan2(t.y - e.y, t.x - e.x)
        e.bossAimX = e.x + Math.cos(ang) * c.reach
        e.bossAimY = e.y + Math.sin(ang) * c.reach
        s.fx.warningCircle(e.x + Math.cos(ang) * c.reach * 0.55, e.y + Math.sin(ang) * c.reach * 0.55, c.reach * 0.6, PAL.danger, c.telegraph)
        s.fx.popup(e.x, top, 'CLEAVE', PAL.danger, 18)
        break
      }
      case 'thornmother': {
        const l = KITS.thornmother.lash
        e.bossAttack = 'rootLash'
        e.telegraphT = l.telegraph
        const ang = Math.atan2(t.y - e.y, t.x - e.x)
        e.bossAimX = e.x + Math.cos(ang) * l.length
        e.bossAimY = e.y + Math.sin(ang) * l.length
        this.lineWarn(e, l.width, l.telegraph)
        s.fx.popup(e.x, top, 'ROOT LASH', PAL.danger, 18)
        break
      }
      case 'seamOverseer': {
        const c = KITS.seamOverseer.crack
        e.bossAttack = 'whipcrack'
        e.telegraphT = c.telegraph
        s.fx.warningCircle(e.x, e.y, c.radius, PAL.danger, c.telegraph)
        s.fx.popup(e.x, top, 'WHIPCRACK', PAL.danger, 18)
        break
      }
      case 'stairwarden': {
        const c = KITS.stairwarden.charge, b = KITS.stairwarden.bash
        if (dist > c.minRange) {
          if (Math.random() < c.chance) s.enemies.telegraphCharge(e)
          else e.bossTimer = 1.2
          break
        }
        e.bossAttack = 'bash'
        e.telegraphT = b.telegraph
        s.fx.warningCircle(e.x, e.y, b.radius, PAL.danger, b.telegraph)
        s.fx.popup(e.x, top, 'SHIELD BASH', PAL.danger, 18)
        break
      }
    }
  }

  /** A kit telegraph ran out: true when it was one of these. */
  release(e: Enemy, attack: Enemy['bossAttack']): boolean {
    const s = this.scene
    if (attack === 'cleave') {
      const c = KITS.gallowsKnight.cleave
      const facing = Math.atan2(e.bossAimY - e.y, e.bossAimX - e.x)
      for (const a of s.allyGrid.query(e.x, e.y, c.reach + 30, this.scratch).slice()) {
        if (a.alive && inArc(e.x, e.y, facing, c.reach + a.radius, c.half, a.x, a.y)) s.combat.damageAlly(a, e.damage * c.mult, e.x, e.y, 200)
      }
      s.fx.slash(e.x + Math.cos(facing) * 50, e.y - 20 + Math.sin(facing) * 30, facing, 2.6, 0xd8e0ea)
      s.fx.shake(0.016, 0.25)
      s.audio.play('boom', 0.4, 1.4)
      return true
    }
    if (attack === 'rootLash') {
      const l = KITS.thornmother.lash
      for (const a of s.allyGrid.query((e.x + e.bossAimX) / 2, (e.y + e.bossAimY) / 2, l.length / 2 + l.width, this.scratch).slice()) {
        if (!a.alive || !nearSegment(e.x, e.y, e.bossAimX, e.bossAimY, l.width / 2 + a.radius, a.x, a.y)) continue
        s.combat.damageAlly(a, e.damage * l.mult, e.x, e.y)
        if (a.alive && (a.kind === 'player' || a.kind === 'soldier')) applySlow((a as unknown as { slow: Slow }).slow, l.slow, l.slowFor)
      }
      for (let i = 1; i <= 6; i++) {
        const f = i / 6
        s.fx.hitSpark(e.x + (e.bossAimX - e.x) * f, e.y + (e.bossAimY - e.y) * f, 0x8a6a3a, 1.2)
      }
      s.fx.shake(0.012, 0.2)
      s.audio.play('boom', 0.35, 1.6)
      return true
    }
    if (attack === 'bash') {
      const b = KITS.stairwarden.bash
      for (const a of s.allyGrid.query(e.x, e.y, b.radius, this.scratch).slice()) {
        if (a.alive) s.combat.damageAlly(a, e.damage * b.mult, e.x, e.y, b.knockback)
      }
      s.fx.ring(e.x, e.y, b.radius, 0xc8d4e2, 0.35)
      s.fx.shake(0.016, 0.22)
      s.audio.play('boom', 0.35, 1.3)
      e.bossTimer = Math.min(e.bossTimer, 1.4) // the hero thrown back: the charge follows
      return true
    }
    if (attack === 'whipcrack') {
      const c = KITS.seamOverseer.crack
      for (const a of s.allyGrid.query(e.x, e.y, c.radius, this.scratch).slice()) {
        if (a.alive) s.combat.damageAlly(a, e.damage * c.mult, e.x, e.y, c.knockback)
      }
      s.fx.ring(e.x, e.y, c.radius, 0xffb04a, 0.4)
      s.fx.shake(0.014, 0.2)
      s.audio.play('boom', 0.3, 1.8)
      return true
    }
    return false
  }

  /** Every swing of the knight cleaves; the overseer's whip is drawn out to its mark. */
  onStrike(e: Enemy, t: Targetable) {
    const s = this.scene
    if (e.def.key === 'gallowsKnight') {
      const facing = Math.atan2(t.y - e.y, t.x - e.x)
      const reach = e.range + e.radius
      for (const a of s.allyGrid.query(e.x, e.y, reach + 30, this.scratch).slice()) {
        if (a !== t && a.alive && inArc(e.x, e.y, facing, reach + a.radius, KITS.gallowsKnight.cleave.half, a.x, a.y)) {
          s.combat.damageAlly(a, e.damage * e.auraDamage, e.x, e.y, 80)
        }
      }
    } else if (e.def.key === 'seamOverseer') {
      const g = s.add.graphics().setDepth(e.y + 1)
      const hx = e.x + e.facing * e.radius * 0.6, hy = e.y - e.radius * 1.6
      g.lineStyle(3, 0x2a1a12, 0.9)
      g.beginPath(); g.moveTo(hx, hy)
      g.lineTo((hx + t.x) / 2, Math.min(hy, t.y) - 30); g.lineTo(t.x, t.y - t.radius)
      g.strokePath()
      s.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() })
    }
  }

  /** A telegraphed line from the boss to its aim point (the root lash). */
  private lineWarn(e: Enemy, width: number, seconds: number) {
    const s = this.scene
    const g = s.add.graphics().setDepth(e.y - 1)
    g.lineStyle(width, PAL.danger, 0.16)
    g.lineBetween(e.x, e.y, e.bossAimX, e.bossAimY)
    g.lineStyle(3, PAL.danger, 0.8)
    g.lineBetween(e.x, e.y, e.bossAimX, e.bossAimY)
    s.tweens.add({ targets: g, alpha: 0, duration: seconds * 1000, onComplete: () => g.destroy() })
  }
}
