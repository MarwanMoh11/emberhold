import { waveDef, directorAdjust, frontShare, FRONTS, type WaveDef } from '../config/waves'
import { WORLD } from '../config/world'
import type { Pt } from '../config/world/blueprint'
import { DAYNIGHT, VILLAGE, dayLength, nightReward } from '../config/balance'
import { PAL } from '../config/palette'
import { rr, ri, shuffled, clamp } from '../core/math'
import { ENEMIES, type EnemyKey } from '../config/enemies'
import type { Enemy } from '../entities/Enemy'
import type { GameScene } from '../scenes/GameScene'
import { CAMP_MIX, SPAWN_SCATTER, splitBudget, type ApproachId, type NightPlan } from './Approaches'
import { mixHand } from './walkers'

/** Walkers whose deck card opens into a pack (S16: thornlings come five at a time). */
const PACKS: Partial<Record<EnemyKey, number>> = Object.fromEntries(
  Object.values(ENEMIES).filter(d => (d.pack ?? 1) > 1).map(d => [d.key, d.pack]),
)

export type Phase = 'day' | 'warning' | 'night'

interface SpawnOrder {
  key: EnemyKey
  approach: ApproachId
  /** the approach's spawn point; each spawn scatters around it */
  x: number
  y: number
  at: number
  hpMult: number
  dmgMult: number
  boss?: boolean
}

/** One of tonight's approaches, as drawn and spawned. */
export interface TonightRoute {
  id: ApproachId
  name: string
  raid: boolean
  /** the spawn point (the muster, or clamped forward of it) */
  x: number
  y: number
  /** from the spawn point to the hall, one point per 32 px cell */
  route: Pt[]
}

/** "the south road", "the south road and the west ford", "a, b and c". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export class WaveManager {
  wave = 0
  phase: Phase = 'day'
  phaseT: number = DAYNIGHT.dayBase
  nightElapsed = 0
  /** the fight window has started: the first arrival on claimed ground, or `marchMax` after dusk */
  fighting = false
  fightElapsed = 0
  /** seconds after dusk of each approach's first arrival on claimed ground, tonight */
  arrivals: Record<ApproachId, number> = {}
  /** tonight's approaches: chosen at the warning, re-resolved at dusk */
  plan: NightPlan | null = null
  tonight: TonightRoute[] = []
  /** whether a watch post covers tonight's routes, asked once as the early window opens (S13b); null until then */
  private watched: boolean | null = null

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

  /** Today's length: `60 + 10 × claimed regions` beyond the hold, capped (DAYNIGHT). */
  get dayLength() {
    return dayLength((this.scene?.regions?.claimedCount ?? 1) - 1)
  }

  /** Marchers are still out and nobody has reached claimed ground. */
  get marching() { return this.phase === 'night' && !this.fighting }

  update(dt: number) {
    this.phaseT -= dt

    switch (this.phase) {
      case 'day': {
        // a watch post over tonight's road sounds the warning early (S13b)
        const early = VILLAGE.watchPost.warnEarly
        if (this.watched === null && this.phaseT <= DAYNIGHT.warningSeconds + early) {
          const plan = this.scene.approaches.tonight(this.wave + 1, this.peekNext().approaches)
          this.watched = this.scene.buildings.watchCovers(this.routesFor(plan).map(t => t.route))
        }
        if (this.phaseT <= DAYNIGHT.warningSeconds || this.watched) this.beginWarning(this.watched ? Math.max(0, this.phaseT - DAYNIGHT.warningSeconds) : 0)
        break
      }
      case 'warning':
        if (this.phaseT <= 0) this.beginNight()
        break
      case 'night': {
        this.nightElapsed += dt
        this.drainQueue()
        if (!this.fighting && this.nightElapsed >= DAYNIGHT.marchMax) this.beginFight()
        if (this.fighting) this.fightElapsed += dt
        const spawnedAll = this.queueHead >= this.queue.length
        // the fight window, stretched by the spawn's spread; stragglers flee at dawn (S20)
        const timedOut = this.fighting
          && this.fightElapsed > Math.max(DAYNIGHT.nightSeconds, (this.current?.spread ?? 8) + DAYNIGHT.fightGrace)
        if (spawnedAll && (this.remaining <= 0 || timedOut)) {
          if (this.remaining > 0) this.rout()
          this.endNight()
        }
        break
      }
    }

    // Dusk gathers over the last stretch of the day, deepens through the
    // warning, and the night itself is dark enough that the hearths matter.
    const dusk = DAYNIGHT.warningSeconds + 10
    const target = this.phase === 'night' ? 1
      : this.phase === 'warning' ? 0.45 + 0.35 * Math.max(0, 1 - this.phaseT / DAYNIGHT.warningSeconds)
        : this.phaseT < dusk ? 0.45 * (1 - (this.phaseT - DAYNIGHT.warningSeconds) / 10) : 0
    this.darkness += (target - this.darkness) * Math.min(1, dt * 1.2)
  }

  private beginWarning(extra = 0) {
    this.phase = 'warning'
    this.phaseT = DAYNIGHT.warningSeconds + extra
    this.watched = null
    const def = this.peekNext()
    const plan = this.scene.approaches.tonight(this.wave + 1, def.approaches)
    this.plan = plan
    this.tonight = this.routesFor(plan)
    this.bannerText = `Tonight: ${joinNames(this.tonight.map(t => t.name))}`
    this.scene.audio.play('waveWarn')
    const p = this.scene.player
    if (def.banner) this.scene.fx.popup(p.x, p.y - 140, def.banner.toUpperCase(), PAL.danger, 26)
    this.scene.fx.popup(p.x, p.y - 110, `${this.bannerText}.`, PAL.danger, 22)
    this.scene.bus.emit('night:warning', {
      approaches: this.tonight.map(t => t.id),
      routes: this.tonight.map(t => t.route),
    })
  }

  /** Spawn points and drawn routes for a plan, fronts first. Closed approaches drop out. */
  private routesFor(plan: NightPlan): TonightRoute[] {
    const ap = this.scene.approaches
    const out: TonightRoute[] = []
    for (const id of [...plan.fronts, ...(plan.raid ? [plan.raid] : [])]) {
      if (!ap.muster(id)) continue
      const [x, y] = ap.spawnPoint(id)
      out.push({ id, name: ap.name(id), raid: ap.isRaid(id), x, y, route: ap.marchRoute(id) })
    }
    return out
  }

  /** A spawn within SPAWN_SCATTER of the point, on passable ground in sight of it. */
  private scatter(x: number, y: number): Pt {
    const nav = this.scene.nav
    for (let k = 0; k < 6; k++) {
      const a = rr(0, Math.PI * 2), d = rr(0, SPAWN_SCATTER)
      const sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d
      if (nav.passableAt(sx, sy) && nav.lineClear(x, y, sx, sy)) return [sx, sy]
    }
    return [x, y]
  }

  private beginFight() {
    this.fighting = true
    this.fightElapsed = 0
    this.phaseT = DAYNIGHT.nightSeconds
  }

  /** A wave walker set foot on claimed ground (EnemyManager): log it, and the fight starts. */
  arrived(e: Enemy) {
    if (this.phase !== 'night') return
    const id = e.approach ?? '?'
    if (!(id in this.arrivals)) this.arrivals[id] = Math.round(this.nightElapsed * 100) / 100
    if (!this.fighting) this.beginFight()
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

    const ap = this.scene.approaches
    // re-resolve the warning's plan: a camp may have burned or a region been claimed since
    const warned = this.plan?.wave === this.wave ? this.plan : null
    const keep = (id: ApproachId) => ap.muster(id) !== null
    let plan: NightPlan = warned
      ? { wave: this.wave, fronts: warned.fronts.filter(keep), raid: warned.raid && keep(warned.raid) ? warned.raid : null }
      : ap.tonight(this.wave, def.approaches)
    if (!plan.fronts.length && !plan.raid) plan = ap.tonight(this.wave, def.approaches)
    this.plan = plan
    this.tonight = this.routesFor(plan)
    this.arrivals = {}
    this.fighting = false
    this.fightElapsed = 0

    const spread = def.spread ?? 8
    const hpMult = def.hpMult ?? 1
    const dmgMult = def.dmgMult ?? 1

    // one flat, shuffled list of the night's walkers, dealt out by budget
    const units: EnemyKey[] = []
    for (const [key, n] of Object.entries(def.enemies) as [EnemyKey, number][]) {
      for (let i = 0; i < (n ?? 0); i++) units.push(key)
    }
    // three fronts or more: a share of the deck (S22, `FRONTS`)
    const deck = shuffled(units).slice(0, Math.round(units.length * frontShare(plan.fronts.length)))
    const split = splitBudget(plan, deck.length)
    const mult = (t: TonightRoute) => {
      const tier = ap.tier(t.id)
      return { hp: hpMult * (1 + FRONTS.hp * tier), dmg: dmgMult * (1 + FRONTS.dmg * tier) }
    }
    for (const t of this.tonight) {
      // the muster camp's own walker makes up its share of the approach, the
      // new walkers join by muster (S16: WALKER_MIX), and packs open up
      const own = ap.campKey(t.id)
      const hand = mixHand(deck.splice(0, split.get(t.id) ?? 0), {
        own: own && own in ENEMIES ? own as EnemyKey : null,
        region: ap.muster(t.id)?.region ?? null,
        tier: ap.tier(t.id),
      }, CAMP_MIX, PACKS)
      const m = mult(t)
      hand.forEach((key, i) => this.queue.push({
        key, approach: t.id, x: t.x, y: t.y,
        at: (i / Math.max(1, hand.length)) * spread + rr(0, 0.5),
        hpMult: m.hp, dmgMult: m.dmg,
      }))
    }
    // interleave so different approaches arrive together instead of type-by-type
    this.queue = shuffled(this.queue).sort((a, b) => a.at - b.at)

    const lead = this.tonight[0]
    if (def.boss && lead) {
      const m = mult(lead)
      this.queue.push({
        key: def.boss, approach: lead.id, x: lead.x, y: lead.y, at: Math.min(2.5, spread * 0.3),
        hpMult: m.hp, dmgMult: m.dmg, boss: true,
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
      const [x, y] = o.boss ? [o.x, o.y] : this.scatter(o.x, o.y)
      const e = this.scene.enemies.spawn(o.key, x, y, o.hpMult, o.dmgMult)
      if (!e) { this.remaining--; continue }
      e.fromWave = true
      e.approach = o.approach
      e.route = this.scene.approaches.legs(o.approach)
      e.leg = 0
      e.marching = true
      if (o.boss) {
        this.bossName = e.def.name
        this.scene.fx.flash(0x6a0d18, 0.3)
        this.scene.fx.shake(0.02, 0.6)
        this.scene.audio.play('bossRoar')
        this.scene.cameras.main.pan(e.x, e.y, 900, 'Sine.easeInOut', false, (_c, prog) => {
          if (prog >= 1) this.scene.cameras.main.startFollow(this.scene.player.container, true, 0.09, 0.09)
        })
      } else {
        this.scene.fx.dust(x, y, 3)
      }
    }
  }

  /** Called by the scene when any wave enemy dies. */
  notifyKilled(fromWave: boolean) {
    if (fromWave) this.remaining = Math.max(0, this.remaining - 1)
  }

  /**
   * Dawn breaks the horde (S20): night walkers still out when the fight
   * window closes flee in smoke and drop what they carried (their loot, no
   * kill or xp). Bosses stand their ground and carry into the day.
   */
  private rout() {
    const fled: Enemy[] = []
    this.scene.enemies.forEachAlive(e => { if (e.fromWave && !e.def.boss) fled.push(e) })
    for (const e of fled) {
      this.scene.pickups.dropLoot(e.def, e.x, e.y, this.scene.player.stats.greed)
      this.scene.fx.smoke(e.x, e.y, 3)
      this.scene.enemies.despawn(e)
    }
    this.remaining = 0
  }

  private endNight() {
    this.phase = 'day'
    this.phaseT = this.dayLength
    this.plan = null
    this.tonight = []
    this.fighting = false
    this.wavesCleared++
    this.bannerText = ''
    // each standing chapel blesses the reward, +50% at most in all (S13b)
    const reward = Math.round(nightReward(this.wave) * this.scene.buildings.nightBlessing())
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
    this.phaseT = this.dayLength
    this.nightElapsed = 0
    this.fighting = false
    this.plan = null
    this.tonight = []
    this.queue.length = 0
    this.queueHead = 0
    this.remaining = 0
    this.current = null
    this.bossName = null
  }

  get bossLabel() { return this.bossName }

  /** Where tonight's approaches spawn, for the edge markers and the minimap (empty by day). */
  nextApproaches(): { x: number; y: number; name: string }[] {
    return this.phase === 'day' ? [] : this.tonight
  }

  toJSON() { return { wave: this.wave, wavesCleared: this.wavesCleared, phase: this.phase, phaseT: Math.max(0, this.phaseT) } }
  load(d: { wave: number; wavesCleared: number; phase?: Phase; phaseT?: number }, recovering = false) {
    // Enemy positions and the live spawn queue are intentionally transient.
    // An ordinary interrupted night restarts at its warning. A saved Hall loss
    // gets a full rebuild day before the same wave returns.
    this.wave = d.phase === 'night' ? Math.max(0, d.wave - 1) : d.wave
    this.wavesCleared = d.wavesCleared
    this.phase = 'day'
    this.phaseT = recovering ? this.dayLength
      : d.phase === 'night' || d.phase === 'warning' ? DAYNIGHT.warningSeconds + 0.01
        : Number.isFinite(d.phaseT) ? clamp(d.phaseT!, 0, DAYNIGHT.dayMax) : this.dayLength
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
