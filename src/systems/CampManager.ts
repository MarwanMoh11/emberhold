import { CAMPS, type CampSpec } from '../config/world'
import { PAL } from '../config/palette'
import { textStyle } from '../ui/theme'
import { rr } from '../core/math'
import type { Enemy } from '../entities/Enemy'
import type { EnemyKey } from '../config/enemies'
import type { GameScene } from '../scenes/GameScene'
import Phaser from 'phaser'

/** Camps 2.0 (S08): every camp stands from the start, asleep until its region is claimed or the hero comes near. */
export type CampState = 'asleep' | 'awake' | 'burned'

/** How close the hero has to come, once, to wake a camp in unclaimed ground. */
export const WAKE_RADIUS = 900
/** A sleeping camp is drawn with the colour gone out of it, like the ground it sits on. */
const SLEEP_TINT = 0x8a8278
const SLEEP_ALPHA = 0.8

export class CampRec {
  state: CampState = 'asleep'
  enemy: Enemy | null = null
  timer = rr(3, 8)
  constructor(
    readonly spec: CampSpec,
    readonly label: Phaser.GameObjects.Text,
    /** The camp as drawn while it sleeps. It is not an enemy yet, so nothing can target or damage it. */
    readonly sleeper: Phaser.GameObjects.Image | null,
  ) {}
  get destroyed() { return this.state === 'burned' }
}

/**
 * Static objectives that keep bleeding enemies into their region until you go
 * and break them. They are what turns "defend the base" into "take the map".
 * A camp sleeps until its region is claimed or the hero walks within
 * `WAKE_RADIUS`: asleep, it neither spawns nor takes damage.
 */
export class CampManager {
  camps: CampRec[] = []
  destroyedCount = 0

  constructor(private scene: GameScene) {}

  build() {
    for (const spec of CAMPS) {
      const label = this.scene.add.text(spec.x, spec.y - 128, spec.name,
        textStyle({ voice: 'display', size: 20, colour: PAL.danger, stroke: 5 }))
        .setOrigin(0.5).setDepth(780_000).setVisible(false)
      this.scene.culler.add(label, spec.x, spec.y - 128, Math.max(label.width, 200))
      let sleeper: Phaser.GameObjects.Image | null = null
      if (this.scene.textures.exists('enm_camp')) {
        sleeper = this.scene.add.image(spec.x, spec.y, 'enm_camp')
        sleeper.setOrigin(0.5, 1 - 8 / sleeper.height).setDepth(spec.y).setTint(SLEEP_TINT).setAlpha(SLEEP_ALPHA)
        this.scene.culler.add(sleeper, spec.x, spec.y - sleeper.height / 2, Math.max(sleeper.width, sleeper.height))
      }
      this.camps.push(new CampRec(spec, label, sleeper))
    }
  }

  private rec(id: string) { return this.camps.find(c => c.spec.id === id) }

  /** A camp in `requiresCamps` has burned. Unknown ids have not. */
  isBurned(id: string) { return this.rec(id)?.state === 'burned' }

  /** asleep, awake or burned; null for an unknown id. The approaches muster by this (S09). */
  stateOf(id: string): CampState | null { return this.rec(id)?.state ?? null }

  /** Burn a camp outright, sleeping or awake, with its reward and `camp:burned` (harness, quests). */
  burn(id: string): boolean {
    const rec = this.rec(id)
    if (!rec || rec.state === 'burned') return false
    if (rec.enemy?.active) this.scene.enemies.despawn(rec.enemy)
    this.onBurned(rec)
    return true
  }

  /** Wake a sleeping camp: it becomes an enemy that can be fought, and starts sending patrols. */
  wake(id: string, silent = false) {
    const rec = this.rec(id)
    if (!rec || rec.state !== 'asleep') return false
    rec.state = 'awake'
    rec.timer = rr(3, 8)
    rec.sleeper?.setVisible(false)
    if (!silent) this.scene.bus.emit('camp:woke', { id })
    return true
  }

  private ensureEnemy(rec: CampRec) {
    if (rec.state !== 'awake' || rec.enemy?.alive) return
    const e = this.scene.enemies.spawn('camp', rec.spec.x, rec.spec.y)
    if (!e) return
    e.maxHp = rec.spec.hp
    e.hp = rec.spec.hp
    rec.enemy = e
  }

  update(dt: number) {
    const p = this.scene.player
    for (const rec of this.camps) {
      if (rec.state === 'burned') continue
      const d = Math.hypot(p.x - rec.spec.x, p.y - rec.spec.y)

      if (rec.state === 'asleep') {
        if (this.scene.regions.claimed(rec.spec.region) || (p.alive && d < WAKE_RADIUS)) this.wake(rec.spec.id)
        else {
          const near = d < 620
          rec.label.setVisible(near)
          if (near) rec.label.setText(`${rec.spec.name}   ·   asleep`)
          continue
        }
      }

      // Settle the kill BEFORE restocking the marker. The other order let
      // ensureEnemy quietly swap the corpse for a fresh full-health camp in
      // the same frame, so a camp the player had just levelled came straight
      // back and could never actually be destroyed.
      if (rec.enemy && !rec.enemy.alive) {
        this.onBurned(rec)
        continue
      }
      this.ensureEnemy(rec)

      const e = rec.enemy

      const near = d < 620
      rec.label.setVisible(near)
      if (near && e) {
        rec.label.setText(`${rec.spec.name}   ${Math.ceil(e.hp)}/${e.maxHp}`)
      }

      // keep feeding its region while it stands (S10 adds the leash and the cap)
      rec.timer -= dt
      if (rec.timer <= 0) {
        rec.timer = rec.spec.spawns.every
        if (this.scene.enemies.walkerCount > 240) continue
        for (let i = 0; i < rec.spec.spawns.count; i++) {
          this.scene.enemies.spawn(
            rec.spec.spawns.key as EnemyKey,
            rec.spec.x + rr(-70, 70), rec.spec.y + rr(30, 80),
            1 + this.scene.waves.wave * 0.05, 1 + this.scene.waves.wave * 0.03,
          )
        }
      }
    }
  }

  private onBurned(rec: CampRec) {
    rec.state = 'burned'
    rec.enemy = null
    rec.sleeper?.setVisible(false)
    this.destroyedCount++
    rec.label.setVisible(false)

    const s = this.scene
    s.fx.explosion(rec.spec.x, rec.spec.y, 230, 0xff9840)
    s.fx.smoke(rec.spec.x, rec.spec.y - 30, 16)
    s.fx.shake(0.024, 0.55)
    s.fx.flash(0xffd9a0, 0.2)
    s.audio.play('boom', 0.5, 1.2)
    s.fx.popup(rec.spec.x, rec.spec.y - 90, `${rec.spec.name.toUpperCase()} BURNED`, PAL.gold, 24)

    for (const [k, v] of Object.entries(rec.spec.reward)) {
      const n = Math.min(14, Math.max(3, Math.round(v / 40)))
      for (let i = 0; i < n; i++) {
        s.pickups.drop(k as never, Math.ceil(v / n), rec.spec.x, rec.spec.y, 1.8)
      }
    }
    s.pickups.drop('chest', 1, rec.spec.x, rec.spec.y + 40, 1)
    s.bus.emit('camp:burned', { id: rec.spec.id })
  }

  toJSON() { return this.camps.filter(c => c.state === 'burned').map(c => c.spec.id) }

  /** The save's `campAwake`: camps awake and standing. */
  awakeJSON() { return this.camps.filter(c => c.state === 'awake').map(c => c.spec.id) }

  /** Damage to standing camps should not disappear when the player reloads. */
  healthJSON(): Record<string, number> {
    const hp: Record<string, number> = {}
    for (const rec of this.camps) {
      if (!rec.destroyed && rec.enemy?.alive && rec.enemy.hp < rec.enemy.maxHp) {
        hp[rec.spec.id] = rec.enemy.hp
      }
    }
    return hp
  }

  /** Burned camps first, then the ones already awake (quietly: no `camp:woke`). */
  load(burned: string[], awake: string[] = []) {
    for (const rec of this.camps) {
      if (burned.includes(rec.spec.id)) {
        rec.state = 'burned'
        rec.label.setVisible(false)
        rec.sleeper?.setVisible(false)
        this.destroyedCount++
      } else if (awake.includes(rec.spec.id)) this.wake(rec.spec.id, true)
    }
  }

  loadHealth(hp: Record<string, number>) {
    for (const rec of this.camps) {
      const value = hp[rec.spec.id]
      if (rec.state !== 'awake' || value === undefined) continue
      this.ensureEnemy(rec)
      if (rec.enemy) {
        rec.enemy.hp = Math.max(1, Math.min(rec.enemy.maxHp, value))
        rec.enemy.sprite.setScale(1)
      }
    }
  }
}
