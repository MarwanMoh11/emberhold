/**
 * The chart's pure parts (S12), shared by the minimap and the atlas and
 * tested without Phaser: what the hero has seen, the atlas's pan and zoom,
 * picking a stone under a finger, and the order a controller cycles stones in.
 */
import type { Pt } from '../config/world/blueprint'
import { inPoly } from '../world/raster'

/** World px per cell of the seen grid. */
export const SEEN_CELL = 256
/** How much ground walking marks seen: about the world fog brush's reach. */
export const SEEN_REVEAL = 480

/**
 * Where the hero has been, on a coarse grid: camps, POIs, pads and enemies
 * show on the charts only in seen cells. The picture of the fog itself is the
 * world's own fog page; this only answers "has anyone looked here?".
 */
export class ChartMemory {
  readonly cols: number
  readonly rows: number
  readonly cells: Uint8Array
  /** bumps whenever a cell turns seen */
  version = 0

  constructor(readonly width: number, readonly height: number) {
    this.cols = Math.ceil(width / SEEN_CELL)
    this.rows = Math.ceil(height / SEEN_CELL)
    this.cells = new Uint8Array(this.cols * this.rows)
  }

  index(x: number, y: number) {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor(x / SEEN_CELL)))
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor(y / SEEN_CELL)))
    return r * this.cols + c
  }

  seenAt(x: number, y: number) { return this.cells[this.index(x, y)] !== 0 }

  /** Mark every cell whose centre is within `radius` of (x, y). */
  reveal(x: number, y: number, radius = SEEN_REVEAL) {
    const span = Math.ceil(radius / SEEN_CELL)
    const cc = Math.floor(x / SEEN_CELL), cr = Math.floor(y / SEEN_CELL)
    const r2 = radius * radius
    for (let r = Math.max(0, cr - span); r <= Math.min(this.rows - 1, cr + span); r++) {
      for (let c = Math.max(0, cc - span); c <= Math.min(this.cols - 1, cc + span); c++) {
        const dx = (c + 0.5) * SEEN_CELL - x, dy = (r + 0.5) * SEEN_CELL - y
        if (dx * dx + dy * dy > r2) continue
        const i = r * this.cols + c
        if (this.cells[i]) continue
        this.cells[i] = 1
        this.version++
      }
    }
  }

  /** Mark every cell whose centre is inside `poly` (a claimed region is known ground). */
  revealPoly(poly: readonly Pt[]) {
    const [x0, y0, x1, y1] = bounds(poly)
    for (let r = Math.floor(y0 / SEEN_CELL); r <= Math.min(this.rows - 1, Math.floor(y1 / SEEN_CELL)); r++) {
      for (let c = Math.floor(x0 / SEEN_CELL); c <= Math.min(this.cols - 1, Math.floor(x1 / SEEN_CELL)); c++) {
        const i = r * this.cols + c
        if (this.cells[i] || !inPoly((c + 0.5) * SEEN_CELL, (r + 0.5) * SEEN_CELL, poly)) continue
        this.cells[i] = 1
        this.version++
      }
    }
  }

  /**
   * At least `min` seen cells inside `poly`: the region has been looked into,
   * not just glimpsed across its border from the next one.
   */
  anySeenIn(poly: readonly Pt[], min = 1) {
    const [x0, y0, x1, y1] = bounds(poly)
    let n = 0
    for (let r = Math.floor(y0 / SEEN_CELL); r <= Math.min(this.rows - 1, Math.floor(y1 / SEEN_CELL)); r++) {
      for (let c = Math.floor(x0 / SEEN_CELL); c <= Math.min(this.cols - 1, Math.floor(x1 / SEEN_CELL)); c++) {
        if (this.cells[r * this.cols + c] && inPoly((c + 0.5) * SEEN_CELL, (r + 0.5) * SEEN_CELL, poly) && ++n >= min) return true
      }
    }
    return false
  }
}

export function bounds(poly: readonly Pt[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  return [Math.max(0, x0), Math.max(0, y0), x1, y1]
}

/**
 * The atlas's camera: `z` screen px per world px, the world's origin at
 * (`ox`, `oy`) on screen, looking through the viewport `vp`. Zoom runs from
 * the whole world fitted (`zMin`) to `zMax`.
 */
export class AtlasView {
  z = 1
  ox = 0
  oy = 0
  zMin = 0.01
  zMax = 0.2
  vp = { x: 0, y: 0, w: 1, h: 1 }

  constructor(readonly width: number, readonly height: number) {}

  /** Size to a viewport; keeps the world point at the centre where it was. */
  resize(x: number, y: number, w: number, h: number, first = false) {
    const [cx, cy] = first ? [this.width / 2, this.height / 2] : this.toWorld(this.vp.x + this.vp.w / 2, this.vp.y + this.vp.h / 2)
    this.vp = { x, y, w, h }
    this.zMin = Math.min(w / this.width, h / this.height)
    this.zMax = Math.max(this.zMin * 4, 0.2)
    if (first) this.z = this.zMin
    this.z = Math.min(this.zMax, Math.max(this.zMin, this.z))
    this.centre(cx, cy)
  }

  toScreen(wx: number, wy: number): [number, number] { return [this.ox + wx * this.z, this.oy + wy * this.z] }
  toWorld(sx: number, sy: number): [number, number] { return [(sx - this.ox) / this.z, (sy - this.oy) / this.z] }

  centre(wx: number, wy: number) {
    this.ox = this.vp.x + this.vp.w / 2 - wx * this.z
    this.oy = this.vp.y + this.vp.h / 2 - wy * this.z
    this.clamp()
  }

  pan(dx: number, dy: number) { this.ox += dx; this.oy += dy; this.clamp() }

  /** Zoom by `factor` about the screen point (sx, sy), which keeps its world point. */
  zoomAt(sx: number, sy: number, factor: number) {
    const [wx, wy] = this.toWorld(sx, sy)
    this.z = Math.min(this.zMax, Math.max(this.zMin, this.z * factor))
    this.ox = sx - wx * this.z
    this.oy = sy - wy * this.z
    this.clamp()
  }

  /** The world never drifts off: centred on an axis it fits, else its edges stay past the viewport's. */
  private clamp() {
    const { x, y, w, h } = this.vp
    const ww = this.width * this.z, wh = this.height * this.z
    this.ox = ww <= w ? x + (w - ww) / 2 : Math.min(x, Math.max(x + w - ww, this.ox))
    this.oy = wh <= h ? y + (h - wh) / 2 : Math.min(y, Math.max(y + h - wh, this.oy))
  }
}

export interface ChartStone { id: string; x: number; y: number; active: boolean }

/** The stone nearest the screen point (sx, sy) within `radius` screen px, or null. */
export function pickStone<S extends ChartStone>(stones: readonly S[], view: AtlasView, sx: number, sy: number, radius = 28): S | null {
  let best: S | null = null, bestD = radius * radius
  for (const s of stones) {
    const [x, y] = view.toScreen(s.x, s.y)
    const d = (x - sx) ** 2 + (y - sy) ** 2
    if (d <= bestD) { best = s; bestD = d }
  }
  return best
}

/** Lit stones other than `here`: the Hall Stone first, then nearest first (the travel list's order). */
export function travelOrder<S extends ChartStone>(stones: readonly S[], here: S | null, hallId: string): S[] {
  if (!here) return []
  const d = (s: S) => (s.id === hallId ? -1 : Math.hypot(s.x - here.x, s.y - here.y))
  return stones.filter(s => s.active && s.id !== here.id).sort((a, b) => d(a) - d(b))
}

/**
 * A texture crop for a square window of world px [x0, x0+size)² on a texture
 * of `tw × th` texels at `scale` world px per texel, clamped to the texture.
 * `dx, dy` are where the crop's top-left sits in the window, in world px.
 */
export function windowCrop(x0: number, y0: number, size: number, scale: number, tw: number, th: number) {
  const cx0 = Math.max(0, x0 / scale), cy0 = Math.max(0, y0 / scale)
  const cx1 = Math.min(tw, (x0 + size) / scale), cy1 = Math.min(th, (y0 + size) / scale)
  return {
    x: cx0, y: cy0, w: Math.max(0, cx1 - cx0), h: Math.max(0, cy1 - cy0),
    dx: cx0 * scale - x0, dy: cy0 * scale - y0,
  }
}
