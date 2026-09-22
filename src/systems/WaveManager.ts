import { waveDef, directorAdjust, type WaveDef, type GateId } from '../config/waves'
import { SPAWN_GATES, GATE_BY_ID } from '../config/map'
import { DAYNIGHT, WORLD } from '../config/balance'
import { PAL } from '../config/palette'
import { rr, ri, shuffled, clamp } from '../core/math'
import type { EnemyKey } from '../config/enemies'
import type { GameScene } from '../scenes/GameScene'

export type Phase = 'day' | 'warning' | 'night'

interface SpawnOrder {
  key: EnemyKey
  gateX: number
  gateY: number
  at: number
  hpMult: number
  dmgMult: number
  boss?: boolean
}

export class WaveManager {
  wave = 0
  phase: Phase = 'day'
  phaseT = DAYNIGHT.daySeconds
  nightElapsed = 0

  private queue: SpawnOrder[] = []
  private queueHead = 0
  private remaining = 0
  private current: WaveDef | null = null
  /**
   * How far toward night the light has gone: 0 is full day, 1 is the dark.
   * Eased rather than stepped, and dusk starts before the warning so the
   * evening arrives on its own; the lighting pass reads this every frame.
   */
  darkness = 0
  private bossName: string | null = null

  wavesCleared = 0
  /** set while the player is being told a wave is coming */
  bannerText = ''

  constructor(private scene: GameScene) {}

  get isNight() { return this.phase === 'night' }
  get enemiesRemaining() { return this.remaining }
  get tension() {
    if (this.phase === 'night') return clamp(0.55 + this.scene.enemies.walkerCount / 160, 0.55, 1)
    if (this.phase === 'warning') return 0.5
    return clamp(this.scene.enemies.walkerCount / 90, 0, 0.45)
  }

  /** Seconds left in the current phase, for the HUD. */
  get timeLeft() { return Math.max(0, this.phaseT) }

  update(dt: number) {
    this.phaseT -= dt

    switch (this.phase) {
      case 'day':
        if (this.phaseT <= DAYNIGHT.warningSeconds) this.beginWarning()
        break
      case 'warning':
        if (this.phaseT <= 0) this.beginNight()
        break
      case 'night': {
        this.nightElapsed += dt
        this.drainQueue()
        const spawnedAll = this.queueHead >= this.queue.length
        const timedOut = this.nightElapsed > Math.max(DAYNIGHT.nightSeconds * 2.2, (this.current?.spread ?? 8) + 80)
        if (spawnedAll && (this.remaining <= 0 || timedOut)) this.endNight()
        break
      }
    }

    // Dusk gathers over the last stretch of the day, deepens through the
    // warning, and the night itself is dark enough that the hearths matter.
    const dusk = DAYNIGHT.warningSeconds + 10
    const target = this.phase === 'night' ? 1
      : this.phase === 'warning' ? 0.45 + 0.35 * (1 - this.phaseT / DAYNIGHT.warningSeconds)
        : this.phaseT < dusk ? 0.45 * (1 - (this.phaseT - DAYNIGHT.warningSeconds) / 10) : 0
    this.darkness += (target - this.darkness) * Math.min(1, dt * 1.2)
  }

  private beginWarning() {
    this.phase = 'warning'
    this.phaseT = DAYNIGHT.warningSeconds
    const def = this.peekNext()
    this.bannerText = def.banner ?? 'ENEMY HORDE APPROACHING'
    this.scene.audio.play('waveWarn')
    this.scene.fx.popup(this.scene.player.x, this.scene.player.y - 110, this.bannerText.toUpperCase(), PAL.danger, 26)
    // arrows at the gates they will come from
    for (const g of def.gates) {
      const gate = GATE_BY_ID.get(g)
      if (gate) this.scene.fx.ring(gate.x, gate.y, 220, PAL.danger, 1.2)
    }
  }

  private peekNext(): WaveDef {
    const base = waveDef(this.wave + 1)
    return directorAdjust(base, {
      soldierCount: this.scene.army.count,
      towerCount: this.scene.buildings.towerCount,
      playerLevel: this.scene.player.level,
      wallHp: this.scene.buildings.totalWallHp,
    })
  }

  private beginNight() {
    this.wave++
    this.phase = 'night'
    this.phaseT = DAYNIGHT.nightSeconds
    this.nightElapsed = 0
    // The warning preview was for wave + 1. The old code incremented wave and
    // then previewed again, silently skipping the authored first encounter and
    // showing the wrong gate and boss schedule every night.
    const def = directorAdjust(waveDef(this.wave), {
      soldierCount: this.scene.army.count,
      towerCount: this.scene.buildings.towerCount,
      playerLevel: this.scene.player.level,
      wallHp: this.scene.buildings.totalWallHp,
    })
    this.current = def
    this.queue.length = 0
    this.queueHead = 0
    this.remaining = 0
    this.bossName = null

    const gates: GateId[] = def.gates.length ? def.gates : ['north']
    const spread = def.spread ?? 8
    const hpMult = def.hpMult ?? 1
    const dmgMult = def.dmgMult ?? 1

    for (const [key, countRaw] of Object.entries(def.enemies) as [EnemyKey, number][]) {
      const count = countRaw ?? 0
      for (let i = 0; i < count; i++) {
        const g = GATE_BY_ID.get(gates[i % gates.length]) ?? SPAWN_GATES[0]
        this.queue.push({
          key,
          gateX: g.x + rr(-110, 110),
          gateY: g.y + rr(-110, 110),
          at: (i / Math.max(1, count)) * spread + rr(0, 0.5),
          hpMult, dmgMult,
        })
      }
    }
    // interleave so different gates arrive together instead of type-by-type
    this.queue = shuffled(this.queue).sort((a, b) => a.at - b.at)

    if (def.boss) {
      const g = GATE_BY_ID.get(gates[0]) ?? SPAWN_GATES[0]
      this.queue.push({
        key: def.boss, gateX: g.x, gateY: g.y, at: Math.min(2.5, spread * 0.3),
        hpMult, dmgMult, boss: true,
      })
      this.queue.sort((a, b) => a.at - b.at)
    }

    this.remaining = this.queue.length
    this.scene.bus.emit('wave:start', { wave: this.wave })
    this.scene.fx.popup(this.scene.player.x, this.scene.player.y - 130, `NIGHT ${this.wave}`, PAL.danger, 34)
    this.scene.audio.play('horn', 0.8, 1)
  }

  private drainQueue() {
    while (this.queueHead < this.queue.length && this.queue[this.queueHead].at <= this.nightElapsed) {
      const o = this.queue[this.queueHead++]
      const e = this.scene.enemies.spawn(o.key, o.gateX, o.gateY, o.hpMult, o.dmgMult)
      if (!e) { this.remaining--; continue }
      e.fromWave = true
      if (o.boss) {
        this.bossName = e.def.name
        this.scene.fx.flash(0x6a0d18, 0.3)
        this.scene.fx.shake(0.02, 0.6)
        this.scene.audio.play('bossRoar')
        this.scene.cameras.main.pan(e.x, e.y, 900, 'Sine.easeInOut', false, (_c, prog) => {
          if (prog >= 1) this.scene.cameras.main.startFollow(this.scene.player.container, true, 0.09, 0.09)
        })
      } else {
        this.scene.fx.dust(o.gateX, o.gateY, 3)
      }
    }
  }

  /** Called by the scene when any wave enemy dies. */
  notifyKilled(fromWave: boolean) {
    if (fromWave) this.remaining = Math.max(0, this.remaining - 1)
  }

  private endNight() {
    this.phase = 'day'
    this.phaseT = DAYNIGHT.daySeconds
    this.wavesCleared++
    this.bannerText = ''
    const reward = 40 + this.wave * 25
    this.scene.res.addStored('coins', reward, false)
    this.scene.fx.popup(this.scene.player.x, this.scene.player.y - 120, `NIGHT ${this.wave} HELD`, PAL.good, 30)
    this.scene.fx.popup(this.scene.player.x, this.scene.player.y - 84, `+${reward} coins`, PAL.coins, 18)
    this.scene.audio.play('quest', 0.9)
    this.scene.pickups.collectAllInRadius(this.scene.player.x, this.scene.player.y, 900)
    this.scene.bus.emit('wave:cleared', { wave: this.wave })
  }

  /** Debug / quest helper. */
  forceNextWave() {
    if (this.phase === 'night') return
    this.phase = 'day'
    this.phaseT = DAYNIGHT.warningSeconds + 0.01
  }

  skipToDay() {
    if (this.phase !== 'night') return
    this.queueHead = this.queue.length
    this.remaining = 0
  }

  /** A lost settlement gets a full rebuild day, then retries its active night. */
  recoverSettlement() {
    if (this.phase === 'night') this.wave = Math.max(0, this.wave - 1)
    this.phase = 'day'
    this.phaseT = DAYNIGHT.daySeconds
    this.nightElapsed = 0
    this.queue.length = 0
    this.queueHead = 0
    this.remaining = 0
    this.current = null
    this.bossName = null
  }

  get bossLabel() { return this.bossName }

  /** Where the next attack is coming from, for the HUD compass. */
  nextGates() {
    const def = this.current ?? waveDef(this.wave + 1)
    return def.gates.map(g => GATE_BY_ID.get(g)).filter(Boolean) as { x: number; y: number; name: string }[]
  }

  toJSON() { return { wave: this.wave, wavesCleared: this.wavesCleared, phase: this.phase, phaseT: this.phaseT } }
  load(d: { wave: number; wavesCleared: number; phase?: Phase; phaseT?: number }, recovering = false) {
    // Enemy positions and the live spawn queue are intentionally transient.
    // An ordinary interrupted night restarts at its warning. A saved Hall loss
    // gets a full rebuild day before the same wave returns.
    this.wave = d.phase === 'night' ? Math.max(0, d.wave - 1) : d.wave
    this.wavesCleared = d.wavesCleared
    this.phase = 'day'
    this.phaseT = recovering ? DAYNIGHT.daySeconds
      : d.phase === 'night' || d.phase === 'warning' ? DAYNIGHT.warningSeconds + 0.01
        : Number.isFinite(d.phaseT) ? clamp(d.phaseT!, 0, DAYNIGHT.daySeconds) : DAYNIGHT.daySeconds
  }
}

/** Spawn helper used by the debug panel. */
export function spawnRing(scene: GameScene, key: EnemyKey, count: number) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rr(-0.2, 0.2)
    const r = rr(360, 560)
    scene.enemies.spawn(
      key,
      clamp(scene.player.x + Math.cos(a) * r, 40, WORLD.width - 40),
      clamp(scene.player.y + Math.sin(a) * r, 40, WORLD.height - 40),
      1, 1,
    )
  }
  return ri(0, 0)
}
