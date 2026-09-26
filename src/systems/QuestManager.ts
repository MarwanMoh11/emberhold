import { QUESTS, ACHIEVEMENTS, ACTS, actOf, type QuestDef } from '../config/quests'
import { PAL } from '../config/palette'
import { RESOURCE_ORDER, type ResourceType } from '../core/types'
import { dist, short } from '../core/math'
import type { BuildingKey } from '../config/buildings'
import type { Building } from '../entities/Building'
import { CAMPS, POIS, REGIONS, REGION_BY_ID, THRONE, raster, type RegionId } from '../config/world'
import { BARROW_RELICS } from './Relics'
import { NOT_SETTLED, bossCamp } from './questAnchors'
import type { GameScene } from '../scenes/GameScene'

const QUEST_IDS = new Set(QUESTS.map(q => q.id))

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
  /** waystone journeys this session (`travel` goals); not saved: the quest lands the frame it happens */
  private travels = 0
  /** the last act whose banner played; a load sets it, so only a new act (or a new game) plays one */
  private announcedAct = 0
  /** a save from before Campaign 2.0: walk the new chain past what the world already shows, silently */
  private catchUp = false
  private regionsSeen = 0
  private seenTick = 0

  constructor(private scene: GameScene) {
    const bus = scene.bus
    bus.on('enemy:killed', p => {
      this.kills++
      if (p.boss) {
        this.bossKills++
        this.defeatedBosses.add(p.key)
        // S17: her fall is the victory, whatever the quest chain says
        if (p.key === 'cinderRegent') { this.finalBossHp = 0; this.stampVictory() }
      }
    })
    bus.on('camp:burned', () => { this.campsCleared++ })
    bus.on('region:claimed', () => { this.zonesClaimed++ })
    bus.on('waystone:travelled', () => { this.travels++ })
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
      case 'build': return {
        have: g.region ? this.builtIn(g.building, g.region) : s.buildings.countBuilt(g.building as BuildingKey),
        need: g.amount ?? 1,
      }
      case 'upgrade': return { have: s.buildings.highestLevel(g.building as BuildingKey), need: g.level }
      case 'recruit': return { have: s.army.count, need: g.amount }
      case 'workers': return { have: s.workers.count, need: g.amount }
      case 'survive': return { have: s.waves.wavesCleared, need: g.wave }
      case 'camp': return { have: this.campsCleared, need: g.amount }
      case 'zone': return { have: s.regions.claimedCount, need: g.amount }
      case 'level': return { have: s.player.level, need: g.amount }
      case 'boss': return { have: this.bossDown(g.key) ? 1 : 0, need: 1 }
      case 'claim': return { have: s.regions.claimed(g.region) ? 1 : 0, need: 1 }
      case 'burn': return { have: s.camps.isBurned(g.camp) ? 1 : 0, need: 1 }
      case 'restore': return { have: s.pois?.count('shrine') ?? 0, need: g.amount }
      case 'relic': return { have: s.relics?.list().length ?? 0, need: g.amount }
      case 'reach': return { have: s.pois?.state(g.poi) === 'done' ? 1 : 0, need: 1 }
      case 'travel': return { have: Math.min(1, this.travels), need: 1 }
      case 'line': {
        const pads = s.buildings.linePads(g.line)
        return { have: pads.filter(b => b.level > 0 && b.alive).length, need: pads.length || 1 }
      }
      case 'settle': return { have: this.settled(g.region), need: g.count }
    }
  }

  private builtIn(key: BuildingKey, region: RegionId) {
    let n = 0
    for (const b of this.scene.buildings.buildings) if (b.key === key && b.region === region && b.level > 0) n++
    return n
  }

  /** Buildings standing in a region; walls and gates are fortification, not a village. */
  private settled(region: RegionId) {
    let n = 0
    for (const b of this.scene.buildings.buildings) {
      if (b.region === region && b.level > 0 && b.alive && !NOT_SETTLED.has(b.key)) n++
    }
    return n
  }

  /** Killed, or known dead: a stronghold burned (never while warded) or its boss's guard slot down. */
  private bossDown(key: string) {
    if (this.defeatedBosses.has(key)) return true
    const c = bossCamp(key)
    const camps = this.scene.camps
    return !!c && (camps.isBurned(c.id) || !!camps.guardsDown?.has(`${c.id}.boss`))
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

  /** The nearest of `list` to the hero; `bias` adds px to push some back (gated, unclaimed…). */
  private nearest<T extends { x: number; y: number }>(list: T[], bias: (t: T) => number = () => 0): T | null {
    const p = this.scene.player
    let best: T | null = null
    let bestD = Infinity
    for (const t of list) {
      const d = dist(p.x, p.y, t.x, t.y) + bias(t)
      if (d < bestD) { bestD = d; best = t }
    }
    return best
  }

  /** Unbuilt pads: an open one nearest, else the one gated the least (lowest hall, claimed ground first). */
  private padTarget(pads: Building[]): Guidance | null {
    const s = this.scene
    const open = this.nearest(pads.filter(b => s.buildings.isPadAvailable(b)))
    if (open) return { x: open.x, y: open.y }
    const gate = (b: Building) => Math.max(b.requiresTownHall, b.def.requiresTownHall ?? 0) * 1e6
      + (s.regions.claimed(b.region) ? 0 : 5e5)
    const b = this.nearest(pads, gate)
    return b ? this.gatedTarget(b) : null
  }

  /** The border stone, or whatever stands before it: the hall, the region it is claimed from, a camp, the price. */
  private claimTarget(id: RegionId, depth = 0): Guidance | null {
    const s = this.scene
    const z = REGION_BY_ID.get(id)
    const chk = s.regions.canClaim(id)
    if (!z || chk.reason === null) return null
    if (chk.reason === 'hall') {
      const hall = s.buildings.townHall
      return { x: hall.x, y: hall.y, hint: `Command Hall Lv.${z.hall} first` }
    }
    if (chk.reason === 'adjacent' && depth < 8) {
      const from = this.claimTarget(z.claim.from, depth + 1)
      if (from) return { ...from, hint: from.hint ?? chk.why }
    }
    if (chk.reason === 'camps') {
      const c = CAMPS.find(k => z.requiresCamps?.includes(k.id) && !s.camps.isBurned(k.id))
      if (c) { const t = this.throughZone(c.x, c.y); return { ...t, hint: t.hint ?? chk.why } }
    }
    if (chk.reason === 'cost') {
      const price = RESOURCE_ORDER.filter(k => z.cost[k]).map(k => `${short(z.cost[k] ?? 0)} ${k}`).join(', ')
      return { x: z.claim.x, y: z.claim.y, hint: `Save for ${z.name}: ${price}` }
    }
    return { x: z.claim.x, y: z.claim.y }
  }

  /** Nearest of the points, claimed ground first, through the claim that opens it. */
  private placeTarget(pts: { x: number; y: number; region?: RegionId }[]): Guidance | null {
    const s = this.scene
    const t = this.nearest(pts, p => (!p.region || s.regions.claimed(p.region) ? 0 : 1e6))
    return t ? this.throughZone(t.x, t.y) : null
  }

  private campTarget(id: string, hint?: string): Guidance | null {
    const c = CAMPS.find(k => k.id === id)
    if (!c || this.scene.camps.isBurned(id)) return null
    const t = this.throughZone(c.x, c.y)
    return hint && !t.hint ? { ...t, hint } : t
  }

  /** Where to point the guidance arrow for the active objective. */
  private targetFor(q: QuestDef): Guidance | null {
    const s = this.scene
    const g = q.goal
    switch (g.type) {
      case 'build':
        return this.padTarget(s.buildings.buildings.filter(b =>
          b.key === g.building && b.level === 0 && (!g.region || b.region === g.region)))
      case 'settle':
        return this.padTarget(s.buildings.buildings.filter(b =>
          b.region === g.region && b.level === 0 && !NOT_SETTLED.has(b.key) && !b.padId.includes('.')))
      case 'upgrade': {
        const pads = s.buildings.buildings.filter(b => b.key === g.building && b.level < g.level)
        const open = pads.find(b => s.regions.claimed(b.region))
        if (open) return { x: open.x, y: open.y }
        return pads.length ? this.gatedTarget(pads[0]) : null
      }
      case 'workers': {
        const pad = s.buildings.buildings.find(b =>
          b.level > 0 && (b.stats.workers ?? 0) > b.workers.length && s.regions.claimed(b.region))
        return pad ? { x: pad.x, y: pad.y } : null
      }
      case 'recruit': {
        const pad = s.buildings.buildings.find(b =>
          b.level > 0 && (b.key === 'barracks' || b.key === 'archeryRange') && s.regions.claimed(b.region))
        return pad ? { x: pad.x, y: pad.y } : null
      }
      case 'collect': {
        if (g.resource === 'coins') {
          // enemies inside a locked zone are behind the barrier: ignore them
          const e = s.enemies.grid.nearest(s.player.x, s.player.y, 1400, en =>
            en.alive && !en.def.structure && !s.regions.unclaimedAt(en.x, en.y))
          if (e) return { x: e.x, y: e.y }
        }
        const node = s.nodes.findFor(g.resource as ResourceType, s.player.x, s.player.y, 1600, 0)
        return node ? { x: node.x, y: node.y } : null
      }
      case 'camp': {
        // prefer one you can walk to; fall back to naming the border in the way
        const live = CAMPS.filter(c => !s.camps.isBurned(c.id))
        return this.placeTarget(live)
      }
      case 'boss': {
        const boss = s.enemies.list.find(e => e.active && e.alive && e.key === g.key)
        if (boss) return { x: boss.x, y: boss.y }
        if (g.key === THRONE.boss) {
          return this.campTarget('campAshgate', 'Burn Ashgate Fortress first') ?? this.throughZone(THRONE.x, THRONE.y)
        }
        const c = bossCamp(g.key)
        return c ? this.campTarget(c.id) : null
      }
      case 'zone': return s.zonesNextTarget()
      case 'claim': return this.claimTarget(g.region)
      case 'burn': return this.campTarget(g.camp)
      case 'restore':
        return this.placeTarget(POIS.filter(p => p.kind === 'shrine' && s.pois?.state(p.id) !== 'done'))
      case 'relic': {
        const barrows = POIS.filter(p => p.id in BARROW_RELICS && s.pois?.state(p.id) !== 'done')
        const holds = CAMPS.filter(c => c.boss && !this.bossDown(c.boss))
        return this.placeTarget([...barrows, ...holds])
      }
      case 'reach': {
        const poi = POIS.find(p => p.id === g.poi)
        if (!poi) return null
        const lock = s.pois?.lockedBy(poi.id)
        const camp = lock ? CAMPS.find(c => c.id === lock) : null
        if (camp) return this.campTarget(camp.id, `Burn ${camp.name} first`)
        return this.throughZone(poi.x, poi.y)
      }
      case 'travel': {
        const w = s.waystones
        if (!w) return null
        const stones = w.list()
        const here = w.here ? stones.find(t => t.id === w.here) : null
        if (here) return { x: here.x, y: here.y, hint: 'Open the map and pick a lit stone' }
        const lit = stones.filter(t => t.active)
        if (lit.length < 2) {
          const unlit = this.nearest(stones.filter(t => !t.active))
          if (unlit) return { x: unlit.x, y: unlit.y, hint: `Touch the stone at ${unlit.name}` }
        }
        const near = this.nearest(lit)
        return near ? { x: near.x, y: near.y, hint: 'Stand on a lit waystone and travel' } : null
      }
      case 'line': {
        const b = s.buildings.linePads(g.line).find(p => !(p.level > 0 && p.alive))
        if (!b) return null
        return b.level === 0 ? this.gatedTarget(b) : { x: b.x, y: b.y, hint: 'Rebuild the broken piece' }
      }
      case 'kill': case 'survive': case 'level':
        return null
    }
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
    if (this.catchUp) this.fastForward()
    const q = this.current
    if (q) {
      this.announce(q)
      const p = this.progress(q)
      if (p.have >= p.need) this.complete(q)
    }
    // Deliberately outside the quest check: the endless nights past the last
    // quest are exactly where the 1,000- and 5,000-kill marks get passed, and
    // an early return here meant those could never be earned.
    this.checkAchievements()
  }

  /** The act banner, once, as the chain enters an act (a new game plays Act I's). */
  private announce(q: QuestDef) {
    const act = actOf(q)
    if (act <= this.announcedAct) return
    this.announcedAct = act
    const a = ACTS[act - 1]
    if (a) this.scene.bus.emit('act:begun', { act, roman: a.roman, name: a.name, blurb: a.blurb })
  }

  /** Past every quest the world already shows done, with no rewards and no banners (a pre-2.0 save). */
  private fastForward() {
    this.catchUp = false
    for (let q = this.current; q; q = this.current) {
      const p = this.progress(q)
      if (p.have < p.need) break
      this.done.add(q.id)
      this.index++
    }
    this.announcedAct = this.current ? actOf(this.current) : ACTS.length
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
    if (this.campaignComplete) this.stampVictory()
  }

  /** Stamp the victory once (the Regent's fall, or the last quest) and play the run summary. */
  private stampVictory() {
    if (this.victoryAt) return
    const s = this.scene
    this.victoryAt = Date.now()
    this.victoryWave = s.waves.wave
    this.victoryPlaytime = s.saves.playtime
    s.bus.emit('campaign:complete', { wave: this.victoryWave })
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
      relicsHeld: s.relics?.list().length ?? 0,
      thornmother: this.bossDown('thornmother') ? 1 : 0,
      forges: s.camps.isBurned('campForges') ? 1 : 0,
      regionsSeen: this.seen(),
      waystonesLit: s.waystones?.toJSON().length ?? 0,
    }
  }

  /** Regions with any explored ground; a scan of the fog every ~90 frames until all are seen. */
  private seen() {
    if (this.regionsSeen >= REGIONS.length || this.seenTick++ % 90) return this.regionsSeen
    const r = raster()
    const found = new Set<number>()
    this.scene.regions.forEachExplored((x, y) => {
      const i = r.cell(x, y)
      if (i >= 0 && r.region[i] >= 0) found.add(r.region[i])
    })
    return (this.regionsSeen = found.size)
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
    // Campaign 2.0 (S18) renamed every quest. A save from the old chain
    // restarts the new one and walks it, silently, past what the world
    // already shows done; the walk waits for the first update (the scene
    // is still loading here).
    if (this.index > QUESTS.length || [...this.done].some(id => !QUEST_IDS.has(id))) {
      this.index = 0
      this.done = new Set()
      this.catchUp = true
    }
    this.announcedAct = this.current ? actOf(this.current) : ACTS.length
  }
}
