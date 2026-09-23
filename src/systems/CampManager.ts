import { CAMPS, type CampSpec } from '../config/map'
import { PAL } from '../config/palette'
import { textStyle } from '../ui/theme'
import { rr } from '../core/math'
import type { Enemy } from '../entities/Enemy'
import type { EnemyKey } from '../config/enemies'
import type { GameScene } from '../scenes/GameScene'
import Phaser from 'phaser'

interface CampRec {
  spec: CampSpec
  enemy: Enemy | null
  timer: number
  destroyed: boolean
  label: Phaser.GameObjects.Text
}

/**
 * Static objectives that keep bleeding enemies into their region until you go
 * and break them. They are what turns "defend the base" into "take the map".
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
      this.camps.push({ spec, enemy: null, timer: rr(3, 8), destroyed: false, label })
    }
  }

  private ensureEnemy(rec: CampRec) {
    if (rec.destroyed || rec.enemy?.alive) return
    const e = this.scene.enemies.spawn('camp', rec.spec.x, rec.spec.y)
    if (!e) return
    e.maxHp = rec.spec.hp
    e.hp = rec.spec.hp
    rec.enemy = e
  }

  update(dt: number) {
    const p = this.scene.player
    for (const rec of this.camps) {
      if (rec.destroyed) continue

      // Settle the kill BEFORE restocking the marker. The other order let
      // ensureEnemy quietly swap the corpse for a fresh full-health camp in
      // the same frame, so a camp the player had just levelled came straight
      // back and could never actually be destroyed.
      if (rec.enemy && !rec.enemy.alive) {
        this.onDestroyed(rec)
        continue
      }
      this.ensureEnemy(rec)

      const e = rec.enemy

      const near = Math.hypot(p.x - rec.spec.x, p.y - rec.spec.y) < 620
      rec.label.setVisible(near)
      if (near && e) {
        rec.label.setText(`${rec.spec.name}   ${Math.ceil(e.hp)}/${e.maxHp}`)
      }

      // keep feeding its region while it stands
      if (!this.scene.zones.isUnlocked(rec.spec.zone)) continue
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

  private onDestroyed(rec: CampRec) {
    rec.destroyed = true
    rec.enemy = null
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
    s.bus.emit('camp:destroyed', { id: rec.spec.id })
  }

  toJSON() { return this.camps.filter(c => c.destroyed).map(c => c.spec.id) }

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

  load(ids: string[]) {
    for (const rec of this.camps) {
      if (ids.includes(rec.spec.id)) {
        rec.destroyed = true
        rec.label.setVisible(false)
        this.destroyedCount++
      }
    }
  }

  loadHealth(hp: Record<string, number>) {
    for (const rec of this.camps) {
      const value = hp[rec.spec.id]
      if (rec.destroyed || value === undefined) continue
      this.ensureEnemy(rec)
      if (rec.enemy) {
        rec.enemy.hp = Math.max(1, Math.min(rec.enemy.maxHp, value))
        rec.enemy.sprite.setScale(1)
      }
    }
  }
}
