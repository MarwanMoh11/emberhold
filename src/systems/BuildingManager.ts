import Phaser from 'phaser'
import { Building } from '../entities/Building'
import type { BuildingKey } from '../config/buildings'
import { PADS, WALL_RING, type PadSpec } from '../config/map'
import { PAL } from '../config/palette'
import { POP, PERF } from '../config/balance'
import { Grid } from '../core/Grid'
import { RESOURCE_ORDER, type ResourceBag, type ResourceType } from '../core/types'
import { clamp, dist, rr, short } from '../core/math'
import { SOLDIERS, WORKER_FOR, WORKERS, type SoldierKey } from '../config/units'
import { wantsTouchTargets, DPR } from '../core/device'
import type { GameScene } from '../scenes/GameScene'
import { BuildingPanel, type PanelChip, type PanelRow } from '../ui/BuildingPanel'

/** SPEAR → Spear: the card's small caps do the shouting. */
const cap = (w: string) => w.charAt(0) + w.slice(1).toLowerCase()

/** Seconds the hero must stand on a pad before it starts drawing resources. */
const DWELL = 0.3

const TEX: Record<ResourceType, string> = {
  coins: 'res_coins', wood: 'res_wood', food: 'res_food',
  stone: 'res_stone', metal: 'res_metal', crystal: 'res_crystal',
}

/**
 * Every soldier each military building can muster, cheapest tier first.
 *
 * A building's level says which of these are *available*; it never says which
 * one gets trained. The old rule replaced the roster on every upgrade, so a
 * Lv.3 Barracks could no longer field a swordsman and — worse — the spearman,
 * the game's anti-heavy counter, vanished from the world at exactly the wave
 * where brutes and elites start arriving. Now the level is a floor and the
 * player picks off the card.
 */
const ROSTER: Partial<Record<BuildingKey, SoldierKey[]>> = (() => {
  const out: Partial<Record<BuildingKey, SoldierKey[]>> = {}
  for (const k of Object.keys(SOLDIERS) as SoldierKey[]) {
    const list = out[SOLDIERS[k].from] ?? (out[SOLDIERS[k].from] = [])
    list.push(k)
  }
  for (const list of Object.values(out)) list?.sort((a, b) => SOLDIERS[a].tier - SOLDIERS[b].tier)
  return out
})()

/** How much of a razed site's cost survives as salvage in the rubble. */
const RUBBLE_REFUND = 0.6

/** How much of everything sunk into a building comes back when you pull it down. */
const DEMOLISH_REFUND = 0.5

/**
 * Seconds DEMOLISH must be held without interruption. Long enough that it can
 * only ever be on purpose: standing somewhere is how everything else in this
 * game is triggered, so the one destructive act needs a deliberate, sustained
 * press that letting go at any point throws away.
 */
const DEMOLISH_HOLD = 1.6

export class BuildingManager {
  buildings: Building[] = []
  byPad = new Map<string, Building>()
  grid = new Grid<Building>(PERF.gridCell * 2)

  /** aggregated settlement bonuses, recomputed whenever something is built */
  bonus = {
    pop: POP.base, carry: 0, prod: 0,
    heroDmg: 0, troopDmg: 0, towerDmg: 0, towerRate: 0, repair: 0,
    heal: 0, healRadius: 0,
  }

  private panel: BuildingPanel
  private activePanelFor: Building | null = null
  private healTick = 0
  private autoHireTick = 0

  /** Which unit each muster line has been set to train, by pad id. */
  private trains = new Map<string, SoldierKey>()

  /** Pad whose DEMOLISH bar is being held down, and for how long so far. */
  private razePad: string | null = null
  private razeT = 0

  /**
   * The pad the hero is standing in having just pulled it down. An empty site
   * rebuilds itself out of your stores the moment you stand in one, which put
   * the building straight back up under the feet of the player who had just
   * paid to be rid of it. Stepping off the pad clears this.
   */
  private justRazed: string | null = null

  /** Farm pads whose crop ring has already been sown, so a rebuild adds none. */
  private fielded = new Set<string>()

  private shiftKey?: Phaser.Input.Keyboard.Key

  constructor(private scene: GameScene) {
    this.panel = new BuildingPanel(scene, {
      upgrade: b => this.commitUpgrade(b),
      pickUnit: (b, key) => this.setTrains(b, key as SoldierKey),
      raze: (b, holding) => this.setRazing(b, holding),
    })
    this.shiftKey = scene.input.keyboard?.addKey('SHIFT')
  }

  /** Player tapped UPGRADE on the world panel. */
  commitUpgrade(b: Building) {
    if (b.level === 0 || b.isMax) return
    b.committed = true
    b.dwellT = Math.max(b.dwellT, DWELL)
    this.scene.audio.play('ui')
    if (!this.scene.res.canAfford(b.remaining())) {
      this.scene.fx.popup(b.x, b.y - b.def.h - 26, 'PARTIAL — BRING MORE', PAL.gold, 15)
    }
  }

  // ---- setup -----------------------------------------------------------
  build() {
    for (const spec of PADS) this.addPad(spec)
    this.generateWalls()
    this.recomputeBonuses()
  }

  private addPad(spec: PadSpec) {
    const b = new Building(this.scene, spec)
    // Later levels draw taller than the level-1 ghost, so the disc is generous.
    const r = Math.max(b.ghost.width, b.ghost.height) * 1.5
    this.scene.culler.add(b.sprite, b.x, b.y - b.ghost.height / 2, r)
    this.scene.culler.add(b.ghost, b.x, b.y - b.ghost.height / 2, r)
    this.buildings.push(b)
    this.byPad.set(spec.id, b)
    if (spec.startLevel) {
      for (let i = 0; i < spec.startLevel; i++) b.completeLevel()
      this.onBuilt(b, true)
    }
    return b
  }

  private generateWalls() {
    const { left, right, top, bottom, step, gates } = WALL_RING
    const specs: PadSpec[] = []
    const gapNear = (x: number, y: number) => gates.some(g => Math.hypot(g.x - x, g.y - y) < 96)
    let i = 0
    for (let x = left; x <= right; x += step) {
      for (const y of [top, bottom]) {
        if (gapNear(x, y)) continue
        specs.push({ id: `wall${i++}`, key: 'wall', x, y, zone: 'hold' })
      }
    }
    for (let y = top + step; y < bottom; y += step) {
      for (const x of [left, right]) {
        if (gapNear(x, y)) continue
        specs.push({ id: `wall${i++}`, key: 'wall', x, y, zone: 'hold' })
      }
    }
    for (const g of gates) {
      specs.push({ id: g.id, key: 'gate', x: g.x, y: g.y, zone: 'hold' })
    }
    for (const s of specs) this.addPad(s)
  }

  // ---- queries ---------------------------------------------------------
  /** True while a build-site card is on screen; other world panels defer to it. */
  get panelShown() { return this.panel.isShown }

  /** Is this world point on the build card? Used to keep taps off the stick. */
  panelContains(x: number, y: number) { return this.panel.containsWorldPoint(x, y) }

  get townHall() { return this.byPad.get('hall')! }
  get depot() { return this.byPad.get('depot')! }
  get townHallLevel() { return this.townHall?.level ?? 1 }

  countBuilt(key: BuildingKey) {
    let c = 0
    for (const b of this.buildings) if (b.key === key && b.level > 0) c++
    return c
  }

  has(key: BuildingKey) { return this.countBuilt(key) > 0 }

  highestLevel(key: BuildingKey) {
    let lvl = 0
    for (const b of this.buildings) if (b.key === key) lvl = Math.max(lvl, b.level)
    return lvl
  }

  get towerCount() { return this.buildings.filter(b => b.def.tower && b.level > 0).length }

  get totalWallHp() {
    let hp = 0
    for (const b of this.buildings) if ((b.key === 'wall' || b.key === 'gate') && b.level > 0) hp += b.hp
    return hp
  }

  /** Hall level this pad waits on, or 0 when nothing gates it. */
  hallGate(b: Building) {
    return Math.max(b.requiresTownHall, b.def.requiresTownHall ?? 0)
  }

  /** Every unit this building will ever muster, locked ones included. */
  rosterFor(b: Building): SoldierKey[] { return ROSTER[b.key] ?? [] }

  /** The ones its current level has actually unlocked. */
  unlockedFor(b: Building): SoldierKey[] {
    return this.rosterFor(b).filter(k => SOLDIERS[k].tier <= b.level)
  }

  /**
   * Who this muster line turns out next. With nothing chosen it defaults to
   * the best unlocked unit, which is what the building used to be locked into.
   */
  trainsAt(b: Building): SoldierKey | null {
    const open = this.unlockedFor(b)
    if (!open.length) return null
    const picked = this.trains.get(b.padId)
    return picked && open.includes(picked) ? picked : open[open.length - 1]
  }

  /** Player tapped a unit chip. Costs nothing — it only aims the next recruit. */
  setTrains(b: Building, key: SoldierKey) {
    const def = SOLDIERS[key]
    if (!def || def.from !== b.key) return
    if (def.tier > b.level) {
      this.scene.fx.popup(b.x, b.y - b.def.h - 26,
        `${def.name.toUpperCase()} NEEDS LV.${def.tier}`, PAL.danger, 15)
      this.scene.audio.play('deny')
      return
    }
    if (this.trains.get(b.padId) === key) return
    this.trains.set(b.padId, key)
    b.recruitCd = Math.max(b.recruitCd, 0)
    this.scene.audio.play('ui')
    this.scene.fx.popup(b.x, b.y - b.def.h - 26, `MUSTERING ${def.short}`, PAL.gold, 16)
  }

  /** A pad only shows once its zone is claimed and the hall is tall enough. */
  isPadAvailable(b: Building) {
    if (!this.scene.zones.isUnlocked(b.zone)) return false
    const needHall = Math.max(b.requiresTownHall, b.def.requiresTownHall ?? 0)
    return this.townHallLevel >= needHall
  }

  recomputeBonuses() {
    const bo = this.bonus
    bo.pop = POP.base
    bo.carry = 0
    bo.prod = 0
    bo.heroDmg = 0; bo.troopDmg = 0; bo.towerDmg = 0; bo.towerRate = 0; bo.repair = 0
    bo.heal = 0; bo.healRadius = 0
    for (const b of this.buildings) {
      if (b.level === 0) continue
      const s = b.stats
      bo.pop += s.pop ?? 0
      bo.prod += s.prod ?? 0
      bo.carry = Math.max(bo.carry, s.carry ?? 0)
      bo.heroDmg += s.heroDmg ?? 0
      bo.troopDmg += s.troopDmg ?? 0
      bo.towerDmg += s.towerDmg ?? 0
      bo.towerRate += s.towerRate ?? 0
      bo.repair += s.repair ?? 0
      if ((s.heal ?? 0) > bo.heal) { bo.heal = s.heal ?? 0; bo.healRadius = s.radius ?? 0 }
    }
    this.scene.res.setBuildingCarry(bo.carry)
    this.scene.applyBuildingBonuses()
  }

  // ---- construction ----------------------------------------------------
  private onBuilt(b: Building, silent = false) {
    if (!silent) {
      this.scene.fx.dust(b.x, b.y, 14)
      this.scene.fx.ring(b.x, b.y - 10, 120, PAL.gold, 0.45)
      this.scene.fx.shake(0.008, 0.2)
      this.scene.audio.play(b.level > 1 ? 'upgrade' : 'build')
      const label = b.def.levels[b.level - 1].label ?? (b.level > 1 ? `${b.def.name} Lv.${b.level}` : b.def.name)
      this.scene.fx.popup(b.x, b.y - b.def.h - 26, label.toUpperCase(), PAL.gold, 22)
      this.scene.bus.emit('building:built', { key: b.key, level: b.level })
    }

    if (b.key === 'farm' && b.level === 1 && !this.fielded.has(b.padId)) {
      this.fielded.add(b.padId)
      this.scene.nodes.addField(b.x, b.y + 40, b.zone, 5)
    }
    this.recomputeBonuses()
  }

  /** Drip resources from the hero into whatever pad they are standing in. */
  private tickDeposit(b: Building, dt: number) {
    const cost = b.nextCost
    if (!cost) return
    const res = this.scene.res
    b.depositT -= dt
    if (b.depositT > 0) return
    b.depositT = 0.07

    // The bank is only opened up when the whole job can actually be finished.
    // Otherwise a player who wanders onto an expensive site would have every
    // coin they own swallowed by a building they cannot complete.
    const canFinish = res.canAfford(b.remaining())

    let moved = false
    for (const k of RESOURCE_ORDER) {
      const need = (cost[k] ?? 0) - (b.progress[k] ?? 0)
      if (need <= 0) continue
      const chunk = Math.max(1, Math.ceil((cost[k] ?? 0) / 22))
      const want = Math.min(need, chunk, canFinish ? Infinity : res.carried[k])
      if (want <= 0) continue
      const got = res.take(k, want)
      const total = got.carried + got.stored
      if (total <= 0) continue
      moved = true
      b.deposit(k, total)
      const px = this.scene.player.x, py = this.scene.player.y - 18
      const sx = got.carried > 0 ? px : this.depot.x
      const sy = got.carried > 0 ? py : this.depot.y - 20
      this.scene.fx.flyResource(sx, sy, b.x, b.y - b.def.h * 0.4, TEX[k], 0, undefined, 0.85)
    }
    if (moved) this.scene.audio.play('deposit', rr(0.9, 1.25), 0.5)

    if (b.isFunded()) this.startRaise(b)
  }

  private startRaise(b: Building) {
    b.state = 'raising'
    b.raiseT = 0
    b.raiseDur = b.level === 0 ? 1.0 : 0.7
    b.setFrameTexture()
    b.sprite.setAlpha(0.92)
    this.scene.fx.dust(b.x, b.y, 10)
    this.scene.audio.play('build')
  }

  private finishRaise(b: Building) {
    b.completeLevel()
    b.sprite.setAlpha(1).setScale(1, 0.62)
    this.scene.tweens.add({
      targets: b.sprite, scaleX: 1, scaleY: 1, duration: 340, ease: 'Back.easeOut',
    })
    this.onBuilt(b)
  }

  // ---- recruitment -----------------------------------------------------
  private tickRecruit(b: Building, dt: number) {
    b.recruitCd -= dt
    if (b.recruitCd > 0) return
    const key = this.trainsAt(b)
    if (!key) return
    const def = SOLDIERS[key]
    const res = this.scene.res

    if (this.scene.popUsed + def.pop > this.bonus.pop) {
      if (b.recruitCd <= -1.4) {
        b.recruitCd = 0
        this.scene.fx.popup(b.x, b.y - b.def.h - 20, 'NO ROOM — BUILD A LONGHOUSE', PAL.danger, 16)
        this.scene.audio.play('deny')
      }
      return
    }
    if (!res.canAfford(def.cost)) return

    res.spend(def.cost)
    b.recruitCd = 0.55 / (b.stats.trainMult ?? 1)
    this.scene.army.recruit(key, b.x, b.y + 14)
    for (const k of RESOURCE_ORDER) {
      if (!def.cost[k]) continue
      this.scene.fx.flyResource(this.scene.player.x, this.scene.player.y - 18, b.x, b.y - 20, TEX[k], 0, undefined, 0.8)
    }
  }

  private tickHireWorker(b: Building, dt: number) {
    b.recruitCd -= dt
    if (b.recruitCd > 0) return
    const wkey = WORKER_FOR[b.key]
    if (!wkey) return
    const def = WORKERS[wkey]
    const slots = b.stats.workers ?? 0
    if (b.workers.length >= slots) return
    if (this.scene.popUsed + def.pop > this.bonus.pop) {
      if (b.recruitCd <= -1.4) {
        b.recruitCd = 0
        this.scene.fx.popup(b.x, b.y - b.def.h - 20, 'NO ROOM — BUILD A LONGHOUSE', PAL.danger, 16)
        this.scene.audio.play('deny')
      }
      return
    }
    if (!this.scene.res.canAfford(def.cost)) return
    this.scene.res.spend(def.cost)
    b.recruitCd = 0.8
    const w = this.scene.workers.hire(wkey, b)
    if (w) { b.workers.push(w.id); b.peakWorkers = Math.max(b.peakWorkers, b.workers.length) }
  }

  // ---- towers ----------------------------------------------------------
  private tickTower(b: Building, dt: number) {
    const s = b.stats
    const rate = (s.rate ?? 1) * (1 + this.bonus.towerRate)
    b.towerCd -= dt
    if (b.towerCd > 0) return
    const range = s.range ?? 250
    const target = this.scene.enemies.grid.nearest(b.x, b.y, range, e => e.alive)
    if (!target) return
    b.towerCd = 1 / Math.max(0.1, rate)

    const dmg = (s.dmg ?? 10) * (1 + this.bonus.towerDmg)
    const splash = s.splash ?? 0
    const muzzleY = b.y - b.def.h - (b.key === 'cannonTower' ? 16 : 30) - b.level * 5
    const ang = Math.atan2(target.y - muzzleY, target.x - b.x)

    if (splash > 0) {
      this.scene.projectiles.fire(b.x, muzzleY, ang, {
        tex: 'proj_shell', damage: dmg, speed: 420, faction: 'ally', fromPlayer: false, splash,
        knockback: 140, spin: 9, lobTo: { x: target.x, y: target.y },
      })
      this.scene.audio.playVaried('boom', 0.35)
      this.scene.fx.hitSpark(b.x + Math.cos(ang) * 22, muzzleY + Math.sin(ang) * 22, 0xffd24a, 1.2)
    } else {
      this.scene.projectiles.fire(b.x, muzzleY, ang, {
        tex: 'proj_arrow', damage: dmg, speed: 640, faction: 'ally', fromPlayer: false, knockback: 40,
        pierce: b.level >= 4 ? 1 : 0, tint: 0xffffff,
      })
      this.scene.audio.playVaried('shoot', 0.3)
    }
  }

  // ---- collisions ------------------------------------------------------
  /** Push a circular entity out of any solid structure it has walked into. */
  resolveCollision(e: { x: number; y: number; radius: number }) {
    const list = this.grid.query(e.x, e.y, 90, [])
    for (const b of list) {
      if (b.level === 0 || !b.def.blocking) continue
      if (b.key === 'wall' || b.key === 'gate') continue // allies pass their own ramparts
      const dx = e.x - b.x
      const dy = e.y - (b.y - b.halfH * 0.35)
      const ox = b.halfW + e.radius - Math.abs(dx)
      const oy = b.halfH * 0.7 + e.radius - Math.abs(dy)
      if (ox > 0 && oy > 0) {
        if (ox < oy) e.x += dx > 0 ? ox : -ox
        else e.y += dy > 0 ? oy : -oy
      }
    }
  }

  /** Solid structure overlapping this point, used by enemy steering. */
  blockerAt(x: number, y: number, radius: number): Building | null {
    const list = this.grid.query(x, y, 90, [])
    for (const b of list) {
      if (b.level === 0 || !b.def.blocking || !b.alive) continue
      const dx = Math.abs(x - b.x)
      const dy = Math.abs(y - (b.y - b.halfH * 0.35))
      if (dx < b.halfW + radius && dy < b.halfH * 0.7 + radius) return b
    }
    return null
  }

  onBuildingDestroyed(b: Building) {
    this.scene.fx.explosion(b.x, b.y - 10, 90, 0x8a6a45)
    this.scene.fx.smoke(b.x, b.y - 20, 10)
    this.scene.audio.play('boom', 0.8)
    this.scene.fx.shake(0.014, 0.3)
    b.level = Math.max(0, b.level - 1)
    b.progress = {}
    if (b.level === 0) {
      b.state = 'empty'
      b.alive = false
      // Leave rubble, not bare ground. Losing your only lumber camp used to
      // reset the whole economy to zero and demand the full price again, which
      // is where a bad night turned into an unrecoverable one. The frame
      // survives; rebuilding is a top-up, and peakWorkers brings the crew back.
      const cost = b.nextCost
      if (cost) {
        b.progress = {}
        for (const k of RESOURCE_ORDER) {
          const need = cost[k] ?? 0
          if (need > 0) b.progress[k] = Math.floor(need * RUBBLE_REFUND)
        }
      }
      b.applyTexture()
      for (const id of b.workers) this.scene.workers.dismiss(id)
      b.workers.length = 0
      this.scene.fx.popup(b.x, b.y - 40, `${b.def.short} DESTROYED`, PAL.danger, 18)
      this.scene.fx.popup(b.x, b.y - 18, 'rubble remains — walk in to rebuild', PAL.uiDim, 12)
    } else {
      b.maxHp = b.def.levels[b.level - 1].hp
      b.hp = b.maxHp * 0.4
      b.alive = true
      b.applyTexture()
      this.scene.fx.popup(b.x, b.y - 40, `${b.def.short} WRECKED`, PAL.danger, 16)
    }
    // A fortified Hall can lose an upgrade tier and keep fighting. Only the
    // final collapse ends the defense and offers a wave restart.
    if (b.key === 'townHall' && b.level === 0) this.scene.onCoreLost()
    this.recomputeBonuses()
  }

  // ---- main loop -------------------------------------------------------
  update(dt: number) {
    const player = this.scene.player
    this.grid.clear()

    let nearest: Building | null = null
    let nearestD = Infinity

    for (const b of this.buildings) {
      const rampart = b.key === 'wall' || b.key === 'gate'
      const zoneOpen = this.scene.zones.isUnlocked(b.zone)
      const hallNeed = this.hallGate(b)
      const hallShort = this.townHallLevel < hallNeed
      const available = zoneOpen && !hallShort
      // A hall-gated pad used to stay invisible until the day it became
      // eligible, so new structures simply appeared with nothing to say what
      // had unlocked them. It stands there greyed out instead, and walking
      // into it names the hall level it is waiting for.
      const gated = zoneOpen && hallShort && !rampart
      const shouldShow = available || b.level > 0 || gated
      // Anything already standing keeps working even if the hall is wrecked
      // back below the level that unlocked it.
      const usable = available || b.level > 0

      // cull far-away blueprints so the map is not a sea of ghost outlines.
      // Ramparts are the worst offender (dozens of segments), so they only
      // appear once you are close enough to actually raise one. Locked
      // previews are held closer still: they are a promise, not a to-do list.
      const d = dist(player.x, player.y, b.x, b.y)
      const ghostRange = rampart ? 300 : gated ? 380 : 620
      const vis = shouldShow && (b.level > 0 || d < ghostRange)
      if (vis !== b.visible) {
        b.visible = vis
        b.sprite.setVisible(vis)
        b.ghost.setVisible(vis && b.level === 0)
      }
      if (vis && b.level === 0) {
        const fade = Math.max(0.3, Math.min(1, 1 - d / ghostRange))
        // Locked sites read as stone-cold rather than inviting: grey, dimmer,
        // and they do not breathe.
        b.sprite.setAlpha(fade * (gated ? 0.7 : 1))
        if (gated) {
          b.sprite.setTint(0x8a94a2)
          b.ghost.setTint(0x6d7a8a).setAlpha(fade * 0.16)
        } else {
          b.sprite.clearTint()
          b.ghost.setTint(0x8fd0ff)
          // the preview breathes gently so a build site reads as an invitation
          b.ghost.setAlpha(fade * (0.24 + Math.sin(this.scene.now * 0.0022 + b.x) * 0.06))
        }
      }
      if (!shouldShow) continue

      if (b.level > 0) {
        this.grid.insert(b)
        this.scene.allyGrid.insert(b)
      }

      if (b.state === 'raising') {
        b.raiseT += dt
        const t = Math.min(1, b.raiseT / b.raiseDur)
        b.sprite.setScale(1, 0.35 + t * 0.65)
        if (b.raiseT % 0.18 < dt) this.scene.fx.dust(b.x + rr(-24, 24), b.y, 2)
        if (t >= 1) this.finishRaise(b)
        continue
      }

      if (b.flashT > 0) {
        b.flashT -= dt
        b.sprite.setTintFill(0xffffff)
        if (b.flashT <= 0) b.sprite.clearTint()
      }
      if (b.damageT > 0) b.damageT -= dt

      if (b.level > 0) {
        if (b.def.tower) this.tickTower(b, dt)
        // slow self-repair between waves once engineers are around
        if (this.bonus.repair > 0 && !this.scene.waves.isNight && b.hp < b.maxHp) {
          b.repair(this.bonus.repair * 4 * dt)
        }
      }

      // Player standing in this pad? A short dwell is required before anything
      // is taken, so sprinting across a site never empties your pack by accident.
      const inPad = player.alive && d < Math.max(b.halfW, b.halfH) + 38
      if (inPad && d < nearestD) { nearestD = d; nearest = b }

      if (inPad && usable) {
        b.dwellT += dt
        // holding shift is the desktop shortcut for "pour it in"
        if (this.shiftKey?.isDown && b.level > 0 && !b.isMax) b.committed = true
        if (b.dwellT >= DWELL) {
          // A site you just pulled down does not start rebuilding itself where
          // you stand — walk out of the pad first.
          const cleared = this.justRazed === b.padId
          if (!b.isMax && !cleared && (b.level === 0 || b.committed)) this.tickDeposit(b, dt)
          if (b.level > 0) {
            if (this.rosterFor(b).length) this.tickRecruit(b, dt)
            else if (WORKER_FOR[b.key]) this.tickHireWorker(b, dt)
            else if (b.key === 'depot') this.tickDepotDump(b, dt)
          }
        }
      } else {
        b.dwellT = 0
        b.committed = false
        if (this.justRazed === b.padId) this.justRazed = null
        if (b.recruitCd < 0) b.recruitCd = 0
      }
    }

    this.tickAutoHire(dt)

    // infirmary aura
    if (this.bonus.heal > 0) {
      this.healTick -= dt
      if (this.healTick <= 0) {
        this.healTick = 1
        const tent = this.buildings.find(x => x.key === 'healingTent' && x.level > 0)
        if (tent) {
          this.scene.combat.healAllies(tent.x, tent.y, this.bonus.healRadius, this.bonus.heal)
          if (player.alive && dist(player.x, player.y, tent.x, tent.y) < this.bonus.healRadius) {
            player.heal(this.bonus.heal)
          }
        }
      }
    }

    this.tickRaze(nearest, dt)
    this.updatePanel(nearest)
  }

  /**
   * Once the Warehouse stands, camps hire into brand-new slots on their own.
   * Before it, they only replace crew they have lost. This is the moment the
   * settlement stops needing you for chores and starts running itself.
   */
  get autoHireUnlocked() { return this.countBuilt('warehouse') > 0 }

  private tickAutoHire(dt: number) {
    this.autoHireTick -= dt
    if (this.autoHireTick > 0) return
    this.autoHireTick = 2.5
    const grow = this.autoHireUnlocked

    for (const b of this.buildings) {
      if (b.level === 0) continue
      const wkey = WORKER_FOR[b.key]
      if (!wkey) continue
      const slots = b.stats.workers ?? 0
      if (b.workers.length >= slots) continue
      // Backfilling a crew the horde killed is always automatic. Losing a
      // lumberjack should cost you wood, not force you to walk back and
      // re-hire before the counter starts moving again.
      if (!grow && b.workers.length >= b.peakWorkers) continue
      const def = WORKERS[wkey]
      if (this.scene.popUsed + def.pop > this.bonus.pop) continue
      if (!this.scene.res.canAfford(def.cost)) continue
      this.scene.res.spend(def.cost)
      const w = this.scene.workers.hire(wkey, b)
      if (w) { b.workers.push(w.id); b.peakWorkers = Math.max(b.peakWorkers, b.workers.length) }
      return // one per tick, so the hires read as a trickle rather than a pop
    }
  }

  private tickDepotDump(b: Building, dt: number) {
    b.recruitCd -= dt
    if (b.recruitCd > 0) return
    const res = this.scene.res
    if (res.carriedTotal <= 0) return
    b.recruitCd = 0.1
    let moved = 0
    for (const k of RESOURCE_ORDER) {
      const amt = Math.min(res.carried[k], Math.max(1, Math.ceil(res.carried[k] / 6)), res.storeFree)
      if (amt <= 0) continue
      res.carried[k] -= amt
      res.stored[k] += amt
      moved += amt
      this.scene.fx.flyResource(
        this.scene.player.x, this.scene.player.y - 18, b.x, b.y - 26, TEX[k], 0,
        undefined, 0.85,
      )
    }
    if (moved > 0) {
      this.scene.res.bumpChanged()
      this.scene.audio.play('deposit', rr(0.95, 1.3), 0.45)
    } else if (res.storeFree <= 0) {
      this.scene.fx.popup(b.x, b.y - 46, 'STORE FULL', PAL.danger, 15)
      b.recruitCd = 1.4
    }
  }

  // ---- demolish --------------------------------------------------------
  /**
   * The hall is the run itself and the depot is the only drop-off, so neither
   * can come down. Every other pad is a slot the player is allowed to take
   * back, because placement is otherwise permanent for the rest of the save.
   */
  canDemolish(b: Building) {
    return b.level > 0 && b.state === 'done' && b.key !== 'townHall' && b.key !== 'depot'
  }

  /** What tearing this down puts back into the bank. */
  private salvage(b: Building): ResourceBag {
    const out: ResourceBag = {}
    const add = (bag: ResourceBag) => {
      for (const k of RESOURCE_ORDER) {
        const v = bag[k] ?? 0
        if (v > 0) out[k] = (out[k] ?? 0) + Math.floor(v * DEMOLISH_REFUND)
      }
    }
    for (let l = 0; l < b.level; l++) add(b.def.levels[l].cost)
    // Anything already banked toward the next level comes back at the same
    // rate, so half-funding an upgrade is never a reason to keep a bad pad.
    add(b.progress)
    return out
  }

  private salvageLabel(b: Building) {
    const bag = this.salvage(b)
    const parts = RESOURCE_ORDER.filter(k => (bag[k] ?? 0) > 0).map(k => `${short(bag[k]!)} ${k}`)
    // Two entries is what fits inside the bar at phone sizes; the popup on the
    // way down names the rest.
    if (!parts.length) return 'nothing'
    return parts.slice(0, 2).join(' · ') + (parts.length > 2 ? ' …' : '')
  }

  /** The DEMOLISH bar was pressed or released. Pressing alone does nothing. */
  private setRazing(b: Building, holding: boolean) {
    if (!holding) {
      this.razePad = null
      this.razeT = 0
      return
    }
    if (!this.canDemolish(b)) return
    this.razePad = b.padId
    this.razeT = 0
  }

  /** Fill the hold while the bar stays pressed and the hero stays in the pad. */
  private tickRaze(nearest: Building | null, dt: number) {
    if (!this.razePad) return
    const b = this.byPad.get(this.razePad)
    if (!b || b !== nearest || !this.canDemolish(b)) {
      this.razePad = null
      this.razeT = 0
      return
    }
    const was = this.razeT
    this.razeT += dt
    // A rising tick while the bar fills, so a hold nobody meant is audible
    // well before it costs anything.
    if (Math.floor(this.razeT / 0.28) !== Math.floor(was / 0.28)) {
      this.scene.audio.play('ui', 0.7 + (this.razeT / DEMOLISH_HOLD) * 0.6, 0.4)
    }
    if (this.razeT >= DEMOLISH_HOLD) {
      this.razePad = null
      this.razeT = 0
      this.demolish(b)
    }
  }

  /** Pull a building down: half of everything it cost, and the pad back. */
  demolish(b: Building) {
    if (!this.canDemolish(b)) return
    const bag = this.salvage(b)
    const label = this.salvageLabel(b)

    for (const id of b.workers) this.scene.workers.dismiss(id)
    b.workers.length = 0
    // Unlike a razing, this was on purpose — the crew is not coming back on
    // its own the moment the pad is rebuilt.
    b.peakWorkers = 0
    b.level = 0
    b.hp = 0
    b.maxHp = 0
    b.alive = false
    b.state = 'empty'
    b.progress = {}
    b.committed = false
    b.dwellT = 0
    b.recruitCd = 0
    this.justRazed = b.padId
    this.trains.delete(b.padId)
    b.applyTexture()
    b.sprite.setScale(1, 1)

    for (const k of RESOURCE_ORDER) {
      const v = bag[k] ?? 0
      if (v <= 0) continue
      // Salvage is returned, not earned: it must not inflate the lifetime
      // gathered totals the quests read.
      this.scene.res.addStored(k, v, false)
      this.scene.fx.flyResource(b.x, b.y - b.def.h * 0.4, this.depot.x, this.depot.y - 20, TEX[k], 0, undefined, 0.9)
    }

    this.scene.fx.dust(b.x, b.y, 16)
    this.scene.fx.smoke(b.x, b.y - 20, 8)
    this.scene.fx.shake(0.01, 0.25)
    this.scene.audio.play('boom', 0.9, 0.65)
    this.scene.fx.popup(b.x, b.y - 44, `${b.def.short} DEMOLISHED`, PAL.gold, 18)
    this.scene.fx.popup(b.x, b.y - 22, `salvaged ${label}`, PAL.uiDim, 12)
    this.recomputeBonuses()
  }

  // ---- world panel -----------------------------------------------------
  private updatePanel(nearest: Building | null) {
    if (nearest !== this.activePanelFor) {
      this.activePanelFor = nearest
      if (!nearest) this.panel.hide()
    }
    if (!nearest) return

    const b = nearest
    const res = this.scene.res
    let title: string
    let sub: string
    const rows: PanelRow[] = []

    if (b.isMax) {
      title = `${b.def.name}  ·  ${b.level}`
      sub = 'Fully upgraded'
    } else {
      const cost = b.nextCost!
      title = b.level === 0 ? b.def.name : `${b.def.name}  ·  ${b.level} → ${b.level + 1}`
      sub = b.level === 0 ? b.def.desc : this.upgradeSummary(b)
      for (const k of RESOURCE_ORDER) {
        const need = cost[k] ?? 0
        if (need <= 0) continue
        rows.push({ tex: TEX[k], have: Math.min(need, b.progress[k] ?? 0), need })
      }
    }

    // A pad the hall has not earned yet says so, and says nothing else: no
    // button, no chips, no way to pour resources into something inert.
    const hallNeed = this.hallGate(b)
    if (b.level === 0 && this.townHallLevel < hallNeed) {
      this.panel.show(b, {
        title, sub, rows,
        hint: `Locked — raise the Command Hall to level ${hallNeed}`,
        hintBad: true,
      })
      return
    }

    let hint = ''
    if (!b.isMax) {
      const rem = b.remaining()
      const missing: string[] = []
      for (const k of RESOURCE_ORDER) {
        const need = rem[k] ?? 0
        if (need > 0 && res.available(k) <= 0) missing.push(k)
      }
      if (missing.length) {
        hint = `need ${missing.join(', ')}`
      } else if (this.justRazed === b.padId) {
        hint = 'cleared — step off the pad before rebuilding'
      } else if (res.canAfford(rem)) {
        hint = 'stand here to build — paid from your stores'
      } else {
        // Say why the stores are sitting there untouched, or it reads as a bug.
        hint = 'not enough banked yet — only your pack goes in'
      }
    }

    if (b.level > 0 && !b.isMax) {
      // An upgrade never spends on its own. Standing on the Command Hall used
      // to quietly drain every coin you walked past it with, so raising a level
      // is always a deliberate press — which means saying so when you can
      // already afford it and nothing appears to be happening.
      const tap = wantsTouchTargets(this.scene.scale.width / DPR)
        ? 'tap Upgrade' : 'press Upgrade (or hold Shift)'
      hint = b.committed
        ? 'pouring it in…'
        : res.canAfford(b.remaining())
          ? `you can afford this — ${tap} to spend it`
          : `${tap}; your pack goes in first`
    }

    const unit = this.trainsAt(b)
    let chips: PanelChip[] | undefined
    if (b.level > 0 && unit) {
      const d = SOLDIERS[unit]
      const costStr = RESOURCE_ORDER.filter(k => d.cost[k]).map(k => `${d.cost[k]} ${k}`).join(' · ')
      hint = `stand here → ${d.name} (${costStr})`
      const roster = this.rosterFor(b)
      // One option is not a choice, so the stable never grows a chip row.
      if (roster.length > 1) {
        chips = roster.map(k => {
          const sd = SOLDIERS[k]
          const held = this.scene.army.countOf(k)
          const shut = sd.tier > b.level
          return {
            key: k,
            label: shut ? `${cap(sd.short)} · lv ${sd.tier}` : held > 0 ? `${cap(sd.short)} ${held}` : cap(sd.short),
            selected: k === unit,
            locked: shut,
            affordable: res.canAfford(sd.cost) && this.scene.popUsed + sd.pop <= this.bonus.pop,
          }
        })
      }
    } else if (b.level > 0 && WORKER_FOR[b.key]) {
      const w = WORKERS[WORKER_FOR[b.key]!]
      const costStr = RESOURCE_ORDER.filter(k => w.cost[k]).map(k => `${w.cost[k]} ${k}`).join(' · ')
      hint = `workers ${b.workers.length}/${b.stats.workers ?? 0} — stand here to hire (${costStr})`
    } else if (b.level > 0 && b.key === 'depot') {
      hint = `stand here to bank your pack — ${short(res.storedTotal)} in store`
    }

    this.panel.show(b, {
      title, sub, rows, hint, chips,
      upgrade: b.level > 0 && !b.isMax
        ? { committed: b.committed, affordable: res.canAfford(b.remaining()) }
        : undefined,
      demolish: this.canDemolish(b)
        ? {
          salvage: this.salvageLabel(b),
          hold: this.razePad === b.padId ? this.razeT / DEMOLISH_HOLD : 0,
        }
        : undefined,
    })
  }

  private upgradeSummary(b: Building): string {
    const cur = b.def.levels[b.level - 1]?.stats ?? {}
    const nxt = b.def.levels[b.level]?.stats ?? {}
    const parts: string[] = []
    const label: Record<string, string> = {
      dmg: 'Damage', rate: 'Rate', range: 'Range', splash: 'Splash', pop: 'Pop',
      prod: 'Output', carry: 'Carry', workers: 'Workers', heal: 'Heal',
      heroDmg: 'Hero dmg', troopDmg: 'Troop dmg', towerDmg: 'Tower dmg', unlockTier: 'Tier',
    }
    for (const k of Object.keys(nxt)) {
      if (!label[k]) continue
      const a = cur[k] ?? 0, c = nxt[k] ?? 0
      if (a === c) continue
      const pct = k === 'heroDmg' || k === 'troopDmg' || k === 'towerDmg' || k === 'prod'
      // a rate of 1 → 1.2 must not read as 1 → 1
      const fmt = (v: number) => pct ? `+${Math.round(v * 100)}%` : v < 10 && v % 1 ? v.toFixed(1) : short(v)
      parts.push(`${label[k]} ${fmt(a)} → ${fmt(c)}`)
    }
    const hpNext = b.def.levels[b.level].hp
    if (hpNext !== b.maxHp) parts.push(`HP ${short(b.maxHp)} → ${short(hpNext)}`)
    return parts.slice(0, 3).join('  ·  ') || b.def.desc
  }

  // ---- enemy interaction ----------------------------------------------
  nearestStructure(x: number, y: number, radius: number, preferDefense = false): Building | null {
    let best: Building | null = null
    let bestScore = Infinity
    const list = this.grid.query(x, y, radius, [])
    for (const b of list) {
      if (b.level === 0 || !b.alive) continue
      let score = dist(x, y, b.x, b.y)
      if (preferDefense && (b.key === 'wall' || b.key === 'gate')) score *= 0.55
      if (b.key === 'townHall') score *= 0.8
      if (score < bestScore) { bestScore = score; best = b }
    }
    return best
  }

  repairNearest(x: number, y: number, radius: number): Building | null {
    let best: Building | null = null
    let bestD = radius
    for (const b of this.buildings) {
      if (b.level === 0 || b.hp >= b.maxHp) continue
      const d = dist(x, y, b.x, b.y)
      if (d < bestD) { bestD = d; best = b }
    }
    return best
  }

  // ---- persistence -----------------------------------------------------
  // `trains` is undefined for a pad that has never been given an order, and
  // JSON.stringify drops undefined values, so old saves round-trip unchanged.
  toJSON() {
    return this.buildings.map(b => ({ ...b.toJSON(), trains: this.trains.get(b.padId) }))
  }

  load(data: ReturnType<BuildingManager['toJSON']>) {
    for (const d of data) {
      const b = this.byPad.get(d.padId)
      if (!b) continue
      if (d.trains && SOLDIERS[d.trains]) this.trains.set(d.padId, d.trains)
      // Starting structures are raised during build(). A saved loss can have
      // reduced one to rubble, so loading must also be able to move downward.
      if (d.level === 0) {
        b.level = 0
        b.maxHp = 0
        b.hp = 0
        b.alive = false
        b.state = 'empty'
        b.applyTexture()
      } else {
        if (b.level > d.level) {
          b.level = d.level
          b.maxHp = b.def.levels[d.level - 1].hp
        }
        while (b.level < d.level) b.completeLevel()
        b.hp = Math.max(1, Math.min(b.maxHp, d.hp))
        b.alive = true
        b.state = 'done'
        b.applyTexture()
      }
      b.progress = d.progress ?? {}
      b.peakWorkers = Math.max(0, d.peakWorkers ?? 0)
      if (b.key === 'farm' && b.level > 0 && !this.fielded.has(b.padId)) {
        this.fielded.add(b.padId)
        this.scene.nodes.addField(b.x, b.y + 40, b.zone, 5)
      }
    }
    this.recomputeBonuses()
  }

  /** Debug helper. */
  unlockAll() {
    for (const b of this.buildings) {
      if (b.key === 'wall' || b.key === 'gate') continue
      if (b.level === 0) { b.completeLevel(); this.onBuilt(b, true) }
    }
    this.recomputeBonuses()
  }

  destroyPanel() { this.panel.destroy() }

  /** Rough drawing of damaged-structure health bars. */
  drawHealthBars(g: Phaser.GameObjects.Graphics, view: Phaser.Geom.Rectangle) {
    for (const b of this.buildings) {
      if (b.level === 0 || b.damageT <= 0 || b.hp >= b.maxHp) continue
      if (!Phaser.Geom.Rectangle.Contains(view, b.x, b.y)) continue
      const w = Math.max(34, b.def.w * 0.8)
      const x = b.x - w / 2
      const y = b.y - b.def.h - 16
      const p = clamp(b.hp / b.maxHp, 0, 1)
      g.fillStyle(0x0a1018, 0.75); g.fillRect(x - 1, y - 1, w + 2, 6)
      g.fillStyle(p > 0.5 ? PAL.good : p > 0.25 ? PAL.gold : PAL.danger, 1)
      g.fillRect(x, y, w * p, 4)
    }
  }
}
