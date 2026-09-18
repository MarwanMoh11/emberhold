import { QUESTS, ACHIEVEMENTS, type QuestDef } from '../config/quests'
import { PAL } from '../config/palette'
import { RESOURCE_ORDER, type ResourceType } from '../core/types'
import type { BuildingKey } from '../config/buildings'
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

/**
 * The quest chain doubles as the tutorial. Nothing is explained in prose: each
 * step names one action, the compass arrow points at it, and finishing it pays
 * for the next one.
 */
export class QuestManager {
  index = 0
  done = new Set<string>()
  unlockedAchievements = new Set<string>()

  private kills = 0
  private bossKills = 0
  private campsCleared = 0
  private zonesClaimed = 0

  constructor(private scene: GameScene) {
    const bus = scene.bus
    bus.on('enemy:killed', p => { this.kills++; if (p.boss) this.bossKills++ })
    bus.on('camp:destroyed', () => { this.campsCleared++ })
    bus.on('zone:unlocked', () => { this.zonesClaimed++ })
  }

  get current(): QuestDef | null {
    return this.index < QUESTS.length ? QUESTS[this.index] : null
  }

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
      case 'survive': return { have: s.waves.wave, need: g.wave }
      case 'camp': return { have: this.campsCleared, need: g.amount }
      case 'zone': return { have: this.zonesClaimed, need: g.amount }
      case 'level': return { have: s.player.level, need: g.amount }
    }
  }

  /** Where to point the guidance arrow for the active objective. */
  private targetFor(q: QuestDef): { x: number; y: number } | null {
    const s = this.scene
    const g = q.goal
    if (g.type === 'build') {
      const pad = s.buildings.buildings.find(b =>
        b.key === g.building && b.level === 0 && s.buildings.isPadAvailable(b))
      if (pad) return { x: pad.x, y: pad.y }
    }
    if (g.type === 'upgrade') {
      const pad = s.buildings.buildings.find(b => b.key === g.building && b.level < g.level)
      if (pad) return { x: pad.x, y: pad.y }
    }
    if (g.type === 'workers') {
      const pad = s.buildings.buildings.find(b =>
        b.level > 0 && (b.stats.workers ?? 0) > b.workers.length)
      if (pad) return { x: pad.x, y: pad.y }
    }
    if (g.type === 'recruit') {
      const pad = s.buildings.buildings.find(b => b.level > 0 && (b.key === 'barracks' || b.key === 'archeryRange'))
      if (pad) return { x: pad.x, y: pad.y }
    }
    if (g.type === 'collect') {
      if (g.resource === 'coins') {
        const e = s.enemies.grid.nearest(s.player.x, s.player.y, 1400, en => en.alive && !en.def.structure)
        if (e) return { x: e.x, y: e.y }
      }
      const node = s.nodes.findFor(g.resource as ResourceType, s.player.x, s.player.y, 1600, 0)
      if (node) return { x: node.x, y: node.y }
    }
    if (g.type === 'camp') {
      const camp = s.camps.camps.find(c => !c.destroyed)
      if (camp) return { x: camp.spec.x, y: camp.spec.y }
    }
    if (g.type === 'zone') {
      const z = s.zones.zoneAt(-1, -1)
      void z
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
    return { title: q.title, hint: q.hint, have: Math.min(p.have, p.need), need: p.need, targetX: t?.x, targetY: t?.y }
  }

  update() {
    const q = this.current
    if (!q) return
    const p = this.progress(q)
    if (p.have >= p.need) this.complete(q)
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
  }

  private checkAchievements() {
    const s = this.scene
    const stats: Record<string, number> = {
      kills: this.kills,
      recruited: s.army.totalRecruited,
      woodTotal: s.res.totalGathered.wood,
      wavesCleared: s.waves.wavesCleared,
      bossKills: this.bossKills,
      campsCleared: this.campsCleared,
    }
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
    return {
      index: this.index, done: [...this.done], achievements: [...this.unlockedAchievements],
      kills: this.kills, bossKills: this.bossKills,
      campsCleared: this.campsCleared, zonesClaimed: this.zonesClaimed,
    }
  }

  load(d: ReturnType<QuestManager['toJSON']>) {
    this.index = d.index
    this.done = new Set(d.done)
    this.unlockedAchievements = new Set(d.achievements)
    this.kills = d.kills
    this.bossKills = d.bossKills
    this.campsCleared = d.campsCleared
    this.zonesClaimed = d.zonesClaimed
  }
}
