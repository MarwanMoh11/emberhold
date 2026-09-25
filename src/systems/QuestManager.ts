import { QUESTS, ACHIEVEMENTS, type QuestDef } from '../config/quests'
import { PAL } from '../config/palette'
import { RESOURCE_ORDER, type ResourceType } from '../core/types'
import { dist } from '../core/math'
import type { BuildingKey } from '../config/buildings'
import type { Building } from '../entities/Building'
import { CAMPS } from '../config/world'
import type { GameScene } from '../scenes/GameScene'

export interface QuestView {
  title: string
  hint: string
  have: number
  need: number
  /** world position the guidance arrow should point at, if any */
  targetX?: number
  targetY?: number
}

/** Where the arrow points, plus an optional line replacing the quest hint. */
interface Guidance {
  x: number
  y: number
  hint?: string
}

/**
 * The quest chain doubles as the tutorial. Nothing is explained in prose: each
 * step names one action, the compass arrow points at it, and finishing it pays
 * for the next one.
 */
export class QuestManager {
  index = 0
  done = new Set<string>()
  unlockedAchievements = new Set<string>()
  defeatedBosses = new Set<string>()
  /** Remaining health of the final boss when a fight is saved. */
  finalBossHp = 0

  /**
   * Stamped the moment the last quest lands, and kept for good. The run summary
   * reads it back so a save opened weeks later can still name the night the
   * frontier was secured.
   */
  victoryAt = 0
  victoryWave = 0
  victoryPlaytime = 0

  private kills = 0
  private bossKills = 0
  private campsCleared = 0
  private zonesClaimed = 0

  constructor(private scene: GameScene) {
    const bus = scene.bus
    bus.on('enemy:killed', p => {
      this.kills++
      if (p.boss) {
        this.bossKills++
        this.defeatedBosses.add(p.key)
        if (p.key === 'cinderRegent') this.finalBossHp = 0
      }
    })
    bus.on('camp:burned', () => { this.campsCleared++ })
    bus.on('region:claimed', () => { this.zonesClaimed++ })
  }

  get current(): QuestDef | null {
    return this.index < QUESTS.length ? QUESTS[this.index] : null
  }

  /** The whole chain is behind you. The nights, deliberately, are not. */
  get campaignComplete() { return this.index >= QUESTS.length }
  get finalBossDefeated() { return this.defeatedBosses.has('cinderRegent') }

  private progress(q: QuestDef): { have: number; need: number } {
    const s = this.scene
    const g = q.goal
    switch (g.type) {
      case 'kill': return { have: this.kills, need: g.amount }
      case 'collect': return { have: s.res.totalGathered[g.resource as ResourceType], need: g.amount }
      case 'build': return { have: s.buildings.countBuilt(g.building as BuildingKey), need: g.amount ?? 1 }
      case 'upgrade': return { have: s.buildings.highestLevel(g.building as BuildingKey), need: g.level }
      case 'recruit': return { have: s.army.count, need: g.amount }
      case 'workers': return { have: s.workers.count, need: g.amount }
      case 'survive': return { have: s.waves.wavesCleared, need: g.wave }
      case 'camp': return { have: this.campsCleared, need: g.amount }
      case 'zone': return { have: this.zonesClaimed, need: g.amount }
      case 'level': return { have: s.player.level, need: g.amount }
      case 'boss': return { have: this.defeatedBosses.has(g.key) ? 1 : 0, need: 1 }
    }
  }

  /**
   * Redirect a target standing on unclaimed ground to the claim point that
   * opens it. The arrow used to send you at camps and pads inside locked
   * zones, where the soft barrier just bounces you back out — naming the thing
   * you cannot reach instead of the purchase that would let you reach it.
   */
  private throughZone(x: number, y: number): Guidance {
    const locked = this.scene.regions.unclaimedAt(x, y)
    if (!locked) return { x, y }
    const c = this.scene.regions.claimPoint(locked.id)
    return c ? { x: c.x, y: c.y, hint: `Claim ${locked.name} first` } : { x, y }
  }

  /** A pad you cannot build on yet: aim at whatever is actually blocking it. */
  private gatedTarget(b: Building): Guidance {
    const s = this.scene
    const viaZone = this.throughZone(b.x, b.y)
    if (viaZone.hint) return viaZone
    const needHall = Math.max(b.requiresTownHall, b.def.requiresTownHall ?? 0)
    if (s.buildings.townHallLevel < needHall) {
      const hall = s.buildings.buildings.find(h => h.key === 'townHall')
      if (hall) return { x: hall.x, y: hall.y, hint: `Command Hall Lv.${needHall} first` }
    }
    return { x: b.x, y: b.y }
  }

  private nearestCamp(list: { spec: { x: number; y: number } }[]) {
    const p = this.scene.player
    let best: { spec: { x: number; y: number } } | null = null
    let bestD = Infinity
    for (const c of list) {
      const d = dist(p.x, p.y, c.spec.x, c.spec.y)
      if (d < bestD) { bestD = d; best = c }
    }
    return best
  }

  /** Where to point the guidance arrow for the active objective. */
  private targetFor(q: QuestDef): Guidance | null {
    const s = this.scene
    const g = q.goal
    if (g.type === 'build') {
      const pads = s.buildings.buildings.filter(b => b.key === g.building && b.level === 0)
      const open = pads.find(b => s.buildings.isPadAvailable(b))
      if (open) return { x: open.x, y: open.y }
      if (pads.length) return this.gatedTarget(pads[0])
    }
    if (g.type === 'upgrade') {
      const pads = s.buildings.buildings.filter(b => b.key === g.building && b.level < g.level)
      const open = pads.find(b => s.regions.claimed(b.region))
      if (open) return { x: open.x, y: open.y }
      if (pads.length) return this.gatedTarget(pads[0])
    }
    if (g.type === 'workers') {
      const pad = s.buildings.buildings.find(b =>
        b.level > 0 && (b.stats.workers ?? 0) > b.workers.length && s.regions.claimed(b.region))
      if (pad) return { x: pad.x, y: pad.y }
    }
    if (g.type === 'recruit') {
      const pad = s.buildings.buildings.find(b =>
        b.level > 0 && (b.key === 'barracks' || b.key === 'archeryRange') && s.regions.claimed(b.region))
      if (pad) return { x: pad.x, y: pad.y }
    }
    if (g.type === 'collect') {
      if (g.resource === 'coins') {
        // enemies inside a locked zone are behind the barrier: ignore them
        const e = s.enemies.grid.nearest(s.player.x, s.player.y, 1400, en =>
          en.alive && !en.def.structure && !s.regions.unclaimedAt(en.x, en.y))
        if (e) return { x: e.x, y: e.y }
      }
      const node = s.nodes.findFor(g.resource as ResourceType, s.player.x, s.player.y, 1600, 0)
      if (node) return { x: node.x, y: node.y }
    }
    if (g.type === 'camp') {
      const live = s.camps.camps.filter(c => !c.destroyed)
      // prefer one you can walk to; fall back to naming the border in the way
      const c = this.nearestCamp(live.filter(x => s.regions.claimed(x.spec.region)))
        ?? this.nearestCamp(live)
      if (c) return this.throughZone(c.spec.x, c.spec.y)
    }
    if (g.type === 'boss') {
      const boss = s.enemies.list.find(e => e.active && e.alive && e.key === g.key)
      if (boss) return { x: boss.x, y: boss.y }
      const fortress = CAMPS.find(c => c.id === 'campAshgate')
      if (fortress) return this.throughZone(fortress.x, fortress.y)
    }
    if (g.type === 'zone') {
      const locked = s.zonesNextTarget()
      if (locked) return locked
    }
    return null
  }

  view(): QuestView | null {
    const q = this.current
    if (!q) return { title: 'FRONTIER SECURED', hint: 'Hold Emberhold as long as you can', have: this.scene.waves.wave, need: this.scene.waves.wave }
    const p = this.progress(q)
    const t = this.targetFor(q)
    return {
      title: q.title, hint: t?.hint ?? q.hint,
      have: Math.min(p.have, p.need), need: p.need, targetX: t?.x, targetY: t?.y,
    }
  }

  update() {
    const q = this.current
    if (q) {
      const p = this.progress(q)
      if (p.have >= p.need) this.complete(q)
    }
    // Deliberately outside the quest check: the endless nights past the last
    // quest are exactly where the 1,000- and 5,000-kill marks get passed, and
    // an early return here meant those could never be earned.
    this.checkAchievements()
  }

  private complete(q: QuestDef) {
    this.done.add(q.id)
    this.index++
    const s = this.scene
    const parts: string[] = []
    let overflowed = false
    for (const k of RESOURCE_ORDER) {
      const v = q.reward[k]
      if (!v) continue
      const got = s.res.addStored(k, v, false)
      if (got < v) overflowed = true
      parts.push(`+${got} ${k}`)
    }
    if (overflowed) {
      s.fx.popup(s.player.x, s.player.y - 150, 'STORES FULL — BUILD A WAREHOUSE', PAL.danger, 17)
    }
    if (q.reward.xp) { s.player.addXp(q.reward.xp); parts.push(`+${q.reward.xp} xp`) }

    s.audio.play('quest')
    s.fx.popup(s.player.x, s.player.y - 108, `✓ ${q.title.toUpperCase()}`, PAL.good, 24)
    if (parts.length) s.fx.popup(s.player.x, s.player.y - 74, parts.join('   '), PAL.gold, 16)
    s.fx.ring(s.player.x, s.player.y, 200, PAL.good, 0.6)
    s.bus.emit('quest:complete', { id: q.id })

    // The chain is the campaign. Finishing it used to produce one toast and
    // nothing else; now it is a moment, and the game carries on after it.
    if (this.campaignComplete && !this.victoryAt) {
      this.victoryAt = Date.now()
      this.victoryWave = s.waves.wave
      this.victoryPlaytime = s.saves.playtime
      s.bus.emit('campaign:complete', { wave: this.victoryWave })
    }
  }

  /** The live numbers every achievement is measured against. */
  achievementStats(): Record<string, number> {
    const s = this.scene
    return {
      kills: this.kills,
      recruited: s.army.totalRecruited,
      woodTotal: s.res.totalGathered.wood,
      wavesCleared: s.waves.wavesCleared,
      bossKills: this.bossKills,
      campsCleared: this.campsCleared,
      loreRead: s.pois?.count('lore') ?? 0,
      shrinesRestored: s.pois?.count('shrine') ?? 0,
    }
  }

  private checkAchievements() {
    const s = this.scene
    const stats = this.achievementStats()
    for (const a of ACHIEVEMENTS) {
      if (this.unlockedAchievements.has(a.id)) continue
      if ((stats[a.stat] ?? 0) >= a.amount) {
        this.unlockedAchievements.add(a.id)
        s.bus.emit('achievement', { id: a.id, title: a.title })
        s.fx.popup(s.player.x, s.player.y - 140, `ACHIEVEMENT — ${a.title.toUpperCase()}`, PAL.gold, 18)
        s.audio.play('chime', 1.3, 0.8)
      }
    }
  }

  get stats() {
    return { kills: this.kills, bossKills: this.bossKills, campsCleared: this.campsCleared, zonesClaimed: this.zonesClaimed }
  }

  toJSON() {
    const fortressDown = this.scene.camps.camps.some(c => c.spec.id === 'campAshgate' && c.destroyed)
    const finalBoss = fortressDown
      ? this.scene.enemies.list.find(e => e.active && e.alive && e.key === 'cinderRegent') : null
    return {
      index: this.index, done: [...this.done], achievements: [...this.unlockedAchievements],
      defeatedBosses: [...this.defeatedBosses], finalBossHp: fortressDown ? finalBoss?.hp ?? this.finalBossHp : 0,
      kills: this.kills, bossKills: this.bossKills,
      campsCleared: this.campsCleared, zonesClaimed: this.zonesClaimed,
      victoryAt: this.victoryAt, victoryWave: this.victoryWave, victoryPlaytime: this.victoryPlaytime,
    }
  }

  load(d: ReturnType<QuestManager['toJSON']>) {
    this.index = d.index
    this.done = new Set(d.done)
    this.unlockedAchievements = new Set(d.achievements)
    this.defeatedBosses = new Set(d.defeatedBosses ?? [])
    this.finalBossHp = Number.isFinite(d.finalBossHp) ? Math.max(0, d.finalBossHp) : 0
    const count = (n: number | undefined) => Number.isFinite(n) && n! >= 0 ? n! : 0
    this.kills = Math.max(count(d.kills), count(this.scene.combat.kills))
    this.bossKills = Math.max(count(d.bossKills), count(this.scene.combat.bossKills))
    this.campsCleared = Math.max(count(d.campsCleared), this.scene.camps.destroyedCount)
    this.zonesClaimed = Math.max(count(d.zonesClaimed), this.scene.regions.claimedCount - 1)
    // Saves written before the campaign had an ending carry none of these.
    this.victoryAt = d.victoryAt ?? 0
    this.victoryWave = d.victoryWave ?? 0
    this.victoryPlaytime = d.victoryPlaytime ?? 0
    // Before the Regent was added, q20 was the ending. Older saves may also
    // predate victory timestamps; the new defeatedBosses field distinguishes
    // them from a current save waiting at q21.
    if (!Array.isArray(d.defeatedBosses) && this.index === QUESTS.length - 1 && this.done.has('q20')) {
      this.index = QUESTS.length
      this.done.add('q21')
      this.defeatedBosses.add('cinderRegent')
      this.finalBossHp = 0
      if (!this.victoryAt) {
        this.victoryAt = Date.now()
        this.victoryWave = this.scene.waves.wave
        this.victoryPlaytime = this.scene.saves.playtime
      }
    }
  }
}
