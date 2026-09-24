import type Phaser from 'phaser'
import { OUTPOST, WAYSTONE } from '../config/balance'
import { PAL } from '../config/palette'
import { POIS, REGION_BY_ID, type RegionId } from '../config/world'
import type { GameScene } from '../scenes/GameScene'

/**
 * Waystones (S11, design 04 §Outposts and waystones). A stone stands beside
 * every built outpost (id = the outpost's pad id) and alone at the POIs
 * `wsHall` and `wsIsle`. Walk into one once to light it. Standing on a lit
 * stone, pick another: a WAYSTONE.channel second channel that damage (or
 * stepping off) breaks, then the hero and every soldier within
 * WAYSTONE.escort arrive in a ring at the far stone. By day any lit stone;
 * at night only the Hall Stone, the rush home.
 *
 * The hero picks a destination on the atlas (`ui/Atlas.ts`, S12), which
 * calls `list`, `canTravel` and `travel`.
 */

export interface Stone {
  id: string
  name: string
  x: number
  y: number
  region: RegionId
  /** a lone stone (a POI) rather than an outpost's */
  lone: boolean
}

export interface StoneInfo extends Stone {
  active: boolean
}

export interface Channel {
  from: string
  to: string
  /** seconds channelled so far */
  t: number
}

/** The two stones that stand on their own. */
export const LONE_STONES: Stone[] = POIS.filter(p => p.kind === 'waystone').map(p => ({
  id: p.id,
  name: p.name.charAt(0).toUpperCase() + p.name.slice(1),
  x: p.x,
  y: p.y,
  region: p.region,
  lone: true,
}))

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export class Waystones {
  private readonly active = new Set<string>([WAYSTONE.hallStone])
  /** the channel in flight, if any */
  channel: Channel | null = null
  /** the lit stone the hero stands on, or null */
  here: string | null = null
  /** set when travel was refused or broken, for the list's footer */
  lastWhy = ''
  private lastHp = 0
  private readonly glows = new Map<string, Phaser.GameObjects.Image>()

  constructor(private readonly scene: GameScene) {
    for (const s of LONE_STONES) {
      const img = scene.add.image(s.x, s.y, 'ws_stone')
      img.setOrigin(0.5, 1 - 16 / img.height).setDepth(s.y)
      scene.culler?.add(img, s.x, s.y - 24, 60)
    }
  }

  /** Every stone standing now: the lone ones, then each built outpost's. */
  stones(): Stone[] {
    const out = [...LONE_STONES]
    for (const b of this.scene.buildings.outposts()) {
      out.push({
        id: b.padId,
        name: cap(REGION_BY_ID.get(b.region)?.name ?? b.padId),
        x: b.x + OUTPOST.stoneDx,
        y: b.y + OUTPOST.stoneDy,
        region: b.region,
        lone: false,
      })
    }
    return out
  }

  stone(id: string): Stone | null { return this.stones().find(s => s.id === id) ?? null }

  isActive(id: string) { return this.active.has(id) }

  /** Every standing stone and whether it is lit (CONTRACTS §S11). */
  list(): StoneInfo[] { return this.stones().map(s => ({ ...s, active: this.active.has(s.id) })) }

  /** Light a stone. False if it does not stand or was already lit. */
  activate(id: string, silent = false): boolean {
    if (this.active.has(id)) return false
    const s = this.stone(id)
    if (!s) return false
    this.active.add(id)
    if (!silent) {
      const fx = this.scene.fx
      fx.ring(s.x, s.y - 20, 110, PAL.heroTrim, 0.6)
      fx.popup(s.x, s.y - 64, 'WAYSTONE LIT', PAL.heroTrim, 18)
      this.scene.audio.play('quest', 1.2, 0.5)
      this.scene.bus.emit('waystone:lit', { id })
    }
    return true
  }

  /** Whether the hero, standing on a lit stone, may leave for `to` now; `why` says why not. */
  canTravel(to: string): { ok: boolean; why: string } {
    if (!this.here) return { ok: false, why: 'Stand on a lit waystone' }
    if (to === this.here) return { ok: false, why: 'You are here' }
    if (!this.active.has(to)) return { ok: false, why: 'Not lit yet' }
    if (!this.stone(to)) return { ok: false, why: 'Gone' }
    if (this.scene.waves.isNight && to !== WAYSTONE.hallStone) return { ok: false, why: 'Night: only the Hall Stone' }
    return { ok: true, why: '' }
  }

  /** Begin the channel to `to` (CONTRACTS §S11). False, with `lastWhy`, when refused. */
  travel(to: string): boolean {
    const c = this.canTravel(to)
    if (!c.ok) { this.lastWhy = c.why; this.scene.audio.play('deny', 1, 0.4); return false }
    this.channel = { from: this.here!, to, t: 0 }
    this.lastHp = this.scene.player.hp
    this.lastWhy = ''
    this.scene.audio.play('ability', 0.8, 0.4)
    return true
  }

  cancel(why: string) {
    if (!this.channel) return
    this.channel = null
    this.lastWhy = why
    this.scene.fx.popup(this.scene.player.x, this.scene.player.y - 60, why.toUpperCase(), PAL.danger, 14)
  }

  update(dt: number) {
    const p = this.scene.player
    const stones = this.stones()
    this.here = null
    if (p.alive) {
      const r2 = WAYSTONE.touch * WAYSTONE.touch
      for (const s of stones) {
        const dx = p.x - s.x, dy = p.y - s.y
        if (dx * dx + dy * dy > r2) continue
        if (!this.active.has(s.id)) this.activate(s.id)
        this.here = s.id
        break
      }
    }
    this.syncGlows(stones)

    const ch = this.channel
    if (!ch) return
    if (!p.alive) { this.cancel('Fallen'); return }
    if (p.hp < this.lastHp - 0.01) { this.cancel('Interrupted'); return }
    this.lastHp = p.hp
    if (this.here !== ch.from) { this.cancel('Stepped off the stone'); return }
    if (this.scene.waves.isNight && ch.to !== WAYSTONE.hallStone) { this.cancel('Night fell'); return }
    ch.t += dt
    if (ch.t >= WAYSTONE.channel) this.arrive(ch)
  }

  /** Channel progress 0..1, for the list. */
  get progress() { return this.channel ? Math.min(1, this.channel.t / WAYSTONE.channel) : 0 }

  private arrive(ch: Channel) {
    this.channel = null
    const to = this.stone(ch.to)
    if (!to) return
    const s = this.scene
    const p = s.player
    const fromX = p.x, fromY = p.y
    // arrive just south of the stone, clear of an outpost's blockhouse
    const ax = to.x, ay = to.y + 40
    s.fx.ring(fromX, fromY - 20, 120, PAL.heroTrim, 0.5)

    const escort = s.army.soldiers.filter(u => u.alive
      && Math.hypot(u.x - fromX, u.y - fromY) <= WAYSTONE.escort)
    p.x = ax; p.y = ay
    p.vx = 0; p.vy = 0
    p.container.setPosition(ax, ay)
    escort.forEach((u, i) => {
      // rings of 10, 70 px out and 36 px further per ring
      const ring = Math.floor(i / 10), k = i % 10
      const n = Math.min(10, escort.length - ring * 10)
      const a = (k / n) * Math.PI * 2 + ring * 0.3
      const r = 70 + ring * 36
      const pt = s.nav.passableAt(ax + Math.cos(a) * r, ay + Math.sin(a) * r)
        ? { x: ax + Math.cos(a) * r, y: ay + Math.sin(a) * r }
        : { x: ax + (k - n / 2) * 6, y: ay + 20 }
      u.x = pt.x; u.y = pt.y
      u.vx = 0; u.vy = 0
      u.target = null
      u.follower.clear()
      u.pathTicket = null
      u.state = 'form'
      u.sprite.setPosition(pt.x, pt.y).setDepth(pt.y)
    })

    const cam = s.cameras.main
    cam.centerOn(ax, ay)
    s.terrain.prime(cam)
    s.fx.ring(ax, ay - 20, 140, PAL.heroTrim, 0.6)
    s.audio.play('levelup', 1.1, 0.4)
    this.scene.bus.emit('waystone:travelled', { from: ch.from, to: ch.to, escort: escort.length })
  }

  private syncGlows(stones: Stone[]) {
    for (const s of stones) {
      if (!this.active.has(s.id) || this.glows.has(s.id)) continue
      const g = this.scene.add.image(s.x, s.y - 20, 'fx_glow_blue')
        .setBlendMode('ADD').setAlpha(0.55).setScale(0.9).setDepth(s.y + 1)
      this.scene.culler?.add(g, s.x, s.y - 20, 60)
      this.glows.set(s.id, g)
    }
    // an outpost that fell takes its stone's light with it
    for (const [id, g] of this.glows) {
      const stands = stones.some(s => s.id === id)
      if (g.visible !== stands) g.setVisible(stands)
    }
  }

  /** The save's `waystones`: lit stone ids (outpost pad ids, `wsHall`, `wsIsle`). */
  toJSON(): string[] { return [...this.active] }

  load(ids: readonly string[] | undefined) {
    this.active.clear()
    this.active.add(WAYSTONE.hallStone)
    for (const id of ids ?? []) this.active.add(id)
  }
}
