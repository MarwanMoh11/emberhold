import Phaser from 'phaser'
import { ABILITIES, ABILITY_SLOTS, ABILITY_TUNING, ULTIMATE, type AbilityKey } from '../config/abilities'
import { PAL } from '../config/palette'
import { rr } from '../core/math'
import type { GameScene } from '../scenes/GameScene'

interface Slot {
  key: AbilityKey
  cd: number
  unlocked: boolean
}

interface FirePatch {
  x: number; y: number; radius: number
  life: number; tick: number; dps: number
  sprite: Phaser.GameObjects.Image
}

export class AbilitySystem {
  slots: Slot[] = []
  ultimate: Slot
  private fires: FirePatch[] = []

  constructor(private scene: GameScene) {
    this.slots = ABILITY_SLOTS.map(key => ({ key, cd: 0, unlocked: false }))
    this.ultimate = { key: ULTIMATE, cd: 0, unlocked: false }
    this.refreshUnlocks()
  }

  refreshUnlocks() {
    const lvl = this.scene.player.level
    for (const s of this.slots) {
      const def = ABILITIES[s.key]
      if (!s.unlocked && lvl >= def.unlockLevel) {
        s.unlocked = true
      }
    }
    if (!this.ultimate.unlocked && lvl >= ABILITIES[ULTIMATE].unlockLevel) {
      this.ultimate.unlocked = true
    }
  }

  update(dt: number) {
    for (const s of this.slots) if (s.cd > 0) s.cd -= dt
    if (this.ultimate.cd > 0) this.ultimate.cd -= dt

    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i]
      f.life -= dt
      f.tick -= dt
      f.sprite.setAlpha(Math.min(0.85, f.life * 0.6))
      f.sprite.rotation += dt * 0.5
      if (f.tick <= 0) {
        f.tick = ABILITY_TUNING.firebomb.tickRate
        this.scene.combat.areaDamageEnemies(f.x, f.y, f.radius, f.dps, 0, false, 0, false)
        this.scene.enemies.grid.query(f.x, f.y, f.radius, []).forEach(e => e.burn(f.dps * 0.6, 1.2))
        this.scene.fx.embers(f.x + rr(-f.radius, f.radius), f.y + rr(-f.radius * 0.6, f.radius * 0.6), 2)
      }
      if (f.life <= 0) {
        f.sprite.destroy()
        this.fires.splice(i, 1)
      }
    }
  }

  /**
   * Cast the ability in hotbar slot `index` — a fixed position, not a position
   * in the unlocked subset. Indexing the unlocked ones used to shuffle every
   * ability onto a different key each time a new one unlocked, and left the
   * last of the five with no key and no button at all. `cast` already refuses a
   * locked slot, so a press on an empty one is simply ignored.
   */
  castSlot(index: number): boolean {
    const s = this.slots[index]
    return s ? this.cast(s) : false
  }

  castUltimate(): boolean {
    return this.ultimate.unlocked ? this.cast(this.ultimate) : false
  }

  castByKey(key: AbilityKey): boolean {
    const s = key === ULTIMATE ? this.ultimate : this.slots.find(x => x.key === key)
    return s ? this.cast(s) : false
  }

  private cast(s: Slot): boolean {
    if (!s.unlocked || s.cd > 0 || !this.scene.player.alive) {
      if (s.cd > 0) this.scene.audio.play('deny', 1, 0.5)
      return false
    }
    const def = ABILITIES[s.key]
    s.cd = def.cooldown
    this.scene.audio.play('ability', 1, 1)
    const p = this.scene.player
    const dmg = p.damage

    switch (s.key) {
      case 'whirlwind': {
        const t = ABILITY_TUNING.whirlwind
        this.scene.fx.ring(p.x, p.y - 10, t.radius * 2, PAL.heroTrim, 0.35)
        this.scene.fx.slash(p.x, p.y - 14, 0, 3.4, PAL.heroTrim)
        this.scene.fx.slash(p.x, p.y - 14, Math.PI, 3.4, PAL.heroTrim)
        this.scene.combat.areaDamageEnemies(p.x, p.y, t.radius, dmg * t.damageMult, t.knockback, this.scene.combat.rollCrit())
        this.scene.fx.shake(0.01, 0.2)
        break
      }
      case 'shockwave': {
        const t = ABILITY_TUNING.shockwave
        this.scene.fx.ring(p.x, p.y - 10, t.radius * 2, 0x6ee8ff, 0.5)
        this.scene.combat.areaDamageEnemies(p.x, p.y, t.radius, dmg * t.damageMult, t.knockback, false, t.stun)
        this.scene.fx.shake(0.016, 0.3)
        this.scene.fx.flash(0x6ee8ff, 0.12)
        break
      }
      case 'arrowRain': {
        const t = ABILITY_TUNING.arrowRain
        const spot = this.densestSpot(520) ?? { x: p.x, y: p.y }
        const reticle = this.scene.add.image(spot.x, spot.y, 'fx_reticle')
          .setDisplaySize(t.radius * 2, t.radius * 2).setTint(PAL.allyAlt).setDepth(spot.y - 1).setAlpha(0.8)
        this.scene.tweens.add({ targets: reticle, alpha: 0, duration: t.duration * 1000, onComplete: () => reticle.destroy() })
        for (let i = 0; i < t.volleys; i++) {
          this.scene.time.delayedCall((i / t.volleys) * t.duration * 1000, () => {
            const ax = spot.x + rr(-t.radius, t.radius)
            const ay = spot.y + rr(-t.radius * 0.8, t.radius * 0.8)
            this.scene.projectiles.fire(ax, ay - 420, Math.PI / 2, {
              tex: 'proj_arrow', damage: dmg * t.damageMult, speed: 900, faction: 'ally', fromPlayer: true,
              splash: 52, tint: 0xd8f0b0,
            })
          })
        }
        break
      }
      case 'firebomb': {
        const t = ABILITY_TUNING.firebomb
        const spot = this.densestSpot(430) ?? { x: p.x, y: p.y }
        this.scene.projectiles.fire(p.x, p.y - 18, 0, {
          tex: 'proj_shell', damage: dmg * 1.4, speed: 520, faction: 'ally', fromPlayer: true, splash: t.radius * 0.8,
          tint: 0xff9840, spin: 8, lobTo: spot,
          onLand: (x, y) => this.dropFire(x, y, t.radius, dmg * t.damageMult, t.duration),
        })
        break
      }
      case 'mend': {
        const t = ABILITY_TUNING.mend
        p.heal(p.maxHp * t.healPct)
        this.scene.combat.healAllies(p.x, p.y, t.radius, 9999)
        this.scene.fx.ring(p.x, p.y - 10, t.radius * 1.6, PAL.good, 0.6)
        break
      }
      case 'rally': {
        const t = ABILITY_TUNING.rally
        this.scene.army.applyRally(t.damageMult, t.rateMult, t.duration)
        this.scene.fx.ring(p.x, p.y - 10, 420, PAL.gold, 0.8)
        this.scene.fx.popup(p.x, p.y - 80, 'RALLY!', PAL.gold, 30)
        this.scene.fx.flash(0xffe9b0, 0.16)
        this.scene.audio.play('horn', 1.6, 0.9)
        break
      }
    }
    return true
  }

  /** Burning ground, for the lighting pass. */
  forEachFire(fn: (x: number, y: number, radius: number, life: number) => void) {
    for (const f of this.fires) fn(f.x, f.y, f.radius, f.life)
  }

  private dropFire(x: number, y: number, radius: number, dps: number, duration: number) {
    const sprite = this.scene.add.image(x, y, 'fx_fire_patch')
      .setDisplaySize(radius * 2, radius * 2).setDepth(y - 2).setAlpha(0.8)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.fires.push({ x, y, radius, life: duration, tick: 0, dps, sprite })
  }

  /** Aim assist: find where the horde is thickest so area skills always land. */
  private densestSpot(range: number): { x: number; y: number } | null {
    const p = this.scene.player
    const list = this.scene.enemies.grid.query(p.x, p.y, range, [])
    if (!list.length) return null
    let best = list[0]
    let bestCount = -1
    for (let i = 0; i < list.length; i += Math.max(1, Math.floor(list.length / 12))) {
      const c = this.scene.enemies.grid.query(list[i].x, list[i].y, 150, []).length
      if (c > bestCount) { bestCount = c; best = list[i] }
    }
    return { x: best.x, y: best.y }
  }

  toJSON() {
    return {
      slots: this.slots.map(s => ({ key: s.key, unlocked: s.unlocked })),
      ultimate: this.ultimate.unlocked,
    }
  }

  load(d: ReturnType<AbilitySystem['toJSON']>) {
    for (const rec of d.slots) {
      const s = this.slots.find(x => x.key === rec.key)
      if (s) s.unlocked = rec.unlocked
    }
    this.ultimate.unlocked = d.ultimate
  }
}
