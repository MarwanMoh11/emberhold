import type Phaser from 'phaser'

/**
 * Paints world rect [wx, wx+size) × [wy, wy+size). The context arrives with a
 * transform from world px to canvas px (scaled by `scale`) and clipped to the
 * part the caller keeps, so strokes may land past the rect. It must depend on
 * world position and static config alone: neighbouring pieces are painted by
 * separate calls, in any order, and have to agree where they meet.
 */
export type ChunkPainter = (ctx: CanvasRenderingContext2D, wx: number, wy: number, size: number, scale: number) => void

export interface TerrainChunkOptions {
  /** the world's size; nothing past it is baked */
  width: number
  height: number
  /** world px per chunk side */
  chunk?: number
  /** canvas px per world px */
  scale?: number
  maxResident?: number
  /** the most baking a frame may do, in ms; one slice always runs */
  bakeBudgetMs?: number
  depth?: number
  /** chunks are baked a square slice of this many world px at a time, so a frame never paints a whole chunk */
  slice?: number
  /** world px painted past each slice's edge and clipped away */
  overdraw?: number
}

export interface TerrainChunkStats {
  resident: number
  baked: number
  queued: number
  /** ms spent baking in the last update */
  frameMs: number
  /** the most any update has spent baking (prime excluded) */
  worstFrameMs: number
}

/** What the streamer needs from a camera: Phaser's, or anything shaped like it. */
export type ChunkCamera = Pick<Phaser.Cameras.Scene2D.Camera, 'scrollX' | 'scrollY' | 'width' | 'height' | 'zoom'>

interface Chunk {
  cx: number
  cy: number
  /** world rect, cut off at the world's edge */
  x: number
  y: number
  w: number
  h: number
  image: Phaser.GameObjects.Image | null
  texKey: string | null
  /** the canvas being baked, and the next slice to paint into it */
  canvas: HTMLCanvasElement | null
  ctx: CanvasRenderingContext2D | null
  next: number
  /** never baked, evicted, or invalidated */
  dirty: boolean
  wanted: boolean
  /** the update that last wanted it, for the LRU */
  seen: number
}

const WARN_SLICE_MS = 12
let instances = 0

/**
 * The ground as a grid of chunk textures, streamed around the camera.
 *
 * Each chunk is a canvas at `scale` shown as one Image. Chunks in view, and
 * then a one-chunk margin, are baked nearest first. A chunk is baked slice by
 * slice (each slice clipped, with `overdraw` px painted past its edge) inside
 * a per-frame budget, and appears only once every slice is done; a re-bake
 * keeps the old texture on screen until the new one is ready. At most
 * `maxResident` chunks hold a canvas; the least recently wanted is evicted,
 * texture and all, when a new one needs room.
 */
export class TerrainChunks {
  private readonly chunk: number
  private readonly scale: number
  private readonly maxResident: number
  private readonly budget: number
  private readonly depth: number
  private readonly slice: number
  private readonly overdraw: number
  private readonly cols: number
  private readonly rows: number
  private readonly grid: Chunk[] = []
  private readonly id = ++instances
  private want: Chunk[] = []
  private inView = 0
  private tick = 0
  private gen = 0
  private baked = 0
  private sliceEstimate = 1
  private frameMs = 0
  private worstFrameMs = 0
  private warned = false

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly painter: ChunkPainter,
    opts: TerrainChunkOptions,
  ) {
    this.chunk = opts.chunk ?? 1024
    this.scale = opts.scale ?? 0.5
    this.maxResident = opts.maxResident ?? 24
    this.budget = opts.bakeBudgetMs ?? 4
    this.depth = opts.depth ?? 0
    this.slice = opts.slice ?? 256
    this.overdraw = opts.overdraw ?? 16
    this.cols = Math.ceil(opts.width / this.chunk)
    this.rows = Math.ceil(opts.height / this.chunk)
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const x = cx * this.chunk, y = cy * this.chunk
        this.grid.push({
          cx, cy, x, y,
          w: Math.min(this.chunk, opts.width - x),
          h: Math.min(this.chunk, opts.height - y),
          image: null, texKey: null, canvas: null, ctx: null, next: 0,
          dirty: true, wanted: false, seen: 0,
        })
      }
    }
    scene.events?.once('shutdown', () => this.destroy())
  }

  /** Bake toward the camera, nearest first, inside the frame budget. */
  update(camera: ChunkCamera) {
    this.plan(camera)
    const t0 = performance.now()
    let spent = 0
    bake: for (const c of this.want) {
      while (c.dirty) {
        // half a slice of headroom, because slices vary and the budget is a ceiling
        if (spent > 0 && spent + this.sliceEstimate * 1.5 > this.budget) break bake
        if (!this.bakeSlice(c)) break // no room for it yet; a later chunk may already have a canvas
        spent = performance.now() - t0
      }
    }
    this.frameMs = spent
    this.worstFrameMs = Math.max(this.worstFrameMs, spent)
  }

  /** Bake everything in view now, whatever it costs: for before play starts, so nothing pops in. */
  prime(camera: ChunkCamera) {
    this.plan(camera)
    let n = 0
    for (let i = 0; i < this.inView; i++) {
      const c = this.want[i]
      while (c.dirty && this.bakeSlice(c)) { /* keep going */ }
      if (!c.dirty) n++
    }
    return n
  }

  /** Re-bake the chunks that meet a world rect (all of them without one), e.g. when a claim tint changes. */
  invalidate(rect?: { x: number; y: number; width: number; height: number }) {
    for (const c of this.grid) {
      if (rect && (c.x >= rect.x + rect.width || c.x + c.w <= rect.x || c.y >= rect.y + rect.height || c.y + c.h <= rect.y)) continue
      c.dirty = true
      c.next = 0
    }
  }

  stats(): TerrainChunkStats {
    let resident = 0, queued = 0
    for (const c of this.grid) if (c.image || c.canvas) resident++
    for (const c of this.want) if (c.dirty) queued++
    return { resident, baked: this.baked, queued, frameMs: this.frameMs, worstFrameMs: this.worstFrameMs }
  }

  destroy() {
    for (const c of this.grid) this.evict(c)
    this.want = []
  }

  // ---- internals -----------------------------------------------------------------

  /** The chunks to hold: in view nearest first, then the margin ring nearest first, as room allows. */
  private plan(camera: ChunkCamera) {
    this.tick++
    const vw = camera.width / camera.zoom, vh = camera.height / camera.zoom
    const mx = camera.scrollX + camera.width / 2, my = camera.scrollY + camera.height / 2
    const K = this.chunk
    const clampX = (v: number) => Math.max(0, Math.min(this.cols - 1, v))
    const clampY = (v: number) => Math.max(0, Math.min(this.rows - 1, v))
    const i0 = clampX(Math.floor((mx - vw / 2) / K)), i1 = clampX(Math.floor((mx + vw / 2) / K))
    const j0 = clampY(Math.floor((my - vh / 2) / K)), j1 = clampY(Math.floor((my + vh / 2) / K))
    const near: Chunk[] = [], ring: Chunk[] = []
    for (let cy = clampY(j0 - 1); cy <= clampY(j1 + 1); cy++) {
      for (let cx = clampX(i0 - 1); cx <= clampX(i1 + 1); cx++) {
        const c = this.grid[cy * this.cols + cx]
        ;(cx >= i0 && cx <= i1 && cy >= j0 && cy <= j1 ? near : ring).push(c)
      }
    }
    const d2 = (c: Chunk) => (c.x + c.w / 2 - mx) ** 2 + (c.y + c.h / 2 - my) ** 2
    const byDistance = (a: Chunk, b: Chunk) => d2(a) - d2(b)
    near.sort(byDistance)
    ring.sort(byDistance)
    for (const c of this.want) c.wanted = false
    this.want = near.concat(ring).slice(0, Math.max(this.maxResident, near.length))
    this.inView = near.length
    for (const c of this.want) { c.wanted = true; c.seen = this.tick }
  }

  /** Paint the next slice of `c`, publishing it when it is whole. False when there is no room to start it. */
  private bakeSlice(c: Chunk) {
    if (!c.canvas && !this.allocate(c)) return false
    const x = c.ctx!
    const t0 = performance.now()
    const S = this.slice, per = Math.ceil(c.w / S), count = per * Math.ceil(c.h / S)
    const sx = c.x + (c.next % per) * S, sy = c.y + Math.floor(c.next / per) * S
    x.save()
    x.setTransform(this.scale, 0, 0, this.scale, -c.x * this.scale, -c.y * this.scale)
    x.beginPath()
    x.rect(sx, sy, Math.min(S, c.x + c.w - sx), Math.min(S, c.y + c.h - sy))
    x.clip()
    x.clearRect(sx, sy, S, S)
    this.painter(x, sx - this.overdraw, sy - this.overdraw, S + this.overdraw * 2, this.scale)
    x.restore()
    if (++c.next >= count) this.publish(c)
    const ms = performance.now() - t0
    // a decaying max, not a mean: one slow slice should make the next frames cautious
    this.sliceEstimate = Math.max(ms, this.sliceEstimate * 0.95)
    if (ms > WARN_SLICE_MS && !this.warned) {
      this.warned = true
      console.warn(`terrain: baking a ${S} px slice of chunk ${c.cx},${c.cy} took ${ms.toFixed(1)} ms`)
    }
    return true
  }

  /** Give `c` a canvas, evicting the least recently wanted chunk if the cap is reached. */
  private allocate(c: Chunk) {
    let resident = 0
    let lru: Chunk | null = null
    for (const o of this.grid) {
      if (!o.image && !o.canvas) continue
      resident++
      if (!o.wanted && (!lru || o.seen < lru.seen)) lru = o
    }
    if (resident >= this.maxResident && !c.image) {
      if (!lru) return false
      this.evict(lru)
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(c.w * this.scale)
    canvas.height = Math.ceil(c.h * this.scale)
    c.canvas = canvas
    c.ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    c.next = 0
    return true
  }

  private publish(c: Chunk) {
    const key = `terrain:${this.id}:${c.cx},${c.cy}:${++this.gen}`
    const tm = this.scene.textures
    // a plain texture from the canvas: addCanvas would read every pixel back for its CanvasTexture
    tm.addImage(key, c.canvas as unknown as HTMLImageElement)
    if (c.image) {
      c.image.setTexture(key)
      if (c.texKey) tm.remove(c.texKey)
    } else {
      c.image = this.scene.add.image(c.x, c.y, key).setOrigin(0, 0).setScale(1 / this.scale).setDepth(this.depth)
    }
    c.texKey = key
    c.canvas = null
    c.ctx = null
    c.dirty = false
    this.baked++
  }

  private evict(c: Chunk) {
    c.image?.destroy()
    if (c.texKey && this.scene.textures.exists(c.texKey)) this.scene.textures.remove(c.texKey)
    c.image = null
    c.texKey = null
    c.canvas = null
    c.ctx = null
    c.next = 0
    c.dirty = true
  }
}
