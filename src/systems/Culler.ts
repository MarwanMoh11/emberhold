import type Phaser from 'phaser'

/** What the culler reads of a camera; the main camera satisfies it. */
export type CullCamera = Pick<Phaser.Cameras.Scene2D.Camera, 'id' | 'scrollX' | 'scrollY' | 'width' | 'height' | 'zoom'>

/** Any game object: the culler only touches its camera filter. */
export interface Cullable { cameraFilter: number }

/** A pooled object that moves (a unit, a shot, a pickup): its place is read live every frame. */
export interface Mover extends Cullable { x: number; y: number; once?: (event: string, fn: () => void) => unknown }

export interface CullerOptions {
  /** Spatial hash bucket, world px. */
  bucket?: number
  /** How far outside the view an object still draws, world px. */
  margin?: number
  /** Re-cull at least this often while the camera is still, ms. */
  interval?: number
  /** Re-cull at once when the camera has moved this far, world px. */
  moveStep?: number
  /** How far outside the view a mover still draws, world px (its sprite's reach included). */
  moverMargin?: number
}

interface Entry {
  obj: Cullable
  x: number
  y: number
  r: number
  key: number
  shown: boolean
}

const keyOf = (bx: number, by: number) => (by + 32768) * 65536 + (bx + 32768)

/**
 * Keeps static world objects (nodes, building sprites, labels) from being
 * drawn when they are nowhere near the camera. Every object is a disc in a
 * spatial hash; each update hides what misses the view plus `margin`, and
 * shows what has come back within it.
 *
 * It hides through the camera filter, not `visible`: game logic owns
 * `visible` (a felled rock, a built pad's ghost) and must never find it
 * flipped, and an object the culler hid comes back exactly as the game left
 * it. Objects that move and simulate (enemies, allies, shots, pickups) are
 * `movers` (S21): no hash, just a bounds test against the view every frame,
 * since Phaser draws every visible sprite wherever it stands. A late-game
 * night had ~1500 of them off screen.
 */
export class Culler {
  private readonly bucket: number
  private readonly margin: number
  private readonly interval: number
  private readonly moveStep: number
  private readonly moverMargin: number
  private readonly movers = new Set<Mover>()
  private readonly buckets = new Map<number, Entry[]>()
  private readonly entries = new Map<Cullable, Entry>()
  private readonly shown = new Set<Entry>()
  private maxRadius = 0
  private camId = 0
  private dirty = true
  private lastAt = -Infinity
  private lastX = 0
  private lastY = 0
  private lastZoom = 0
  private lastW = 0
  private lastH = 0

  constructor({ bucket = 1024, margin = 256, interval = 150, moveStep = 64, moverMargin = 128 }: CullerOptions = {}) {
    this.moverMargin = moverMargin
    this.bucket = bucket
    this.margin = margin
    this.interval = interval
    this.moveStep = moveStep
  }

  /** Track `obj` as a disc of `radius` around world (x, y). It starts shown. */
  add(obj: Cullable, x: number, y: number, radius: number) {
    if (this.entries.has(obj)) this.remove(obj)
    const key = keyOf(Math.floor(x / this.bucket), Math.floor(y / this.bucket))
    const e: Entry = { obj, x, y, r: radius, key, shown: true }
    this.entries.set(obj, e)
    let list = this.buckets.get(key)
    if (!list) this.buckets.set(key, list = [])
    list.push(e)
    this.shown.add(e)
    this.maxRadius = Math.max(this.maxRadius, radius)
    this.dirty = true
  }

  /** Track a moving object for its whole life (pooled ones are never released). */
  addMover(obj: Mover) {
    this.movers.add(obj)
    obj.once?.('destroy', () => this.movers.delete(obj))
  }

  /** Stop tracking `obj`, and give it back to the camera if it was hidden. */
  remove(obj: Cullable) {
    const e = this.entries.get(obj)
    if (!e) return
    this.entries.delete(obj)
    this.shown.delete(e)
    const list = this.buckets.get(e.key)
    if (list) {
      const i = list.indexOf(e)
      if (i >= 0) list.splice(i, 1)
      if (list.length === 0) this.buckets.delete(e.key)
    }
    if (!e.shown) obj.cameraFilter &= ~this.camId
  }

  /**
   * Call every frame. It does the work every `interval` ms, or at once when
   * the camera has moved `moveStep` px, zoomed or resized, or objects were added.
   */
  update(camera: CullCamera, now = performance.now()) {
    if (!camera.id) return // past the 32nd camera ids run out; draw everything
    if (camera.id !== this.camId) this.retarget(camera.id)
    this.cullMovers(camera)
    const moved = Math.abs(camera.scrollX - this.lastX) > this.moveStep
      || Math.abs(camera.scrollY - this.lastY) > this.moveStep
      || camera.zoom !== this.lastZoom || camera.width !== this.lastW || camera.height !== this.lastH
    if (!this.dirty && !moved && now - this.lastAt < this.interval) return
    this.dirty = false
    this.lastAt = now
    this.lastX = camera.scrollX
    this.lastY = camera.scrollY
    this.lastZoom = camera.zoom
    this.lastW = camera.width
    this.lastH = camera.height

    const vw = camera.width / camera.zoom, vh = camera.height / camera.zoom
    const cx = camera.scrollX + camera.width / 2, cy = camera.scrollY + camera.height / 2
    const left = cx - vw / 2 - this.margin, right = cx + vw / 2 + this.margin
    const top = cy - vh / 2 - this.margin, bottom = cy + vh / 2 + this.margin
    const meets = (e: Entry) => e.x + e.r >= left && e.x - e.r <= right && e.y + e.r >= top && e.y - e.r <= bottom

    for (const e of this.shown) {
      if (meets(e)) continue
      e.shown = false
      e.obj.cameraFilter |= this.camId
      this.shown.delete(e)
    }
    const K = this.bucket, pad = this.maxRadius
    const bx0 = Math.floor((left - pad) / K), bx1 = Math.floor((right + pad) / K)
    const by0 = Math.floor((top - pad) / K), by1 = Math.floor((bottom + pad) / K)
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const list = this.buckets.get(keyOf(bx, by))
        if (!list) continue
        for (const e of list) {
          if (e.shown || !meets(e)) continue
          e.shown = true
          e.obj.cameraFilter &= ~this.camId
          this.shown.add(e)
        }
      }
    }
  }

  /** `shown` are drawn (unless the game hid them); the rest are culled. */
  stats() {
    return { total: this.entries.size, shown: this.shown.size, movers: this.movers.size }
  }

  private cullMovers(camera: CullCamera) {
    const id = this.camId, m = this.moverMargin
    const vw = camera.width / camera.zoom, vh = camera.height / camera.zoom
    const left = camera.scrollX + (camera.width - vw) / 2 - m, top = camera.scrollY + (camera.height - vh) / 2 - m
    const right = left + vw + 2 * m, bottom = top + vh + 2 * m
    for (const o of this.movers) {
      const off = o.x < left || o.x > right || o.y < top || o.y > bottom
      o.cameraFilter = off ? o.cameraFilter | id : o.cameraFilter & ~id
    }
  }

  /** A different camera: move every hidden object's filter bit over to it. */
  private retarget(id: number) {
    for (const o of this.movers) o.cameraFilter &= ~this.camId
    for (const e of this.entries.values()) {
      if (e.shown) continue
      e.obj.cameraFilter = (e.obj.cameraFilter & ~this.camId) | id
    }
    this.camId = id
    this.dirty = true
  }
}
