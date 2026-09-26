import { CAMPS, CAMP_WAKE, type CampSpec } from '../config/world'
import { PAL } from '../config/palette'
import { textStyle } from '../ui/theme'
import { rr } from '../core/math'
import type { CampHome, Enemy } from '../entities/Enemy'
import type { EnemyKey } from '../config/enemies'
import { BOSS_POST } from './bosses'
import type { GameScene } from '../scenes/GameScene'
import Phaser from 'phaser'

/** Camps 2.0 (S08): every camp stands from the start, asleep until its region is claimed or the hero comes near. */
export type CampState = 'asleep' | 'awake' | 'burned'

/** How close the hero has to come, once, to wake a camp in unclaimed ground. Each camp's own is `spec.wakeRadius`. */
export const WAKE_RADIUS = CAMP_WAKE
/** The fortress's braziers (S10): each must fall before the fortress can be damaged. */
export const BRAZIERS = { count: 3, ring: 260, hp: 2000 }
/** 'gallowsKnight' → 'the Gallows Knight' */
export const bossName = (key: string) => `the ${key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase())}`

/** The guards a camp's wards hang on: a stronghold's boss, the fortress's braziers, nothing for the rest. */
export function guardIds(spec: CampSpec): string[] {
  if (spec.tier === 'fortress') return Array.from({ length: BRAZIERS.count }, (_, k) => `brazier${k}`)
  return spec.tier === 'stronghold' && spec.boss ? ['boss'] : []
}
/** A sleeping camp is drawn with the colour gone out of it, like the ground it sits on. */
const SLEEP_TINT = 0x8a8278
const SLEEP_ALPHA = 0.8

export class CampRec {
  state: CampState = 'asleep'
  enemy: Enemy | null = null
  timer = rr(3, 8)
  /** its living patrols, at most `2 × spawns.count` */
  patrols: Enemy[] = []
  /** the standing guard per `guardIds` slot (null: not spawned yet, or fallen) */
  guards: (Enemy | null)[] = []
  /** what its patrols and guards are tied to */
  readonly home: CampHome
  constructor(
    readonly spec: CampSpec,
    readonly label: Phaser.GameObjects.Text,
    /** The camp as drawn while it sleeps. It is not an enemy yet, so nothing can target or damage it. */
    readonly sleeper: Phaser.GameObjects.Image | null,
  ) {
    this.home = { id: spec.id, x: spec.x, y: spec.y, leash: spec.leash, siege: spec.siegeRadius }
  }
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
  /** guards that have fallen, as `${campId}.${guardId}` (save `campGuards`) */
  readonly guardsDown = new Set<string>()
  /**
   * S17: a stronghold boss's hp while it stands hurt, by boss key (save
   * `campHealth` under the key): a retreat, a sweep or a reload resumes the fight.
   */
  readonly bossHp = new Map<string, number>()

  constructor(private scene: GameScene) {
    // settle a fallen guard the moment it dies, before its pooled body can be handed to another spawn
    scene.bus?.on('enemy:killed', () => { for (const rec of this.camps) this.settleFallen(rec) })
  }

  private settleFallen(rec: CampRec) {
    const ids = guardIds(rec.spec)
    for (let k = 0; k < ids.length; k++) {
      const g = rec.guards[k]
      if (!g || !g.active || g.alive || !g.guard) continue
      rec.guards[k] = null
      const key = `${rec.spec.id}.${ids[k]}`
      if (this.guardsDown.has(key)) continue
      this.guardsDown.add(key)
      if (ids[k] === 'boss' && rec.spec.boss) this.bossHp.delete(rec.spec.boss)
      this.onGuardFell(rec, ids[k])
    }
  }

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
    for (const g of rec.guards) if (g?.active && g.guard) this.scene.enemies.despawn(g)
    rec.guards = []
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

  /** Guards standing at a camp; 0 means its wards are down and it can be damaged. */
  guardsUp(id: string): number {
    const rec = this.rec(id)
    if (!rec) return 0
    return guardIds(rec.spec).filter(g => !this.guardsDown.has(`${rec.spec.id}.${g}`)).length
  }

  /**
   * Keep an awake camp's guards standing: settle any that died since the
   * last frame, and raise the rest (the first wake, a reload, or anything
   * that swept them away without killing them).
   */
  private ensureGuards(rec: CampRec) {
    const ids = guardIds(rec.spec)
    for (let k = 0; k < ids.length; k++) {
      const key = `${rec.spec.id}.${ids[k]}`
      if (this.guardsDown.has(key)) continue
      const g = rec.guards[k]
      if (g && g.active && g.alive && g.guard) {
        if (ids[k] === 'boss' && rec.spec.boss && g.hp < g.maxHp) this.bossHp.set(rec.spec.boss, g.hp)
        continue
      }
      if (g && !g.alive && g.hp <= 0 && g.guard) {
        rec.guards[k] = null
        this.guardsDown.add(key)
        if (ids[k] === 'boss' && rec.spec.boss) this.bossHp.delete(rec.spec.boss)
        this.onGuardFell(rec, ids[k])
        continue
      }
      rec.guards[k] = this.spawnGuard(rec, ids[k], k)
    }
  }

  /** A stronghold's boss stands at the camp; the fortress's braziers ring it. */
  private spawnGuard(rec: CampRec, gid: string, k: number): Enemy | null {
    const { spec } = rec
    const s = this.scene
    let e: Enemy | null
    if (gid === 'boss' && spec.boss) {
      // S17: the stronghold's own boss, at its post below the camp, with the hp it last had
      e = s.enemies.spawn(spec.boss as EnemyKey, spec.x, spec.y + BOSS_POST.dy)
      if (e) {
        e.home = { ...rec.home, leash: BOSS_POST.leash }
        const hp = this.bossHp.get(spec.boss)
        if (hp) e.hp = Math.max(1, Math.min(e.maxHp, hp))
      }
    } else {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / BRAZIERS.count
      e = s.enemies.spawn('brazier', spec.x + Math.cos(a) * BRAZIERS.ring, spec.y + Math.sin(a) * BRAZIERS.ring)
      if (e) { e.maxHp = BRAZIERS.hp; e.hp = BRAZIERS.hp }
    }
    if (e) e.guard = true
    return e
  }

  private onGuardFell(rec: CampRec, gid: string) {
    const s = this.scene, left = this.guardsUp(rec.spec.id)
    const what = gid === 'boss' && rec.spec.boss ? `${bossName(rec.spec.boss)} falls` : 'a brazier gutters out'
    const then = left > 0 ? `${left} still burn` : `${rec.spec.name} lies open`
    s.fx.popup(rec.spec.x, rec.spec.y - 150, `${what.toUpperCase()} · ${then.toUpperCase()}`, PAL.gold, 20)
    s.audio.play('boom', 0.4, 0.9)
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
        if (this.scene.regions.claimed(rec.spec.region) || (p.alive && d < rec.spec.wakeRadius)) this.wake(rec.spec.id)
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
      this.ensureGuards(rec)

      const e = rec.enemy
      const warded = this.guardsUp(rec.spec.id)
      if (e) e.shielded = warded > 0

      const near = d < 620
      rec.label.setVisible(near)
      if (near && e) {
        const by = rec.spec.tier === 'fortress' ? `${warded} brazier${warded === 1 ? '' : 's'}` : bossName(rec.spec.boss ?? '')
        rec.label.setText(warded > 0 ? `${rec.spec.name}   ·   warded by ${by}` : `${rec.spec.name}   ${Math.ceil(e.hp)}/${e.maxHp}`)
      }

      // patrols: a new band every `spawns.every` s, never more than two bands alive
      rec.patrols = rec.patrols.filter(q => q.active && q.alive && q.home === rec.home)
      rec.timer -= dt
      if (rec.timer <= 0) {
        rec.timer = rec.spec.spawns.every
        const room = Math.min(rec.spec.spawns.count, 2 * rec.spec.spawns.count - rec.patrols.length)
        if (room <= 0 || this.scene.enemies.walkerCount > 240) continue
        for (let i = 0; i < room; i++) {
          const q = this.scene.enemies.spawn(
            rec.spec.spawns.key as EnemyKey,
            rec.spec.x + rr(-70, 70), rec.spec.y + rr(30, 80),
            1 + this.scene.waves.wave * 0.05, 1 + this.scene.waves.wave * 0.03,
          )
          if (q) { q.home = rec.home; rec.patrols.push(q) }
        }
      }
    }
  }

  private onBurned(rec: CampRec) {
    rec.state = 'burned'
    rec.enemy = null
    rec.sleeper?.setVisible(false)
    if (rec.spec.boss) this.bossHp.delete(rec.spec.boss)
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
    s.bus.emit('camp:burned', { id: rec.spec.id, tier: rec.spec.tier, ...(rec.spec.boss ? { boss: rec.spec.boss } : {}) })
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
    for (const [key, v] of this.bossHp) hp[key] = Math.max(1, Math.round(v))
    return hp
  }

  /** The save's `campGuards`: fallen guards, `${campId}.${guardId}`. */
  guardsJSON() { return [...this.guardsDown] }

  /** Burned camps first, then the ones already awake (quietly: no `camp:woke`), and the guards already fallen. */
  load(burned: string[], awake: string[] = [], guardsDown: string[] = []) {
    for (const g of guardsDown) this.guardsDown.add(g)
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
      const b = rec.spec.boss
      if (b && hp[b] !== undefined && rec.state !== 'burned' && !this.guardsDown.has(`${rec.spec.id}.boss`)) this.bossHp.set(b, hp[b])
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
