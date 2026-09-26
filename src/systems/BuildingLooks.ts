import type Phaser from 'phaser'
import { ensureBuildingTexture, YARD } from '../art/buildings'
import { BASE_LOOK, BLD_TEXTURE_CAP, isBaseLook, isVariantKey, lookFor, MILL_WHEEL_REACH, variantTextureKey, yardFor, type Look } from '../art/looks'
import { raster, REGION_BY_ID } from '../config/world'
import { T } from '../world/raster'
import type { Building, BuildingSkin } from '../entities/Building'
import type { GameScene } from '../scenes/GameScene'

/** Most ms the idle slice spends baking in one frame (it always bakes at least one). */
const SLICE_MS = 4

/**
 * Regional looks and yards (S13b C4). Every styled pad wears its region's
 * style and a seeded roof tone; the variant textures are baked lazily, one
 * idle slice a frame, when a pad is revealed or starts to rise, and released
 * when no pad shows them. Until a variant is ready the pad wears the base art.
 *
 * Budget: at most `BLD_TEXTURE_CAP` `bld_` textures at once. Past it a pad
 * takes its style's first tone, then the base, so the cap always holds.
 */
export class BuildingLooks implements BuildingSkin {
  private readonly lookOf = new Map<Building, Look>()
  /** the variant texture each pad holds (shows, or will show next) */
  private readonly held = new Map<Building, string>()
  /** variant texture → the pads holding it; a key here counts toward the cap */
  private readonly refs = new Map<string, Set<Building>>()
  private readonly jobs = new Map<string, { b: Building; lvl: number; look: Look }>()
  private readonly yards = new Map<Building, Phaser.GameObjects.Image[]>()
  private readonly unyarded = new Set<Building>()
  private cap = -1
  private base = 0
  private readonly stat = { bakes: 0, ms: 0, maxMs: 0, released: 0 }
  /** pads wearing less than their look because of the cap */
  private readonly fellBack = new Set<Building>()

  constructor(private scene: GameScene, private pads: () => Iterable<Building>) {}

  /** A pad's look, worked out once: its region's style, its seeded tone, a mill's wheel by the river. */
  look(b: Building): Look {
    let l = this.lookOf.get(b)
    if (!l) {
      const biome = REGION_BY_ID.get(b.region)?.biome
      l = biome ? lookFor(b.key, b.padId, biome, b.key === 'mill' && nearWater(b.x, b.y, MILL_WHEEL_REACH)) : BASE_LOOK
      this.lookOf.set(b, l)
    }
    return l
  }

  // ---- BuildingSkin ------------------------------------------------------------

  texture(b: Building, lvl: number): string {
    const tex = this.want(b, lvl)
    return this.scene.textures.exists(tex) ? tex : variantTextureKey(b.key, lvl, BASE_LOOK)
  }

  dress(b: Building) {
    const imgs = this.yards.get(b)
    if (b.level <= 0) {
      if (imgs) for (const i of imgs) i.setVisible(false)
      this.unyarded.delete(b)
      return
    }
    // a new yard waits for the next update, when every pad is known
    if (imgs) for (const i of imgs) i.setVisible(true)
    else this.unyarded.add(b)
  }

  /** Bake a pad's art for `lvl` ahead of need: when its pad is revealed, or it starts to rise. */
  prebake(b: Building, lvl: number) {
    if (lvl <= b.maxLevel) this.want(b, lvl)
  }

  /** Whether a pad already holds (or needs no) variant: the reveal check calls this every frame. */
  settled(b: Building): boolean {
    return this.held.has(b) || isBaseLook(this.look(b))
  }

  // ---- the idle slice ----------------------------------------------------------

  /** Lay waiting yards, then bake queued variants, one at least, up to `SLICE_MS`, and swap them onto their pads. */
  update() {
    if (this.unyarded.size) {
      for (const b of this.unyarded) if (b.level > 0 && !this.yards.has(b)) this.yards.set(b, this.layYard(b))
      this.unyarded.clear()
    }
    if (!this.jobs.size) return
    const t0 = performance.now()
    for (const [tex, job] of this.jobs) {
      this.jobs.delete(tex)
      const holders = this.refs.get(tex)
      if (!holders || this.scene.textures.exists(tex)) continue
      const s = performance.now()
      ensureBuildingTexture(this.scene, job.b.key, job.lvl, job.look)
      const ms = performance.now() - s
      this.stat.bakes++; this.stat.ms += ms; this.stat.maxMs = Math.max(this.stat.maxMs, ms)
      for (const h of holders) {
        if (h.level > 0 && h.state === 'done' && h.sprite.texture.key !== tex && this.held.get(h) === tex) h.applyTexture()
      }
      if (performance.now() - t0 >= SLICE_MS) break
    }
  }

  // ---- holding and the cap -----------------------------------------------------

  /** The variant `b` should wear at `lvl` under the cap; takes the hold and queues the bake. */
  private want(b: Building, lvl: number): string {
    const look = this.look(b)
    const baseTex = variantTextureKey(b.key, lvl, BASE_LOOK)
    if (isBaseLook(look)) { this.hold(b, null); return baseTex }
    if (this.cap < 0) {
      // textures outlive the scene: a restarted game drops the last one's variants first
      const tm = this.scene.textures
      for (const k of tm.getTextureKeys()) if (isVariantKey(k)) tm.remove(k)
      this.base = tm.getTextureKeys().filter(k => k.startsWith('bld_')).length
      this.cap = Math.max(0, BLD_TEXTURE_CAP - this.base)
    }
    const mine = this.held.get(b)
    let pick: string | null = null
    const tries = look.tone > 0 ? [look, { ...look, tone: 0 }] : [look]
    for (const l of tries) {
      if (isBaseLook(l)) break
      const tex = variantTextureKey(b.key, lvl, l)
      if (this.refs.has(tex) || this.refs.size - (mine && this.refs.get(mine)?.size === 1 ? 1 : 0) < this.cap) {
        pick = tex
        if (!this.refs.has(tex) && !this.scene.textures.exists(tex)) this.jobs.set(tex, { b, lvl, look: l })
        break
      }
    }
    if (pick === variantTextureKey(b.key, lvl, look)) this.fellBack.delete(b); else this.fellBack.add(b)
    this.hold(b, pick)
    return pick ?? baseTex
  }

  private hold(b: Building, tex: string | null) {
    const was = this.held.get(b)
    if (was === tex) return
    if (was) {
      const set = this.refs.get(was)
      set?.delete(b)
      if (set && set.size === 0) {
        this.refs.delete(was)
        this.jobs.delete(was)
        // nobody shows it: give its slot back (a pad mid-raise shows its frame)
        if (this.scene.textures.exists(was)) { this.scene.textures.remove(was); this.stat.released++ }
      }
    }
    if (tex) {
      this.held.set(b, tex)
      let set = this.refs.get(tex)
      if (!set) this.refs.set(tex, set = new Set())
      set.add(b)
    } else this.held.delete(b)
  }

  // ---- yards -------------------------------------------------------------------

  /**
   * Stand a built pad's 1–2 props beside it, on its seeded side unless a road,
   * a wall or another pad is there and the other side is clear. Depth by y,
   * culled like the building.
   */
  private layYard(b: Building): Phaser.GameObjects.Image[] {
    const y = yardFor(b.key, b.padId)
    if (!y || b.piece) return []
    const slots = (side: number) => [
      [b.x + side * (b.halfW + 18), b.y + 4],
      [b.x + side * (b.halfW + 10), b.y - b.halfH * 0.6],
    ]
    const clear = (px: number, py: number) => {
      const nav = this.scene.nav
      if (nav.onRoad(px, py) || nav.blockedAt(px, py)) return false
      for (const o of this.pads()) {
        if (o !== b && Math.abs(o.x - px) < o.halfW + 12 && Math.abs(o.y - py) < o.halfH + 10) return false
      }
      return true
    }
    const fits = (side: number) => slots(side).slice(0, y.props.length).filter(([px, py]) => clear(px, py)).length
    let side = y.mirror ? -1 : 1
    if (fits(-side) > fits(side)) side = -side
    const out: Phaser.GameObjects.Image[] = []
    slots(side).slice(0, y.props.length).forEach(([px, py], i) => {
      if (!clear(px, py)) return
      const img = this.scene.add.image(px, py, `yard_${y.props[i]}`)
      img.setOrigin(0.5, 1 - YARD.foot / YARD.h).setDepth(py)
      this.scene.culler.add(img, px, py - YARD.h / 2, YARD.w)
      out.push(img)
    })
    return out
  }

  // ---- reporting ---------------------------------------------------------------

  /** For the harness and S21: textures held, the cap, bakes and their cost. */
  stats() {
    const bld = this.scene.textures.getTextureKeys().filter(k => k.startsWith('bld_')).length
    const n = this.stat.bakes
    return {
      bld, base: this.base, variants: this.refs.size, cap: BLD_TEXTURE_CAP, queued: this.jobs.size,
      bakes: n, bakeMs: n ? +(this.stat.ms / n).toFixed(2) : 0, bakeMaxMs: +this.stat.maxMs.toFixed(2),
      fallbacks: this.fellBack.size, released: this.stat.released, yards: [...this.yards.values()].reduce((a, v) => a + v.length, 0),
    }
  }

  /** One pad's look and yard, for the harness. */
  inspect(b: Building) {
    const imgs = this.yards.get(b) ?? []
    return { look: this.look(b), tex: b.sprite.texture.key, yard: imgs.map(i => i.texture.key.slice(5)), side: imgs.length ? Math.sign(imgs[0].x - b.x) : 0 }
  }
}

/** River or lake water within `r` px of a point (a mill's wheel). */
function nearWater(x: number, y: number, r: number): boolean {
  const R = raster()
  for (let dy = -r; dy <= r; dy += R.C) {
    for (let dx = -r; dx <= r; dx += R.C) {
      if (dx * dx + dy * dy > r * r) continue
      const i = R.cell(x + dx, y + dy)
      if (i >= 0 && R.terrain[i] === T.WATER) return true
    }
  }
  return false
}
