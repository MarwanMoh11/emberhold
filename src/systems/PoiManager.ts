import type Phaser from 'phaser'
import { POIS, REGION_BY_ID, raster } from '../config/world'
import type { PoiBP, PoiKind } from '../config/world/blueprint'
import { POI } from '../config/balance'
import { BUILDINGS, type BuildingKey } from '../config/buildings'
import { WORKER_FOR } from '../config/units'
import { ENEMIES, type EnemyDef } from '../config/enemies'
import { PAL } from '../config/palette'
import { RESOURCE_ORDER, type ResourceBag } from '../core/types'
import { rr, short } from '../core/math'
import { T } from '../world/raster'
import { landmarkKey, shrineKey, POI_FOOT } from '../art/pois'
import { textStyle } from '../ui/theme'
import type { Building } from '../entities/Building'
import type { Enemy } from '../entities/Enemy'
import type { Mod } from './Modifiers'
import { BARROW_RELICS } from './Relics'
import type { GameScene } from '../scenes/GameScene'

export type PoiState = 'unseen' | 'seen' | 'done'

/** What each shrine registers once restored (design 05 §Shrines); costs live in the blueprint. */
export const SHRINE_MODS: Record<string, Mod[]> = {
  shrineHarvest: [{ stat: 'food.yield', mult: 1.15 }],
  shrineMason: [{ stat: 'wall.hp', mult: 1.2 }],
  shrineFlame: [{ stat: 'hero.xp', mult: 1.1 }, { stat: 'hero.regen', add: 2 }],
  shrineFallen: [{ stat: 'soldier.hp', mult: 1.1 }],
  // outposts heal like a Lv.1 infirmary: its heal, added to every outpost's base
  shrineSpring: [{ stat: 'infirmary.heal', mult: 1.25 }, { stat: 'outpost.heal', add: BUILDINGS.healingTent.levels[0].stats?.heal ?? 9 }],
  shrineTide: [{ stat: 'trade.income', mult: 1.2 }],
}

/**
 * The survivors (design 05 §Survivor conditions): what unlocks them, the
 * population they add, and the free crew that join the nearest camp with a
 * slot (`prefer` first). Crews walk out of the nearest dwelling.
 */
export const SURVIVORS: Record<string, { camp?: string; poi?: string; pop: number; workers: number; prefer: BuildingKey[] }> = {
  survHollow: { camp: 'campRotwood', pop: 6, workers: 2, prefer: [] },
  survFerrow: { camp: 'campFerrow', pop: 6, workers: 2, prefer: ['farm', 'fishery'] },
  // there is no trader crew: the lamp-keeper takes a fishery's boat, or any camp's slot
  survSalt: { poi: 'shrineTide', pop: 4, workers: 1, prefer: ['fishery'] },
}

/** Kinds with a sprite (S14; barrows and relic markers since S15). Relic markers are never used. */
const LIVE = new Set<PoiKind>(['cache', 'lore', 'shrine', 'survivors', 'landmark', 'barrow', 'relic'])
const DWELLINGS = new Set<BuildingKey>(['house', 'cottage'])

interface View {
  poi: PoiBP
  img?: Phaser.GameObjects.Image
  /** landmarks: the silhouette drawn over the fog while its ground is unwalked */
  sil?: Phaser.GameObjects.Image
  glow?: Phaser.GameObjects.Image
  /** shrines and survivors: the name, price or condition, shown when near */
  card?: Phaser.GameObjects.Text
}

export interface PoiDepths { fog: number; light: number; labels: number }

/** A barrow the hero has struck: its hp, and its guardian once broken open. */
interface BarrowRec { hp: number; max: number; guard: Enemy | null; def: EnemyDef | null }

/**
 * Every point of interest (S14, design 05 §Points of interest). A POI is
 * `unseen` until the fog clears within `POI.seeR` of it (a landmark also when
 * the hero comes within `POI.landmarkSeeR`), `seen` after, and `done` once
 * opened, read, restored, joined or reached. Only `done` is saved; `seen` is
 * rebuilt from the explored fog on load. The hero interacts by standing on it.
 */
export class PoiManager {
  private seen = new Set<string>()
  private done = new Set<string>()
  private views = new Map<string, View>()
  /** landmarks whose ground is still under the fog */
  private fogged = new Set<string>()
  /** what has been paid into a shrine the hero stands on; refunded on stepping off */
  private paid: ResourceBag = {}
  private dripT = 0
  private dwell = 0
  private read = false
  private scanT = 0
  private cardId: string | null = null
  private loading = false
  private barrows = new Map<string, BarrowRec>()
  private strikeT = 0
  /** the struck barrow's hp bar, made on first use */
  private bar?: Phaser.GameObjects.Graphics
  /** the POI the hero stands on, or null */
  here: string | null = null

  constructor(private readonly scene: GameScene, private readonly depth: PoiDepths) {
    for (const poi of POIS) if (LIVE.has(poi.kind)) this.views.set(poi.id, this.makeView(poi))
    this.sweep()
  }

  private makeView(poi: PoiBP): View {
    const s = this.scene
    const v: View = { poi }
    const tex = poi.kind === 'cache' ? 'chest' : poi.kind === 'lore' ? 'poi_lore' : poi.kind === 'shrine' ? 'poi_shrine_ruin'
      : poi.kind === 'survivors' ? 'poi_survivors' : poi.kind === 'barrow' ? 'poi_barrow'
      : poi.kind === 'relic' ? 'poi_relic' : landmarkKey(poi.id)
    const foot = poi.kind === 'cache' ? 5 : POI_FOOT
    const img = s.add.image(poi.x, poi.y, tex)
    img.setOrigin(0.5, 1 - foot / img.height).setDepth(poi.y)
    s.culler?.add(img, poi.x, poi.y - img.height / 2, Math.max(img.width, img.height) / 2)
    v.img = img
    if (poi.kind === 'landmark') {
      // over the fog, so it reads from far off; hidden once its ground is walked
      v.sil = s.add.image(poi.x, poi.y, tex).setOrigin(0.5, 1 - POI_FOOT / img.height)
        .setDepth(this.depth.fog + 2).setTintFill(0x3a2c24).setAlpha(0.55)
      s.culler?.add(v.sil, poi.x, poi.y - img.height / 2, Math.max(img.width, img.height) / 2)
      this.fogged.add(poi.id)
    }
    if (poi.kind === 'shrine') {
      v.glow = s.add.image(poi.x, poi.y - 40, 'fx_glow_gold').setBlendMode('ADD')
        .setScale(2.4).setAlpha(0.5).setDepth(this.depth.light + 1).setVisible(false)
      s.culler?.add(v.glow, poi.x, poi.y - 40, 90)
    }
    if (poi.kind === 'shrine' || poi.kind === 'survivors') {
      v.card = s.add.text(poi.x, poi.y - img.height + POI_FOOT - 10, '', textStyle({
        size: 13, weight: '700', colour: PAL.bone, align: 'center', stroke: 4,
      })).setOrigin(0.5, 1).setDepth(this.depth.labels).setVisible(false)
    }
    return v
  }

  // ---- state ----------------------------------------------------------------------

  state(id: string): PoiState {
    return this.done.has(id) ? 'done' : this.seen.has(id) ? 'seen' : 'unseen'
  }

  /** Why a POI cannot be used yet, or null. Survivors wait on their camp or shrine. */
  lockedBy(id: string): string | null {
    const sv = SURVIVORS[id]
    if (!sv) return null
    if (sv.camp && !this.scene.camps.isBurned(sv.camp)) return sv.camp
    if (sv.poi && !this.done.has(sv.poi)) return sv.poi
    return null
  }

  /** Done POIs of one kind (Loremaster counts lore, Pilgrim shrines). */
  count(kind: PoiKind): number {
    let n = 0
    for (const id of this.done) if (POI_BY_ID.get(id)?.kind === kind) n++
    return n
  }

  /** Population the survivors who joined add to the cap. */
  popBonus(): number {
    let n = 0
    for (const [id, sv] of Object.entries(SURVIVORS)) if (this.done.has(id)) n += sv.pop
    return n
  }

  // ---- seeing ---------------------------------------------------------------------

  /** Fog was cleared at (x, y) (RegionManager.eraseFog). */
  revealAt(x: number, y: number) {
    const r = POI.seeR
    for (const poi of POIS) {
      const dx = poi.x - x, dy = poi.y - y
      if (dx * dx + dy * dy > r * r) continue
      if (this.fogged.delete(poi.id)) this.views.get(poi.id)?.sil?.setVisible(false)
      if (!this.seen.has(poi.id)) this.markSeen(poi)
    }
  }

  /** Mark seen whatever the explored fog already covers, silently (construction and load). */
  private sweep() {
    const regions = this.scene.regions
    if (!regions) return
    const was = this.loading
    this.loading = true
    for (const poi of POIS) {
      if (!regions.exploredNear(poi.x, poi.y, POI.seeR)) continue
      if (this.fogged.delete(poi.id)) this.views.get(poi.id)?.sil?.setVisible(false)
      if (!this.seen.has(poi.id)) this.markSeen(poi)
    }
    this.loading = was
  }

  private markSeen(poi: PoiBP) {
    this.seen.add(poi.id)
    if (!this.loading) this.scene.bus?.emit('poi:seen', { id: poi.id, kind: poi.kind })
  }

  // ---- interacting ----------------------------------------------------------------

  /**
   * Use a POI now, wherever the hero stands (the harness and tests; standing
   * on it does the same, with a shrine paid in drips). False when it is done,
   * locked, unaffordable, or not a kind S14 handles.
   */
  interact(id: string): boolean {
    const poi = POI_BY_ID.get(id)
    if (!poi || !LIVE.has(poi.kind) || this.done.has(id) || this.lockedBy(id)) return false
    switch (poi.kind) {
      case 'barrow': {
        if (this.barrows.get(id)?.guard) return false
        this.breakOpen(poi)
        return true
      }
      case 'cache': this.openCache(poi); return true
      case 'lore': this.readLore(poi); return true
      case 'landmark': this.visit(poi); return true
      case 'survivors': this.join(poi); return true
      case 'shrine': {
        const res = this.scene.res
        const cost = poi.cost ?? {}
        if (!res.canAfford(cost)) return false
        res.spend(cost)
        this.restore(poi)
        return true
      }
    }
    return false
  }

  private finish(poi: PoiBP) {
    this.done.add(poi.id)
    this.seen.add(poi.id)
    if (!this.loading) this.scene.bus?.emit('poi:done', { id: poi.id, kind: poi.kind })
  }

  private openCache(poi: PoiBP) {
    const s = this.scene
    this.finish(poi)
    const img = this.views.get(poi.id)?.img
    if (this.loading) { img?.setVisible(false); return }
    s.openChest(poi.x, poi.y - 10, REGION_BY_ID.get(poi.region)?.tier ?? 1)
    s.fx.popup(poi.x, poi.y - 76, poi.name.toUpperCase(), PAL.bone, 15)
    if (img) s.tweens.add({ targets: img, alpha: 0, duration: 400, onComplete: () => img.setVisible(false) })
  }

  private readLore(poi: PoiBP) {
    if (!this.done.has(poi.id)) this.finish(poi)
    if (!this.loading) this.scene.bus?.emit('poi:lore', { id: poi.id, name: poi.name, text: poi.text ?? '' })
  }

  private visit(poi: PoiBP) {
    this.finish(poi)
    if (this.loading) return
    this.scene.audio.play('chime', 0.8, 0.7)
  }

  private restore(poi: PoiBP) {
    const s = this.scene
    const v = this.views.get(poi.id)
    this.finish(poi)
    s.mods.add(poi.id, ...SHRINE_MODS[poi.id] ?? [])
    v?.img?.setTexture(shrineKey(poi.id))
    v?.glow?.setVisible(true)
    v?.card?.setVisible(false)
    if (this.loading) return
    const stats = new Set((SHRINE_MODS[poi.id] ?? []).map(m => m.stat))
    if (stats.has('wall.hp')) s.buildings.refreshWallHp()
    if (stats.has('soldier.hp')) {
      for (const sol of s.army.soldiers) {
        const k = SHRINE_MODS[poi.id].find(m => m.stat === 'soldier.hp')?.mult ?? 1
        sol.maxHp = Math.round(sol.maxHp * k)
        sol.hp = Math.min(sol.maxHp, Math.round(sol.hp * k))
      }
    }
    if (poi.id === 'shrineTide') this.revealCoast()
    s.fx.ring(poi.x, poi.y - 30, 220, PAL.gold, 0.7)
    s.fx.popup(poi.x, poi.y - 110, `${poi.name.toUpperCase()} RESTORED`, PAL.gold, 20)
    s.audio.play('quest', 1)
  }

  private join(poi: PoiBP) {
    const s = this.scene
    this.finish(poi)
    // on load the save's own recompute counts them, and their crews load with the rest
    if (this.loading) return
    s.buildings.recomputeBonuses()
    const sv = SURVIVORS[poi.id]
    let hired = 0
    for (let i = 0; i < (sv?.workers ?? 0); i++) {
      const home = this.freeCamp(poi.x, poi.y, sv.prefer)
      const key = home && WORKER_FOR[home.key]
      if (!home || !key) break
      const door = nearest(s.buildings.buildings.filter(b => DWELLINGS.has(b.key) && b.level > 0 && b.alive), home.x, home.y)
      const w = s.workers.hire(key, home, door ? { x: door.x, y: door.y + 20 } : undefined)
      if (!w) break
      home.workers.push(w.id)
      home.peakWorkers = Math.max(home.peakWorkers, home.workers.length)
      hired++
    }
    s.fx.ring(poi.x, poi.y, 160, PAL.good, 0.6)
    s.fx.popup(poi.x, poi.y - 70, `+${sv?.pop ?? 0} POPULATION`, PAL.good, 18)
    if (hired < (sv?.workers ?? 0)) s.fx.popup(poi.x, poi.y - 46, 'no camp has room for the rest', PAL.uiDim, 12)
    s.audio.play('recruit', 1)
  }

  /** The nearest built camp with a free crew slot, of the `prefer` keys when one has room. */
  private freeCamp(x: number, y: number, prefer: BuildingKey[]): Building | null {
    const b = this.scene.buildings
    const open = b.buildings.filter(c => c.level > 0 && c.alive && WORKER_FOR[c.key] && c.workers.length < b.slotsOf(c))
    return nearest(open.filter(c => prefer.includes(c.key)), x, y) ?? nearest(open, x, y)
  }

  // ---- barrows and relic markers (S15) ---------------------------------------------

  private barrowRec(poi: PoiBP): BarrowRec {
    let b = this.barrows.get(poi.id)
    if (!b) {
      const c = POI.barrow
      const max = Math.round(c.hp * (1 + c.hpPerTier * (tierOf(poi) - 1)))
      b = { hp: max, max, guard: null, def: null }
      this.barrows.set(poi.id, b)
    }
    return b
  }

  /** The hero's gathering blow (GameScene.tryHarvest's), every `POI.barrow.strike` s while in reach. */
  private tickBarrow(poi: PoiBP, dt: number) {
    const s = this.scene
    const b = this.barrowRec(poi)
    if (b.guard) return
    this.strikeT -= dt
    if (this.strikeT > 0) return
    // keep the cadence whatever the frame rate
    this.strikeT = Math.max(0, this.strikeT + POI.barrow.strike)
    b.hp -= Math.max(12, s.player.stats.damage * 0.6)
    const img = this.views.get(poi.id)?.img
    if (img) {
      s.tweens.killTweensOf(img)
      img.x = poi.x
      s.tweens.add({ targets: img, x: poi.x + rr(-3, 3), duration: 45, yoyo: true, onComplete: () => { img.x = poi.x } })
    }
    s.fx.slash(poi.x + rr(-16, 16), poi.y - 26, rr(-0.4, 0.4), 0.8, 0xffffff)
    s.audio.playVaried('stone', 0.45)
    if (b.hp <= 0) this.breakOpen(poi)
    else this.drawBar(poi, b.hp / b.max)
  }

  private drawBar(poi: PoiBP, f: number) {
    if (!this.bar) this.bar = this.scene.add.graphics().setDepth(this.depth.labels)
    const g = this.bar.clear().setVisible(f > 0 && f < 1)
    const w = 64, x = poi.x - w / 2, y = poi.y - 70
    g.fillStyle(0x140c08, 0.85).fillRect(x - 1, y - 1, w + 2, 7)
    g.fillStyle(0xd8c8a0, 1).fillRect(x, y, w * f, 5)
  }

  /** The slab gives: the guardian wakes at the door and keeps within its leash. */
  private breakOpen(poi: PoiBP) {
    const s = this.scene
    const b = this.barrowRec(poi)
    b.hp = 0
    this.bar?.setVisible(false)
    this.views.get(poi.id)?.img?.setTexture('poi_barrow_open')
    const tier = tierOf(poi), g = POI.barrow.guard
    const name = BARROW_RELICS[poi.id] ? poi.name.replace(/^the /, '').toUpperCase() : 'BARROW WIGHT'
    const def: EnemyDef = { ...ENEMIES.elite, name }
    const e = s.enemies.spawn('elite', poi.x, poi.y + 44, 1 + g.hp * tier, 1 + g.dmg * tier, def)
    if (!e) { this.plunder(poi); return }   // the field is full: the dead stay down
    e.guard = true
    e.home = { id: poi.id, x: poi.x, y: poi.y + 44, leash: POI.barrow.leash, siege: 0 }
    b.guard = e
    b.def = e.def
    s.fx.smoke(poi.x, poi.y - 20, 10)
    s.fx.shake(0.012, 0.3)
    s.fx.popup(poi.x, poi.y - 96, `${name} WAKES`, PAL.danger, 18)
    s.audio.play('boom', 0.5, 0.8)
  }

  /** Guardians that fell hand over the grave goods; one taken off the field unbeaten reseals its barrow. */
  private watchGuards() {
    for (const [id, b] of this.barrows) {
      const e = b.guard
      if (!e || (e.def === b.def && e.alive)) continue
      const poi = POI_BY_ID.get(id)
      if (!poi) continue
      b.guard = null
      if (e.def === b.def && e.hp > 0) {
        b.hp = b.max
        this.views.get(id)?.img?.setTexture('poi_barrow')
        continue
      }
      this.plunder(poi)
    }
  }

  /** The grave goods, a tier-scaled bag at the door, and the relic its guardian carried. */
  private plunder(poi: PoiBP) {
    const s = this.scene
    this.barrows.delete(poi.id)
    this.finish(poi)
    this.views.get(poi.id)?.img?.setTexture('poi_barrow_open')
    if (this.loading) return
    const c = POI.barrow.bag, tier = tierOf(poi), k = 1 + c.perTier * tier
    const bag: [keyof ResourceBag, number][] = [['coins', c.coins * k], ['stone', c.stone * k], ['metal', c.metal * k]]
    if (tier >= 3) bag.push(['crystal', c.crystal * k])
    for (const [res, v] of bag) {
      const n = Math.min(10, Math.max(2, Math.round(v / 30)))
      for (let i = 0; i < n; i++) s.pickups.drop(res as never, Math.ceil(v / n), poi.x, poi.y + 20, 1.5)
    }
    s.fx.explosion(poi.x, poi.y, 110, PAL.gold)
    s.fx.popup(poi.x, poi.y - 90, 'GRAVE GOODS', PAL.gold, 20)
    s.audio.play('quest', 1.1)
    const relic = BARROW_RELICS[poi.id]
    if (relic) s.relics.grant(relic)
  }

  /** A relic was won: its marker lights (Relics.grant). Silent on load. */
  relicHeld(markerId: string, silent = false) {
    const poi = POI_BY_ID.get(markerId)
    if (!poi || poi.kind !== 'relic') return
    const was = this.loading
    this.loading = was || silent
    if (!this.done.has(poi.id)) this.finish(poi)
    this.loading = was
    this.views.get(poi.id)?.img?.setTexture('poi_relic_lit')
  }

  /** The Saltmere Light: every stretch of shore comes out of the fog, and so onto the atlas. */
  private revealCoast() {
    const r = raster()
    const step = POI.coastStep
    const done = new Set<number>()
    for (let i = 0; i < r.N; i++) {
      if (r.terrain[i] !== T.LAND) continue
      const gx = i % r.GW, gy = (i - gx) / r.GW
      const sea = (gx > 0 && r.terrain[i - 1] === T.SEA) || (gx < r.GW - 1 && r.terrain[i + 1] === T.SEA)
        || (gy > 0 && r.terrain[i - r.GW] === T.SEA) || (gy < r.GH - 1 && r.terrain[i + r.GW] === T.SEA)
      if (!sea) continue
      const x = (gx + 0.5) * r.C, y = (gy + 0.5) * r.C
      const key = Math.floor(x / step) * 4096 + Math.floor(y / step)
      if (done.has(key)) continue
      done.add(key)
      this.scene.regions.revealArea(x, y, 160)
    }
  }

  // ---- the frame ------------------------------------------------------------------

  update(dt: number) {
    const s = this.scene
    const p = s.player
    this.watchGuards()
    if (!p.alive) { this.leave(); return }

    // landmarks stand tall enough to be seen from afar, fog or not
    this.scanT -= dt
    if (this.scanT <= 0) {
      this.scanT = 0.25
      const r2 = POI.landmarkSeeR * POI.landmarkSeeR
      for (const v of this.views.values()) {
        if (v.poi.kind !== 'landmark' || this.seen.has(v.poi.id)) continue
        const dx = v.poi.x - p.x, dy = v.poi.y - p.y
        if (dx * dx + dy * dy < r2) this.markSeen(v.poi)
      }
      this.updateCard()
    }

    // what the hero stands on
    let here: View | null = null
    let best = Infinity
    for (const v of this.views.values()) {
      if (v.poi.kind === 'relic') continue
      const reach = v.poi.kind === 'landmark' ? POI.landmarkTouch : v.poi.kind === 'barrow' ? POI.barrow.reach : POI.touch
      const d = Math.hypot(v.poi.x - p.x, v.poi.y - p.y)
      if (d < reach && d < best) { best = d; here = v }
    }
    if ((here?.poi.id ?? null) !== this.here) { this.leave(); this.here = here?.poi.id ?? null }
    if (!here) return
    const poi = here.poi
    if (poi.kind === 'lore') {
      this.dwell += dt
      if (this.dwell >= POI.loreDwell && !this.read) { this.read = true; this.readLore(poi) }
      return
    }
    if (this.done.has(poi.id) || this.lockedBy(poi.id)) return
    if (poi.kind === 'shrine') this.tickRestore(poi, dt)
    else if (poi.kind === 'barrow') this.tickBarrow(poi, dt)
    else this.interact(poi.id)
  }

  /** Pay a shrine's cost in drips, the pad's funding verb, once the whole of it is in reach. */
  private tickRestore(poi: PoiBP, dt: number) {
    const s = this.scene
    const cost = poi.cost ?? {}
    const left: ResourceBag = {}
    for (const k of RESOURCE_ORDER) left[k] = Math.max(0, (cost[k] ?? 0) - (this.paid[k] ?? 0))
    if (!s.res.canAfford(left)) return
    this.dripT -= dt
    if (this.dripT > 0) return
    this.dripT = 0.07
    let owed = 0
    for (const k of RESOURCE_ORDER) {
      const need = left[k] ?? 0
      if (need <= 0) continue
      const got = s.res.take(k, Math.min(need, Math.max(1, Math.ceil((cost[k] ?? 0) / 22))))
      const total = got.carried + got.stored
      this.paid[k] = (this.paid[k] ?? 0) + total
      owed += need - total
      if (total > 0) s.fx.flyResource(s.player.x, s.player.y - 18, poi.x, poi.y - 40, `res_${k}`, 0, undefined, 0.85)
    }
    if (owed > 0) { s.audio.play('deposit', 1, 0.4); return }
    this.paid = {}
    this.restore(poi)
  }

  /** The hero stepped off: a half-paid shrine hands its takings back to the stores. */
  private leave() {
    for (const k of RESOURCE_ORDER) {
      const v = this.paid[k] ?? 0
      if (v > 0) this.scene.res.addStored(k, v, false)
    }
    this.paid = {}
    this.dwell = 0
    this.read = false
    this.here = null
    this.bar?.setVisible(false)
  }

  /** The nearest shrine or survivors within `POI.cardRange` shows its card: name, price or condition. */
  private updateCard() {
    const p = this.scene.player
    let pick: View | null = null
    let best = POI.cardRange
    for (const v of this.views.values()) {
      if (!v.card || this.done.has(v.poi.id)) continue
      const d = Math.hypot(v.poi.x - p.x, v.poi.y - p.y)
      if (d < best) { best = d; pick = v }
    }
    const id = pick?.poi.id ?? null
    if (id !== this.cardId) {
      if (this.cardId) this.views.get(this.cardId)?.card?.setVisible(false)
      this.cardId = id
    }
    if (!pick?.card) return
    const poi = pick.poi
    const lock = this.lockedBy(poi.id)
    const cost = poi.cost ?? {}
    const price = RESOURCE_ORDER.filter(k => cost[k]).map(k => `${short(cost[k] ?? 0)} ${k}`).join('  ·  ')
    const text = poi.kind === 'shrine'
      ? `${poi.name}\n${poi.effect ?? ''}\n${price}${this.scene.res.canAfford(cost) ? '  ·  stand here to restore' : ''}`
      : lock ? `${poi.name}\n${poi.text ?? ''}` : `${poi.name}\n${poi.effect ?? ''}  ·  walk in`
    if (pick.card.text !== text) pick.card.setText(text)
    pick.card.setVisible(true)
  }

  // ---- save -----------------------------------------------------------------------

  /** Done ids, in blueprint order. */
  toJSON(): string[] {
    return POIS.filter(p => this.done.has(p.id)).map(p => p.id)
  }

  /** Apply a save's done ids silently: shrines re-register their modifiers, caches stay open. */
  load(ids: string[] = []) {
    this.loading = true
    for (const id of ids) {
      const poi = POI_BY_ID.get(id)
      if (!poi || this.done.has(id)) continue
      if (poi.kind === 'shrine') this.restore(poi)
      else if (poi.kind === 'cache') this.openCache(poi)
      else if (poi.kind === 'survivors') this.join(poi)
      else if (poi.kind === 'barrow') this.plunder(poi)
      else if (poi.kind === 'relic') this.relicHeld(poi.id, true)
      else this.finish(poi)
    }
    this.loading = false
    this.sweep()
  }

  /** Harness: counts by kind (`done/seen/total`), where the hero stands, the live modifiers. */
  inspect() {
    const kinds: Record<string, string> = {}
    for (const k of new Set(POIS.map(p => p.kind))) {
      const all = POIS.filter(p => p.kind === k)
      kinds[k] = `${all.filter(p => this.done.has(p.id)).length}/${all.filter(p => this.seen.has(p.id)).length}/${all.length}`
    }
    return {
      kinds, here: this.here, dwell: Math.round(this.dwell * 100) / 100, paid: this.paid,
      locked: Object.keys(SURVIVORS).filter(id => this.lockedBy(id)),
      barrows: Object.fromEntries([...this.barrows].map(([id, b]) => [id, b.guard ? `guard ${Math.round(b.guard.hp)}/${b.guard.maxHp}` : `${Math.max(0, Math.round(b.hp))}/${b.max}`])),
      pop: this.popBonus(), mods: this.scene.mods.list().map(m => `${m.source}:${m.stat}${m.mult ? `×${m.mult}` : ''}${m.add ? `+${m.add}` : ''}`),
    }
  }
}

export const POI_BY_ID = new Map(POIS.map(p => [p.id, p]))

const tierOf = (poi: PoiBP) => REGION_BY_ID.get(poi.region)?.tier ?? 1

function nearest<B extends { x: number; y: number }>(list: B[], x: number, y: number): B | null {
  let best: B | null = null, bd = Infinity
  for (const b of list) {
    const d = Math.hypot(b.x - x, b.y - y)
    if (d < bd) { bd = d; best = b }
  }
  return best
}
