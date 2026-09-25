import { Worker } from '../entities/Worker'
import { WORKERS, WORKER_FOR, type WorkerKey } from '../config/units'
import { PAL } from '../config/palette'
import type { ResourceType } from '../core/types'
import { WORLD } from '../config/world'
import { walkRadius } from '../world/NavGrid'
import { pathLength } from '../world/PathFind'
import { clamp, rr } from '../core/math'
import type { Building } from '../entities/Building'
import type { GameScene } from '../scenes/GameScene'
import type { ResourceNode } from './NodeManager'

/**
 * Workers only bolt from something practically on top of them. A wide radius
 * meant every night parked the whole crew in 'flee' for the entire wave, and a
 * production counter that stops climbing reads as "my workers are broken".
 */
const FLEE_RADIUS = 150
const FLEE_TIME = 1
/** A camp counts as besieged until nothing hostile is this close to it. */
const SHELTER_CLEAR_RADIUS = 300
/**
 * What a crew still produces from inside the camp. Sheltering used to stop the
 * economy dead for the whole night, and a counter that freezes reads as a bug
 * rather than as tension. Indoors is slower; it is never nothing.
 */
const SHELTER_RATE = 0.45
const SEARCH_RADIUS = 760

/** Average haul per gather tick, mirroring NODE_DEFS. */
const NODE_YIELD: Partial<Record<ResourceType, number>> = {
  wood: 7, stone: 6, metal: 5, crystal: 3, food: 6,
}

const TEX: Record<string, string> = {
  coins: 'res_coins', wood: 'res_wood', food: 'res_food',
  stone: 'res_stone', metal: 'res_metal', crystal: 'res_crystal',
}

/**
 * The tycoon half of the loop. Workers are deliberately visible and slow
 * enough to watch: seeing a lumberjack walk a log to the depot is what sells
 * "my camp runs itself now".
 */
export class WorkerManager {
  workers: Worker[] = []
  private free: Worker[] = []
  totalHired = 0
  /** walking distance from a camp to a node, per `homeId:nodeId`; Infinity past SEARCH_RADIUS. Emptied when the NavGrid changes. */
  private reach = new Map<string, number>()
  private reachVersion = -1

  constructor(private scene: GameScene) {}

  get count() { return this.workers.length }
  get popUsed() {
    let p = 0
    for (const w of this.workers) p += w.def.pop
    return p
  }

  countOf(key: WorkerKey) {
    let c = 0
    for (const w of this.workers) if (w.key === key) c++
    return c
  }

  hire(key: WorkerKey, home: Building, at?: { x: number; y: number }, silent = false): Worker | null {
    const def = WORKERS[key]
    let w = this.free.pop()
    if (!w) w = new Worker(this.scene)
    const resource = home.def.gathers ?? 'wood'
    w.spawn(def, at?.x ?? home.x + rr(-20, 20), at?.y ?? home.y + 24,
      home.padId, home.x, home.y, resource)
    this.workers.push(w)
    this.totalHired++
    if (silent) {
      w.sprite.setScale(1)
    } else {
      this.scene.fx.dust(w.x, w.y, 4)
      this.scene.fx.popup(w.x, w.y - 26, def.name.toUpperCase(), PAL.workerBody, 13)
      this.scene.audio.play('recruit', 1.25)
      this.scene.bus.emit('worker:hired', { key })
      this.scene.tweens.add({ targets: w.sprite, scale: 1, duration: 240, ease: 'Back.easeOut' })
    }
    return w
  }

  dismiss(id: number) {
    const w = this.workers.find(x => x.id === id)
    if (w) this.remove(w)
  }

  onWorkerDied(w: Worker) {
    this.scene.fx.deathBurst(w.x, w.y - 8, w.def.colour, 0.9)
    this.scene.fx.popup(w.x, w.y - 28, 'WORKER LOST', PAL.danger, 13)
    this.releaseHomeSlot(w)
    this.remove(w)
  }

  private releaseHomeSlot(w: Worker) {
    const home = this.scene.buildings.byPad.get(w.homeId)
    if (home) {
      const i = home.workers.indexOf(w.id)
      if (i >= 0) home.workers.splice(i, 1)
    }
  }

  private remove(w: Worker) {
    if (w.node && w.node.claimedBy === w.id) w.node.claimedBy = 0
    const i = this.workers.indexOf(w)
    if (i >= 0) this.workers.splice(i, 1)
    w.release()
    this.free.push(w)
  }

  /** Duck inside: drop the load, free the tree, become untargetable. */
  private enterShelter(w: Worker, dropX: number, dropY: number) {
    const scene = this.scene
    w.sheltered = true
    w.state = 'shelter'
    w.fleeT = 0
    w.gatherT = 0
    w.vx = w.vy = 0
    if (w.carrying > 0) {
      scene.res.addStored(w.carryType, w.carrying)
      scene.fx.damage(dropX, dropY - 40, w.carrying, false, '#9ff07a')
      scene.audio.play('deposit', rr(1, 1.25), 0.3)
      w.carrying = 0
    }
    if (w.node && w.node.claimedBy === w.id) w.node.claimedBy = 0
    w.node = null
    w.x = dropX; w.y = dropY
    scene.fx.dust(w.x, w.y, 3)
    scene.fx.popup(dropX, dropY - 52, 'TAKING COVER', PAL.uiDim, 12)
    w.sprite.setVisible(false)
    w.load.setVisible(false)
  }

  /**
   * Sheltered crews work the stockpile from indoors — slower, safe, and above
   * all still counting up. Returns true while the worker stays inside.
   */
  private tickShelter(w: Worker, dt: number, home: Building | undefined, dropX: number, dropY: number): boolean {
    const scene = this.scene
    const homeUp = !!home && home.level > 0
    const besieged = homeUp && !!scene.enemies.grid.nearest(home!.x, home!.y, SHELTER_CLEAR_RADIUS, e => e.alive)
    if (!homeUp || !besieged) {
      w.sheltered = false
      w.state = 'seek'
      w.gatherT = 0
      w.x = dropX + rr(-18, 18); w.y = dropY
      w.sprite.setVisible(true).setPosition(w.x, w.y).setDepth(w.y)
      scene.fx.dust(w.x, w.y, 3)
      scene.fx.popup(w.x, w.y - 44, 'BACK TO WORK', PAL.good, 12)
      return false
    }
    // Builders have nothing to stockpile; they just wait it out.
    if (w.def.yield > 0) {
      const rate = (home!.stats.rate ?? 1) * (1 + scene.buildings.bonus.prod) * SHELTER_RATE
      w.gatherT += dt
      if (w.gatherT >= w.def.gatherTime / rate) {
        w.gatherT = 0
        const yieldPer = NODE_YIELD[w.carryType] ?? 6
        const got = Math.max(1, Math.round(yieldPer * (w.def.yield / 6) * rate
          * scene.buildings.haulMultiplier(home, w.carryType, home!.x, home!.y)))
        scene.res.addStored(w.carryType, got)
        scene.fx.damage(dropX, dropY - 40, got, false, '#9ff07a')
      }
    }
    w.x = dropX; w.y = dropY
    return true
  }

  update(dt: number) {
    const scene = this.scene
    const depot = scene.buildings.depot
    const fallbackX = depot.level > 0 ? depot.x : scene.buildings.townHall.x
    const fallbackY = depot.level > 0 ? depot.y + 14 : scene.buildings.townHall.y + 30

    for (let i = 0; i < this.workers.length; i++) {
      const w = this.workers[i]
      if (!w.alive) { this.releaseHomeSlot(w); this.remove(w); i--; continue }

      // Hauls go to the drop-off (`dropoffFor`, S06); the camp is where the
      // crew takes cover and works from indoors while the horde is loose.
      const home = scene.buildings.byPad.get(w.homeId)
      const homeUp = !!home && home.level > 0
      const campX = homeUp ? home!.x : fallbackX
      const campY = homeUp ? home!.y + 26 : fallbackY

      if (w.sheltered && this.tickShelter(w, dt, home, campX, campY)) continue

      scene.allyGrid.insert(w)

      // danger check — workers are not soldiers
      const threat = scene.enemies.grid.nearest(w.x, w.y, FLEE_RADIUS, e => e.alive)
      if (threat) w.fleeT = Math.max(w.fleeT, FLEE_TIME)

      let tx = w.x, ty = w.y
      let moving = true
      let steered = false

      if (w.fleeT > 0) {
        w.fleeT -= dt
        w.state = 'flee'
        // Keep the claimed tree through the scare. Releasing it meant every
        // skirmish threw away the whole trip, so a busy night banked nothing.
        if (w.node && !w.node.alive) w.node = null
        // Run for the camp door, not the hall. Fleeing to the hall parked the
        // whole crew on the exact tile the horde walks toward, which refreshed
        // the panic timer forever and froze production for the entire night.
        const hall = scene.buildings.townHall
        const doorX = homeUp ? home!.x : hall.x + (w.id % 5 - 2) * 26
        const doorY = homeUp ? home!.y + 12 : hall.y + 58
        // the door may be a river away now that hauls go to the depot: path to it
        ;({ x: tx, y: ty } = this.steer(w, doorX, doorY, dt))
        steered = true
        if (threat) {
          const ax = w.x - threat.x, ay = w.y - threat.y
          const ad = Math.hypot(ax, ay) || 1
          tx = w.x + (ax / ad) * 160 * 0.35 + (tx - w.x) * 0.65
          ty = w.y + (ay / ad) * 160 * 0.35 + (ty - w.y) * 0.65
        }
        if (Math.hypot(doorX - w.x, doorY - w.y) < 42) {
          this.enterShelter(w, campX, campY)
          continue
        }
        // Once the danger passes, hand control back to the work loop. Without
        // this the worker stays in 'flee' forever and never gathers again.
        if (w.fleeT <= 0) w.state = w.carrying > 0 ? 'carry' : w.node ? 'travel' : 'seek'
      } else if (w.key === 'builder') {
        const target = scene.buildings.repairNearest(w.x, w.y, 900)
        if (target) {
          w.state = 'repair'
          tx = target.x; ty = target.y + 26
          if (Math.hypot(target.x - w.x, target.y + 26 - w.y) < 34) {
            moving = false
            w.swingT += dt
            target.repair(28 * dt)
            if (w.swingT > 0.45) {
              w.swingT = 0
              scene.fx.hitSpark(target.x + rr(-16, 16), target.y - 18, 0xffd24a, 0.4)
              scene.audio.playVaried('repair', 0.3)
            }
          }
        } else {
          w.state = 'seek'
          tx = w.homeX + Math.cos(w.id) * 40
          ty = w.homeY + 34
          if (Math.hypot(tx - w.x, ty - w.y) < 20) moving = false
        }
      } else {
        switch (w.state) {
          case 'seek': {
            const node = this.pickNode(w, w.id) ?? this.pickNode(w, null)
            if (node) {
              node.claimedBy = w.id
              w.node = node
              w.state = 'travel'
            } else {
              // idle shuffle near home so they never look frozen
              tx = w.homeX + Math.cos(scene.now * 0.0004 + w.id) * 46
              ty = w.homeY + 34 + Math.sin(scene.now * 0.0005 + w.id) * 18
            }
            break
          }
          case 'travel': {
            const node = w.node
            if (!node || !node.alive) { w.node = null; w.state = 'seek'; break }
            tx = node.gx; ty = node.gy
            if (Math.hypot(tx - w.x, ty - w.y) < 30) { w.state = 'gather'; w.gatherT = 0 }
            break
          }
          case 'gather': {
            const node = w.node
            if (!node || !node.alive) { w.node = null; w.state = w.carrying > 0 ? 'carry' : 'seek'; break }
            moving = false
            w.gatherT += dt
            w.swingT += dt
            if (w.swingT > 0.34) {
              w.swingT = 0
              scene.fx.hitSpark(node.x + rr(-8, 8), node.y - 14, node.resource === 'wood' ? 0x9fc25c : 0xd8dfe8, 0.5)
              node.shakeT = 0.14
              scene.audio.playVaried(node.resource === 'wood' ? 'wood' : 'stone', 0.18)
            }
            // camp level and settlement-wide output bonuses both speed the crew up
            const rate = (home && home.level > 0 ? (home.stats.rate ?? 1) : 1)
              * (1 + scene.buildings.bonus.prod)
            if (w.gatherT >= w.def.gatherTime / rate) {
              w.gatherT = 0
              const got = scene.nodes.strike(node, node.maxHp / 3)
              w.carrying += Math.max(1, Math.round(got * (w.def.yield / 6) * rate))
              if (!node.alive) { node.claimedBy = 0; w.node = null }
              if (w.carrying >= w.def.carry || !w.node) w.state = 'carry'
            }
            break
          }
          case 'carry': {
            const drop = scene.buildings.dropoffFor(w.x, w.y, w.carryType)
            tx = drop.x; ty = drop.y
            if (Math.hypot(tx - w.x, ty - w.y) < 44) w.state = 'deposit'
            break
          }
          // any unexpected state falls back into the work loop
          case 'flee':
          case 'shelter':
          case 'repair':
            w.state = w.carrying > 0 ? 'carry' : 'seek'
            break
          case 'deposit': {
            moving = false
            const drop = scene.buildings.dropoffFor(w.x, w.y, w.carryType)
            // a mill by the camp and a Lv.2 granary at the drop add to the haul (S13b)
            const haul = Math.round(w.carrying * scene.buildings.haulMultiplier(home, w.carryType, w.x, w.y))
            const added = scene.res.addStored(w.carryType, haul)
            if (added > 0) {
              scene.fx.flyResource(w.x, w.y - 18, drop.x, drop.y - 22, TEX[w.carryType], 0, undefined, 0.8)
              scene.fx.damage(drop.x, drop.y - 40, added, false, '#9ff07a')
              scene.audio.play('deposit', rr(1, 1.25), 0.35)
              this.delivered++
            } else {
              scene.fx.popup(drop.x, drop.y - 48, 'STORE FULL', PAL.danger, 14)
            }
            w.carrying = 0
            w.state = 'seek'
            break
          }
        }
      }

      // walk the long way round water and cliffs (S06)
      if (moving && !steered) ({ x: tx, y: ty } = this.steer(w, tx, ty, dt))
      const dx = tx - w.x, dy = ty - w.y
      const d = Math.hypot(dx, dy)
      const speed = w.def.speed * (w.fleeT > 0 ? 1.6 : 1)
      const wantsToMove = moving && d > 5
      if (wantsToMove) {
        const ux = dx / d, uy = dy / d
        let ax = ux, ay = uy
        // Paths go round terrain, not buildings: a worker who has been
        // shoving into something solid for a beat sidesteps along its face
        // until they slip past. Without it a lumberjack whose tree sits
        // directly behind his own camp walks into the wall forever, and the
        // wood counter quietly stops climbing.
        if (w.detourT > 0) {
          w.detourT -= dt
          const s = w.detourSign
          ax = ux * 0.3 - uy * s
          ay = uy * 0.3 + ux * s
          const m = Math.hypot(ax, ay) || 1
          ax /= m; ay /= m
        }
        w.vx += (ax * speed - w.vx) * Math.min(1, dt * 9)
        w.vy += (ay * speed - w.vy) * Math.min(1, dt * 9)
        if (Math.abs(dx) > 3) w.facing = dx > 0 ? 1 : -1
      } else {
        w.vx -= w.vx * Math.min(1, dt * 10)
        w.vy -= w.vy * Math.min(1, dt * 10)
        w.stuckT = 0
        w.detourT = 0
      }

      const prevX = w.x, prevY = w.y
      // terrain collision (S05); paths keep workers off the banks, the detour below frees any that snag
      const slow = scene.nav.allySpeedAt(w.x, w.y)
      const p = scene.nav.slide(w.x, w.y, w.vx * dt * slow, w.vy * dt * slow, walkRadius(w.radius))
      w.x = clamp(p.x, 20, WORLD.width - 20)
      w.y = clamp(p.y, 20, WORLD.height - 20)
      scene.buildings.resolveCollision(w)

      if (wantsToMove) {
        const moved = Math.hypot(w.x - prevX, w.y - prevY)
        if (moved < speed * dt * 0.35) {
          w.stuckT += dt
          if (w.stuckT > 0.25) {
            w.stuckT = 0
            // Alternate the side we try each time, so a worker wedged in a
            // corner eventually finds the open one instead of bouncing.
            w.detourSign = w.detourT > 0 ? -w.detourSign : w.detourSign
            w.detourT = 0.85
          }
        } else if (w.detourT <= 0) {
          w.stuckT = 0
        }
      }

      const spr = w.sprite
      spr.x = w.x
      spr.setDepth(w.y)
      spr.setFlipX(w.facing < 0)
      const isMoving = Math.hypot(w.vx, w.vy) > 18
      if (isMoving) {
        const t = scene.now * 0.014 + w.bobSeed
        spr.y = w.y - Math.abs(Math.sin(t * 6)) * 2.2
        spr.rotation = Math.sin(t * 3) * 0.05
      } else if (w.state === 'gather' || w.state === 'repair') {
        spr.y = w.y
        spr.rotation = Math.sin(scene.now * 0.02) * 0.4
      } else {
        spr.y = w.y
        spr.rotation *= 0.88
      }
      if (w.flashT > 0) {
        w.flashT -= dt
        spr.setTintFill(0xffffff)
        if (w.flashT <= 0) spr.clearTint()
      }

      if (w.carrying > 0) {
        w.load.setVisible(true).setPosition(w.x, spr.y - 30).setDepth(w.y + 1)
      } else {
        w.load.setVisible(false)
      }
    }
  }

  /** Deliveries to a drop-off since boot (harness). */
  delivered = 0

  /**
   * The node a worker should walk to: nearest by walking distance from its
   * camp, within SEARCH_RADIUS. Straight-line candidates come first, and a
   * candidate is only path-checked while it could still beat the best found
   * (a path is never shorter than the line). With a null claimer, claimed
   * nodes count too.
   */
  private pickNode(w: Worker, claimer: number | null): ResourceNode | null {
    const scene = this.scene
    let best: ResourceNode | null = null, bestLen = Infinity
    for (const n of scene.nodes.candidates(w.carryType, w.homeX, w.homeY, SEARCH_RADIUS, claimer, w.def.fishes === true)) {
      if (Math.hypot(n.x - w.homeX, n.y - w.homeY) >= bestLen) break
      const L = this.reachOf(w, n)
      if (L < bestLen) { bestLen = L; best = n }
    }
    return best
  }

  /** Walking distance from the worker's camp door to a node, cached per camp and node. */
  private reachOf(w: Worker, n: ResourceNode): number {
    const nav = this.scene.nav
    if (this.reachVersion !== nav.version) { this.reach.clear(); this.reachVersion = nav.version }
    const k = `${w.homeId}:${n.id}`
    let L = this.reach.get(k)
    if (L === undefined) {
      const p = nav.findPath(w.homeX, w.homeY + 24, n.gx, n.gy, SEARCH_RADIUS)
      L = p ? pathLength(p) : Infinity
      if (L > SEARCH_RADIUS) L = Infinity
      this.reach.set(k, L)
    }
    return L
  }

  /**
   * Where to steer this frame on the way to (tx, ty). Straight when the
   * worker can see it; otherwise a queued path, walked waypoint by
   * waypoint, and asked for again if the worker stops closing on it.
   */
  private steer(w: Worker, tx: number, ty: number, dt: number): { x: number; y: number } {
    const nav = this.scene.nav
    if (Math.hypot(tx - w.pathTx, ty - w.pathTy) > 48) {
      w.pathTx = tx; w.pathTy = ty
      w.follower.clear()
      w.pathTicket = null
      w.losT = 0
    }
    if (w.pathTicket?.done) { w.follower.set(w.pathTicket.path); w.pathTicket = null }
    if (w.follower.active) {
      const s = w.follower.step(w.x, w.y, dt)
      if (w.follower.stuck > 1.5) { w.follower.clear(); w.losT = 0 }
      else if (!s.done) return s
    }
    if (!w.pathTicket && Math.hypot(tx - w.x, ty - w.y) > 40) {
      w.losT -= dt
      if (w.losT <= 0) {
        w.losT = 0.6
        if (!nav.paths.segClear(w.x, w.y, tx, ty, walkRadius(w.radius))) w.pathTicket = nav.requestPath(w.x, w.y, tx, ty)
      }
    }
    return { x: tx, y: ty }
  }

  /**
   * What the standing crew earns per second, per resource. Used for the
   * away-from-keyboard catch-up and for sanity-checking the economy.
   */
  incomePerSecond(): Partial<Record<ResourceType, number>> {
    const out: Partial<Record<ResourceType, number>> = {}
    const prod = 1 + this.scene.buildings.bonus.prod
    for (const w of this.workers) {
      const home = this.scene.buildings.byPad.get(w.homeId)
      if (!home || home.level === 0) continue
      const nodeYield = NODE_YIELD[w.carryType] ?? 6
      const rate = (home.stats.rate ?? 1) * prod
      const mill = this.scene.buildings.localBonus('mill', home.x, home.y)
      const perCycle = nodeYield * (w.def.yield / 6) * rate
      const cycle = w.def.gatherTime / rate
      // 0.62 accounts for walking between the node and the stockpile
      const perSec = (perCycle / cycle) * 0.62 * (home.key === 'farm' || home.key === 'lumberCamp' ? mill : 1)
        * this.scene.buildings.yieldMod(home)
      out[w.carryType] = (out[w.carryType] ?? 0) + perSec
    }
    return out
  }

  toJSON() {
    return this.workers.map(w => ({
      key: w.key, homeId: w.homeId, x: w.x, y: w.y, hp: w.hp,
      carrying: w.carrying, carryType: w.carryType, sheltered: w.sheltered,
    }))
  }

  load(d: ReturnType<WorkerManager['toJSON']>) {
    for (const rec of d) {
      const home = this.scene.buildings.byPad.get(rec.homeId)
      if (!home || home.level === 0) continue
      if (WORKER_FOR[home.key] !== rec.key) continue
      const at = Number.isFinite(rec.x) && Number.isFinite(rec.y)
        ? { x: rec.x, y: rec.y } : undefined
      const w = this.hire(rec.key, home, at, true)
      if (!w) continue
      w.hp = Math.max(1, Math.min(w.maxHp, rec.hp ?? w.maxHp))
      w.carrying = Math.max(0, rec.carrying ?? 0)
      w.state = w.carrying > 0 ? 'carry' : 'seek'
      if (rec.sheltered) {
        w.sheltered = true
        w.state = 'shelter'
        w.sprite.setVisible(false)
        w.load.setVisible(false)
      } else if (w.carrying > 0) {
        w.load.setVisible(true).setPosition(w.x, w.y - 30).setDepth(w.y + 1)
      }
      home.workers.push(w.id)
      home.peakWorkers = Math.max(home.peakWorkers, home.workers.length)
    }
  }
}
