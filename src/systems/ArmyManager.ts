import Phaser from 'phaser'
import { Soldier } from '../entities/Soldier'
import { SOLDIERS, type SoldierKey } from '../config/units'
import { PAL } from '../config/palette'
import { WORLD } from '../config/world'
import { walkRadius } from '../world/NavGrid'
import { clamp, rr } from '../core/math'
import type { Enemy } from '../entities/Enemy'
import type { GameScene } from '../scenes/GameScene'
import { slowMult, tickSlow } from './walkers'
import { ARMY } from '../config/balance'
import { splitBudget } from './Approaches'
import type { Pt } from '../world/PathFind'
import {
  COMPANIES, ORDERS, ORDER_CALL, assignFronts, companyOf, nextOrder, noCompanies,
  type Anchor, type Company, type Order,
} from './companies'

export { companyOf, type Anchor, type Company, type Order } from './companies'

/** Front-to-back ordering so tanks screen the shooters. */
const LINE_ORDER: Record<SoldierKey, number> = {
  guard: 0, swordsman: 1, outrider: 1, spearman: 2, archer: 3, crossbow: 4,
}

const byLine = (a: Soldier, b: Soldier) => LINE_ORDER[a.key] - LINE_ORDER[b.key] || a.id - b.id

/** R5: one of tonight's fronts as the army sees it, from the warning to dawn. */
interface Front {
  id: string
  post: { x: number; y: number }
  /** facing up its road, toward the spawn */
  heading: number
  /** its part of the night (`splitBudget`); the raid is a small front */
  share: number
  /** seconds with no spawns left for it, none of its walkers out on the road and none near its post */
  quietT: number
  /** gone quiet: its soldiers go to the nearest front still fighting */
  released: boolean
}

/** R5: soldiers sent to a raided holding; they go back once it has been quiet `respondQuiet` s. */
interface Detachment {
  padId: string
  x: number
  y: number
  company: Company
  /** from where they set out toward the holding */
  heading: number
  quietT: number
}

export class ArmyManager {
  soldiers: Soldier[] = []
  private free: Soldier[] = []
  private dirty = true

  /** R5: each company's order; defend by default */
  orders: Record<Company, Order> = { infantry: 'defend', archers: 'defend', riders: 'defend' }
  /** R5: where the holding companies stand: planted at the hero when the order is given; null while none holds */
  banner: { x: number; y: number } | null = null
  /** the follow formation's anchor, moved onto the hero every frame */
  private readonly followAnchor: Anchor = { kind: 'follow', x: 0, y: 0, heading: 0, engage: ARMY.engage, leash: ARMY.leash }
  private replanT = 0
  private sinceReplan = 0
  /** tonight's fronts, from the warning to dawn; empty by day */
  private fronts: Front[] = []
  private frontsKey = ''
  /** the last night's lead post: the day posts face it */
  private facing: { x: number; y: number } | null = null
  /** detachments out, by the raided holding's pad */
  private details = new Map<string, Detachment>()

  /** Old call sites: true when every company holds. */
  get holding() { return COMPANIES.every(c => this.orders[c] === 'hold') }

  buffDamage = 1
  buffRate = 1
  totalRecruited = 0


  constructor(private scene: GameScene) {
    scene.bus.on('holding:raided', r => { this.answer(r) })
  }

  get count() { return this.soldiers.length }
  get popUsed() {
    let p = 0
    for (const s of this.soldiers) p += s.def.pop
    return p
  }

  /** The company a soldier kind belongs to (by muster). */
  companyOf(key: SoldierKey): Company { return companyOf(key) }

  /** Soldiers in a company. */
  companyCount(c: Company) {
    let n = 0
    for (const s of this.soldiers) if (s.alive && s.company === c) n++
    return n
  }

  /** Give a company an order. Hold plants the banner where the hero stands; the banner comes down once no company holds. */
  setOrder(c: Company, o: Order) {
    this.orders[c] = o
    const p = this.scene.player
    if (o === 'hold') this.banner = { x: Math.round(p.x), y: Math.round(p.y) }
    else if (!COMPANIES.some(k => this.orders[k] === 'hold')) this.banner = null
    this.dirty = true
  }

  /** `H`: every company to the order after the infantry's. Returns it. */
  cycleAll(): Order {
    const o = nextOrder(this.orders.infantry)
    for (const c of COMPANIES) this.setOrder(c, o)
    return o
  }

  /** What the hero calls out for an order given to the whole army. */
  orderCall(o: Order): string { return ORDER_CALL[o] }

  /** Whether a soldier goes with the hero (a waystone escort takes only these). */
  follows(s: Soldier): boolean { return this.orders[s.company] === 'follow' }

  /**
   * A raided holding (`holding:raided`): by day, or at night when no front
   * covers it, the nearest defending company within `respondRange` of path
   * sends half its soldiers, at least `respondMin`, not already detached.
   * One detachment per holding. True if one set out.
   */
  answer(r: { padId: string; x: number; y: number }): boolean {
    if (this.details.has(r.padId)) return false
    if (this.fronts.some(f => !f.released && Math.hypot(f.post.x - r.x, f.post.y - r.y) <= ARMY.postLeash)) return false
    const far = (s: Soldier) => Math.hypot(s.x - r.x, s.y - r.y)
    let best: { c: Company; free: Soldier[]; len: number } | null = null
    for (const c of COMPANIES) {
      if (this.orders[c] !== 'defend') continue
      const free = this.soldiers.filter(s => s.alive && s.company === c && !s.detail).sort((a, b) => far(a) - far(b))
      if (!free.length || far(free[0]) > ARMY.respondRange) continue
      // by path from where the company stands (its nearest soldier), bounded
      const path = this.scene.nav.findPath(free[0].x, free[0].y, r.x, r.y, ARMY.respondRange)
      if (!path) continue
      let len = 0
      for (let i = 1; i < path.length; i++) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
      if (len <= ARMY.respondRange && (!best || len < best.len)) best = { c, free, len }
    }
    if (!best) return false
    const n = Math.min(best.free.length, Math.max(ARMY.respondMin, Math.ceil(this.companyCount(best.c) / 2)))
    const lead = best.free[0]
    for (const s of best.free.slice(0, n)) { s.detail = r.padId; s.target = null }
    this.details.set(r.padId, {
      padId: r.padId, x: r.x, y: r.y, company: best.c, quietT: 0,
      heading: Math.atan2(r.y - lead.y, r.x - lead.x),
    })
    this.dirty = true
    return true
  }

  /** How many soldiers are out answering raids, by holding pad. */
  detachments(): { padId: string; company: Company; count: number }[] {
    return [...this.details.values()].map(d => ({
      padId: d.padId, company: d.company,
      count: this.soldiers.filter(s => s.alive && s.detail === d.padId).length,
    }))
  }

  countOf(key: SoldierKey) {
    let c = 0
    for (const s of this.soldiers) if (s.key === key) c++
    return c
  }

  recruit(key: SoldierKey, x: number, y: number, silent = false): Soldier {
    const def = SOLDIERS[key]
    let s = this.free.pop()
    if (!s) s = new Soldier(this.scene)
    const base = 1 + this.scene.buildings.bonus.troopDmg * 0.3
    // the Shrine of the Fallen (S14)
    const hpMult = this.scene.mods?.value('soldier.hp', base) ?? base
    s.spawn(def, x + (silent ? 0 : rr(-8, 8)), y + (silent ? 0 : rr(-4, 4)), this.soldiers.length, hpMult)
    s.company = companyOf(key)
    this.soldiers.push(s)
    this.dirty = true
    this.totalRecruited++

    if (silent) {
      s.spawnT = 0
      s.sprite.setScale(1)
    } else {
      this.scene.fx.dust(x, y, 5)
      this.scene.fx.popup(x, y - 28, def.name.toUpperCase(), PAL.allyBody, 14)
      this.scene.audio.play('recruit', rr(0.95, 1.1))
      this.scene.bus.emit('soldier:recruited', { key })
      // little march-out from the door
      this.scene.tweens.add({ targets: s.sprite, scale: 1, duration: 260, ease: 'Back.easeOut' })
    }
    return s
  }

  onSoldierDied(s: Soldier) {
    this.scene.fx.deathBurst(s.x, s.y - 10, s.def.colour, 1)
    this.scene.fx.popup(s.x, s.y - 30, 'DOWN', PAL.danger, 13)
    this.scene.audio.playVaried('enemyDie', 0.3)
    this.remove(s)
  }

  private remove(s: Soldier) {
    const i = this.soldiers.indexOf(s)
    if (i >= 0) this.soldiers.splice(i, 1)
    s.release()
    this.free.push(s)
    this.dirty = true
  }

  disbandAll() {
    for (const s of this.soldiers.slice()) this.remove(s)
    this.details.clear()
  }

  /** Formation anchor: behind the hero relative to where they are heading. */
  private slotPosition(index: number, ax: number, ay: number, heading: number) {
    const perRow = 5
    const row = Math.floor(index / perRow)
    const col = (index % perRow) - (perRow - 1) / 2
    const back = 46 + row * 30
    const side = col * 34
    const cos = Math.cos(heading), sin = Math.sin(heading)
    return {
      x: ax - cos * back - sin * side,
      y: ay - sin * back + cos * side,
    }
  }

  update(dt: number) {
    const player = this.scene.player
    const scene = this.scene

    const fa = this.followAnchor
    fa.x = player.x
    fa.y = player.y
    fa.heading = Math.atan2(player.vy, player.vx) || 0
    this.replanT -= dt
    this.sinceReplan += dt
    if (this.dirty || this.replanT <= 0) {
      this.replan(this.sinceReplan)
      this.sinceReplan = 0
      this.replanT = ARMY.replan
      this.dirty = false
    }
    // the Gallows Bell (S15)
    const armySpeed = scene.mods?.value('army.speed', 1) ?? 1

    for (let i = 0; i < this.soldiers.length; i++) {
      const s = this.soldiers[i]
      if (!s.alive) { this.remove(s); i--; continue }

      if (s.spawnT > 0) s.spawnT -= dt
      s.targetLockT -= dt
      const a = s.anchor ?? fa

      // find something to fight
      if (!s.target || !s.target.alive || s.targetLockT <= 0) {
        const t = scene.enemies.grid.nearest(s.x, s.y, a.engage, e => e.alive)
        if (t) {
          s.target = t
          s.targetLockT = 1.3
        } else if (!s.target?.alive) {
          s.target = null
        }
      }

      // leash: never chase so far that the hero (or the post) is left naked
      if (s.target && Math.hypot(s.target.x - a.x, s.target.y - a.y) > a.leash) s.target = null

      const def = s.def
      let mx = 0, my = 0
      tickSlow(s.slow, dt)
      const legs = armySpeed * slowMult(s.slow) // the Gallows Bell (S15), a wretch's slow (S16)
      let speed = def.speed * legs

      if (s.target) {
        s.state = 'engage'
        const dx = s.target.x - s.x, dy = s.target.y - s.y
        const d = Math.hypot(dx, dy) || 1
        const reach = def.range + s.target.radius + s.radius * 0.4
        if (d <= reach) {
          s.attackCd -= dt
          if (s.attackCd <= 0) {
            s.attackCd = 1 / Math.max(0.1, def.attackRate * this.buffRate)
            this.strike(s, s.target as Enemy)
          }
          mx = -dx / d * 0.18
          my = -dy / d * 0.18
        } else {
          mx = dx / d
          my = dy / d
        }
        if (Math.abs(dx) > 4) s.facing = dx > 0 ? 1 : -1
      } else {
        s.state = a.kind === 'follow' ? 'form' : 'hold'
        const p = this.slotPosition(s.slot, a.x, a.y, a.heading)
        const d = Math.hypot(p.x - s.x, p.y - s.y)
        if (d > 16) {
          const g = this.route(s, a.x, a.y, p.x, p.y, dt)
          const dx = g.x - s.x, dy = g.y - s.y
          const dg = Math.hypot(dx, dy) || 1
          mx = dx / dg
          my = dy / dg
          // catch-up sprint so the formation does not string out forever; a detour is always behind
          const far = s.follower.active ? Math.max(d, 240) : d
          speed = def.speed * legs * (far > 220 ? 1.7 : far > 110 ? 1.25 : 1)
          if (Math.abs(dx) > 4) s.facing = dx > 0 ? 1 : -1
        }
      }

      s.vx += (mx * speed - s.vx) * Math.min(1, dt * 10)
      s.vy += (my * speed - s.vy) * Math.min(1, dt * 10)

      // keep the line from collapsing into one pixel
      const near = scene.allyGrid.query(s.x, s.y, s.radius * 2.3, [])
      let sx = 0, sy = 0, n = 0
      for (let k = 0; k < near.length && n < 4; k++) {
        const o = near[k]
        if (o === s || o.kind === 'building') continue
        const ox = s.x - o.x, oy = s.y - o.y
        const od = Math.hypot(ox, oy)
        if (od > 0.01 && od < s.radius + o.radius) {
          sx += (ox / od) * (1 - od / (s.radius + o.radius))
          sy += (oy / od) * (1 - od / (s.radius + o.radius))
          n++
        }
      }
      // terrain collision (S05): fords slow, banks stop. Formation moves path round
      // them (route); a chase stays straight, so it can still end at a bank.
      const nav = scene.nav
      const slow = nav.allySpeedAt(s.x, s.y)
      const p = nav.slide(s.x, s.y, sx * 56 * dt + s.vx * dt * slow, sy * 56 * dt + s.vy * dt * slow, walkRadius(s.radius))
      s.x = clamp(p.x, 20, WORLD.width - 20)
      s.y = clamp(p.y, 20, WORLD.height - 20)
      scene.buildings.resolveCollision(s)
      scene.allyGrid.insert(s)

      const spr = s.sprite
      spr.x = s.x
      spr.setDepth(s.y)
      spr.setFlipX(s.facing < 0)
      const moving = Math.hypot(s.vx, s.vy) > 20
      if (moving) {
        const t = scene.now * 0.014 + s.bobSeed
        spr.y = s.y - Math.abs(Math.sin(t * 6)) * 2.6
        spr.rotation = Math.sin(t * 3) * 0.05
      } else {
        spr.y = s.y
        spr.rotation *= 0.88
      }
      if (s.flashT > 0) {
        s.flashT -= dt
        spr.setTintFill(0xffffff)
        if (s.flashT <= 0) spr.clearTint()
      }
    }

    this.drawBars()
  }

  /**
   * R5: every soldier's anchor from its company's order, a few times a second.
   * Each anchor's soldiers form up in line order (melee in front of shooters).
   */
  private replan(step: number) {
    this.syncFronts(step)
    this.syncDetachments(step)
    this.assignDefenders()
    const frontById = new Map(this.fronts.map(f => [f.id, f]))
    const groups = new Map<string, { a: Anchor; list: Soldier[] }>()
    const put = (key: string, s: Soldier, make: () => Anchor) => {
      let g = groups.get(key)
      if (!g) groups.set(key, g = { a: make(), list: [] })
      g.list.push(s)
    }
    for (const s of this.soldiers) {
      if (!s.alive) continue
      const d = s.detail ? this.details.get(s.detail) : undefined
      if (d) {
        put(`respond:${d.padId}`, s, () => ({ kind: 'respond', x: d.x, y: d.y, heading: d.heading, engage: ARMY.postEngage, leash: ARMY.postEngage }))
        continue
      }
      s.detail = null
      const o = this.orders[s.company]
      if (o === 'follow') put('follow', s, () => this.followAnchor)
      else if (o === 'hold') put('hold', s, () => this.holdAnchor())
      else {
        const f = s.front ? frontById.get(s.front) : undefined
        if (f) put(`front:${f.id}`, s, () => ({ kind: 'front', x: f.post.x, y: f.post.y, heading: f.heading, engage: ARMY.postEngage, leash: ARMY.postLeash }))
        else put(`post:${s.company}`, s, () => this.dayPost(s.company))
      }
    }
    for (const { a, list } of groups.values()) {
      list.sort(byLine)
      list.forEach((s, i) => { s.anchor = a; s.slot = i })
    }
  }

  /** Detachments walk back once their holding has been quiet a while, their company is ordered elsewhere, or they are all down. */
  private syncDetachments(step: number) {
    for (const [id, d] of this.details) {
      let members = 0
      for (const s of this.soldiers) if (s.alive && s.detail === id) members++
      const busy = !!this.scene.enemies.grid.nearest(d.x, d.y, ARMY.postEngage, e => e.alive)
      d.quietT = busy ? 0 : d.quietT + step
      if (members && d.quietT < ARMY.respondQuiet && this.orders[d.company] === 'defend') continue
      for (const s of this.soldiers) if (s.detail === id) s.detail = null
      this.details.delete(id)
    }
  }

  /** The banner, the formation facing out from the hall. */
  private holdAnchor(): Anchor {
    const hall = this.scene.buildings.townHall
    const b = this.banner ?? { x: hall.x, y: hall.y + 60 }
    return { kind: 'hold', x: b.x, y: b.y, heading: this.outward(b.x, b.y), engage: ARMY.holdEngage, leash: ARMY.holdLeash }
  }

  /**
   * A company's post in the hold by day, on the line from the hall to the
   * last night's lead post: infantry out front, archers behind them, riders
   * on the flank.
   */
  private dayPost(c: Company): Anchor {
    const hall = this.scene.buildings.townHall
    const h = this.facing ? this.outward(this.facing.x, this.facing.y) : Math.PI / 2
    const dx = Math.cos(h), dy = Math.sin(h)
    const r = ARMY.dayPost[c], side = c === 'riders' ? ARMY.riderFlank : 0
    let x = hall.x + dx * r - dy * side, y = hall.y + dy * r + dx * side
    const nav = this.scene.nav
    if (!nav.passableAt(x, y)) {
      const i = nav.nearestPassable(x, y)
      if (i >= 0) [x, y] = nav.r.xy(i)
    }
    return { kind: 'post', x, y, heading: h, engage: ARMY.postEngage, leash: ARMY.postLeash }
  }

  /**
   * Tonight's fronts from the warning to dawn (`waves.tonight`, each with its
   * post and share), and at night which have gone quiet: no spawns left for
   * it, none of its walkers out on the road, and none within `postLeash` of
   * its post for `frontQuiet` s.
   */
  private syncFronts(step: number) {
    const scene = this.scene
    const waves = scene.waves
    if (waves.phase === 'day' || !waves.tonight.length) {
      this.fronts = []
      this.frontsKey = ''
      return
    }
    const key = `${waves.wave}:${waves.tonight.map(t => t.id).join(',')}`
    if (key !== this.frontsKey) {
      this.frontsKey = key
      const split = splitBudget({
        fronts: waves.tonight.filter(t => !t.raid).map(t => t.id),
        raid: waves.tonight.find(t => t.raid)?.id ?? null,
      }, 1000)
      const old = new Map(this.fronts.map(f => [f.id, f]))
      this.fronts = waves.tonight.map(t => ({
        id: t.id, post: t.post, heading: this.frontHeading(t.route, t.post),
        share: (split.get(t.id) ?? 0) / 1000,
        quietT: old.get(t.id)?.quietT ?? 0, released: old.get(t.id)?.released ?? false,
      }))
      this.facing = waves.tonight[0].post
    }
    if (waves.phase !== 'night') return
    // roads with walkers still out on them; one past the post is the hold's fight
    const out = new Set<string>()
    scene.enemies.forEachAlive(e => {
      if (e.fromWave && e.approach && !scene.regions.inHold(e.x, e.y)) out.add(e.approach)
    })
    for (const f of this.fronts) {
      if (f.released) continue
      const busy = out.has(f.id) || waves.pendingFor(f.id) > 0
        || !!scene.enemies.grid.nearest(f.post.x, f.post.y, ARMY.postLeash, e => e.alive)
      f.quietT = busy ? 0 : f.quietT + step
      if (f.quietT >= ARMY.frontQuiet) f.released = true
    }
  }

  /** A post faces up its road: toward the route a few cells back from it (toward the spawn). */
  private frontHeading(route: readonly Pt[], post: { x: number; y: number }): number {
    let k = -1, best = Infinity
    for (let i = 0; i < route.length; i++) {
      const d = Math.hypot(route[i][0] - post.x, route[i][1] - post.y)
      if (d < best) { best = d; k = i }
    }
    if (k > 0) {
      const [x, y] = route[Math.max(0, k - 4)]
      return Math.atan2(y - post.y, x - post.x)
    }
    return this.outward(post.x, post.y)
  }

  /**
   * Each defending soldier to one of tonight's fronts, by `assignFronts`. A
   * soldier keeps its front while it stands; newcomers (and those back from a
   * detachment) fill the fronts furthest below their share. A quiet front's
   * soldiers go to the nearest front still fighting; with none left, home.
   */
  private assignDefenders() {
    const defenders: Soldier[] = []
    for (const s of this.soldiers) {
      if (!s.alive) continue
      if (!this.fronts.length) s.front = null
      else if (this.orders[s.company] === 'defend' && !s.detail) defenders.push(s)
    }
    if (!defenders.length) return
    const live = this.fronts.filter(f => !f.released)
    if (!live.length) { for (const s of defenders) s.front = null; return }
    const byId = new Map(this.fronts.map(f => [f.id, f]))
    const counts = noCompanies()
    for (const s of defenders) counts[s.company]++
    const want = assignFronts(counts, live)
    const have: Record<string, Record<Company, number>> = {}
    for (const f of live) have[f.id] = noCompanies()
    const loose: Soldier[] = []
    for (const s of defenders) {
      let f = s.front ? byId.get(s.front) : undefined
      if (f?.released) {
        const from = f.post
        f = live.reduce((a, b) => Math.hypot(b.post.x - from.x, b.post.y - from.y) < Math.hypot(a.post.x - from.x, a.post.y - from.y) ? b : a)
      }
      if (!f) { loose.push(s); continue }
      s.front = f.id
      have[f.id][s.company]++
    }
    for (const s of loose) {
      let best = live[0], gap = -Infinity
      for (const f of live) {
        const g = want[f.id][s.company] - have[f.id][s.company]
        if (g > gap) { best = f; gap = g }
      }
      s.front = best.id
      have[best.id][s.company]++
    }
  }

  /** The bearing from the hall to a point; south when it is the hall. */
  private outward(x: number, y: number): number {
    const hall = this.scene.buildings.townHall
    const dx = x - hall.x, dy = y - hall.y
    return Math.hypot(dx, dy) < 1 ? Math.PI / 2 : Math.atan2(dy, dx)
  }

  /**
   * Where a soldier heading for its slot should steer (S06). With sight of
   * the anchor (the hero, or the hall when holding) it walks straight to the
   * slot, or to the nearest ground if the slot is in the water. Without, it
   * walks a path to the anchor, asked for again every second, whenever the
   * anchor has moved 200 px since, or when the soldier stops closing on it.
   */
  private route(s: Soldier, ax: number, ay: number, px: number, py: number, dt: number): { x: number; y: number } {
    const nav = this.scene.nav
    s.losT -= dt
    if (s.losT <= 0) {
      s.losT = 0.3 + (s.id % 7) * 0.02
      s.los = nav.paths.segClear(s.x, s.y, ax, ay, walkRadius(s.radius))
    }
    if (s.los) {
      s.follower.clear()
      s.pathTicket = null
      if (nav.passableAt(px, py)) return { x: px, y: py }
      const i = nav.nearestPassable(px, py)
      if (i < 0) return { x: ax, y: ay }
      const [cx, cy] = nav.r.xy(i)
      return { x: cx, y: cy }
    }
    s.pathT -= dt
    if (s.pathTicket?.done) { s.follower.set(s.pathTicket.path); s.pathTicket = null }
    if (!s.pathTicket && (s.pathT <= 0 || s.follower.stuck > 1.5 || Math.hypot(ax - s.pathAx, ay - s.pathAy) > 200)) {
      s.pathT = 1
      s.pathAx = ax; s.pathAy = ay
      s.pathTicket = nav.requestPath(s.x, s.y, ax, ay)
    }
    if (s.follower.active) {
      const w = s.follower.step(s.x, s.y, dt)
      if (!w.done) return w
    }
    return { x: px, y: py }
  }

  /** A soldier's base damage with its relics (`soldier.damage`, S15). */
  damageOf(def: { damage: number }): number {
    return this.scene.mods?.value('soldier.damage', def.damage) ?? def.damage
  }

  private strike(s: Soldier, target: Enemy) {
    const def = s.def
    const bonus = 1 + this.scene.buildings.bonus.troopDmg
    let dmg = this.damageOf(def) * bonus * this.buffDamage * this.scene.player.stats.troopDamage
    if (def.vsHeavy && target.radius >= 17) dmg *= def.vsHeavy

    const ang = Math.atan2(target.y - s.y, target.x - s.x)
    if (def.ranged) {
      this.scene.projectiles.fire(s.x + Math.cos(ang) * 12, s.y - 14 + Math.sin(ang) * 6, ang, {
        tex: def.key === 'crossbow' ? 'proj_bolt' : 'proj_arrow',
        damage: dmg, speed: def.projectileSpeed ?? 540, faction: 'ally', fromPlayer: false, knockback: 26,
      })
      this.scene.audio.playVaried('shoot', 0.16)
    } else {
      this.scene.combat.damageEnemy(target, dmg, s.x, s.y, 70, false, false)
      this.scene.fx.slash(s.x + Math.cos(ang) * 16, s.y - 14 + Math.sin(ang) * 8, ang, 0.55, def.colour)
    }
  }

  private bars?: Phaser.GameObjects.Graphics
  private drawBars() {
    if (!this.bars) this.bars = this.scene.add.graphics().setDepth(760_000)
    const g = this.bars
    g.clear()
    const view = this.scene.cameras.main.worldView
    for (const s of this.soldiers) {
      if (s.hp >= s.maxHp) continue
      if (!Phaser.Geom.Rectangle.Contains(view, s.x, s.y)) continue
      const w = 26
      const x = s.x - w / 2
      const y = s.y - 34
      const p = clamp(s.hp / s.maxHp, 0, 1)
      g.fillStyle(0x0a1018, 0.75); g.fillRect(x - 1, y - 1, w + 2, 5)
      g.fillStyle(PAL.allyBody, 1); g.fillRect(x, y, w * p, 3)
    }
  }

  /** Rally: a short, loud army-wide buff. */
  applyRally(damageMult: number, rateMult: number, seconds: number) {
    this.buffDamage = damageMult
    this.buffRate = rateMult
    this.scene.player.buffDamage = damageMult
    this.scene.player.buffRate = rateMult
    for (const s of this.soldiers) this.scene.fx.ring(s.x, s.y - 10, 44, PAL.gold, 0.5)
    this.scene.time.delayedCall(seconds * 1000, () => {
      this.buffDamage = 1
      this.buffRate = 1
      this.scene.player.buffDamage = 1
      this.scene.player.buffRate = 1
    })
  }

  toJSON() {
    const counts: Partial<Record<SoldierKey, number>> = {}
    for (const s of this.soldiers) counts[s.key] = (counts[s.key] ?? 0) + 1
    const units = this.soldiers.map(s => ({ key: s.key, x: s.x, y: s.y, hp: s.hp }))
    const orders: Record<Company, Order> = { ...this.orders }
    const banner = this.banner ? { x: Math.round(this.banner.x), y: Math.round(this.banner.y) } : null
    return { counts, units, totalRecruited: this.totalRecruited, orders, banner }
  }

  /** An old save's `holding` flag loads as the default orders. */
  load(d: ReturnType<ArmyManager['toJSON']>) {
    const hall = this.scene.buildings.townHall
    if (Array.isArray(d.units)) {
      for (const rec of d.units) {
        const s = this.recruit(rec.key, rec.x, rec.y, true)
        s.hp = Math.max(1, Math.min(s.maxHp, rec.hp))
      }
    } else {
      // Older saves stored counts only. Keep their army, then write unit state
      // in the next autosave.
      for (const k of Object.keys(d.counts) as SoldierKey[]) {
        for (let i = 0; i < (d.counts[k] ?? 0); i++) {
          this.recruit(k, hall.x + rr(-70, 70), hall.y + rr(40, 90), true)
        }
      }
    }
    this.totalRecruited = Math.max(this.soldiers.length, d.totalRecruited ?? this.soldiers.length)
    const orders = (d.orders ?? {}) as Partial<Record<Company, unknown>>
    for (const c of COMPANIES) {
      const o = orders[c]
      this.orders[c] = ORDERS.includes(o as Order) ? o as Order : 'defend'
    }
    const b = d.banner
    this.banner = b && Number.isFinite(b.x) && Number.isFinite(b.y) ? { x: b.x, y: b.y } : null
    if (!this.banner && COMPANIES.some(c => this.orders[c] === 'hold')) this.banner = { x: hall.x, y: hall.y + 60 }
    if (this.banner && !COMPANIES.some(c => this.orders[c] === 'hold')) this.banner = null
    this.dirty = true
  }
}
