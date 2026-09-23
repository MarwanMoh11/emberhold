/**
 * The NavGrid: the raster made walkable (S05).
 *
 * Wraps the shared world raster (one 32 px cell per nav cell) and adds the
 * things that change while the game runs: built walls, which cost
 * WALL_COST to walk through rather than being solid, so a sealed hold is
 * still reachable and the horde attacks the cheapest wall; and sealed
 * crossings (the caldera causeway until Ashgate burns).
 *
 * Flow fields are 8-way Dijkstra from a target (the hall, or a crossing for
 * S09's `via` legs). Each cell keeps its distance and an Int8 step toward the
 * target, so an enemy's steering is one array read. When blockers change the
 * fields go stale and rebuild in slices of `sliceMs` per frame (`tick`), and
 * the old field keeps serving until the new one is whole.
 *
 * Pure TypeScript, no Phaser: tests load it with loadTs.
 */
import { NB8 } from './flow'
import { Heap } from './heap'
import { PathFinder, type PathStats, type PathTicket, type Pt } from './PathFind'
import { T, type WorldRaster } from './raster'

/** A built wall makes its cells this many times dearer to walk through. */
export const WALL_COST = 40

/** The hero, soldiers and workers move this much faster on a road cell. Never enemies. */
export const ROAD_SPEED = 1.2

/** The circle a walker collides with terrain by: half its body, at most 12 px, so it fits any crossing the fields use. */
export const walkRadius = (bodyRadius: number): number => Math.min(bodyRadius * 0.5, 12)

export type FieldTarget = 'hall' | `via:${string}`

/** NB8 index of the opposite step. */
const OPP = NB8.map(([dx, dy]) => NB8.findIndex(([ex, ey]) => ex === -dx && ey === -dy))

export class FlowField {
  constructor(
    private readonly r: WorldRaster,
    /** distance to the target in px per cell; Infinity where unreachable */
    readonly d: Float32Array,
    /** NB8 index of the step toward the target per cell; -1 at the target or where unreachable */
    readonly step: Int8Array,
    /** the NavGrid version this field was built for */
    readonly version: number,
  ) {}

  /** The next cell downhill from cell i, or -1 at the target or off the field. */
  nextCell(i: number): number {
    if (i < 0) return -1
    const k = this.step[i]
    if (k < 0) return -1
    const [dx, dy] = NB8[k]
    return i + dy * this.r.GW + dx
  }

  /** Unit vector from (x, y) toward the centre of the next cell; zero at the target or off the field. */
  dir(x: number, y: number): { dx: number; dy: number } {
    const j = this.nextCell(this.r.cell(x, y))
    if (j < 0) return { dx: 0, dy: 0 }
    const [cx, cy] = this.r.xy(j)
    const dx = cx - x, dy = cy - y
    const l = Math.hypot(dx, dy) || 1
    return { dx: dx / l, dy: dy / l }
  }

  /** Distance to the target in px along the field; Infinity where unreachable. */
  dist(x: number, y: number): number {
    const i = this.r.cell(x, y)
    return i < 0 ? Infinity : this.d[i]
  }
}

/** A field under construction. */
interface Job {
  target: FieldTarget
  version: number
  d: Float32Array
  step: Int8Array
  heap: Heap
}

export interface NavOpts {
  /** the 'hall' field's target */
  hall: { x: number; y: number }
  /** rebuild budget per tick, ms */
  sliceMs?: number
  /** ally path queue budget per tick, ms */
  pathMs?: number
  /** clock for slicing; defaults to performance.now */
  now?: () => number
}

export interface NavStats {
  version: number
  /** fields cached, and fields rebuilding */
  fields: number
  building: number
  /** rebuild work done in the last tick, and the worst tick so far (ms) */
  frameMs: number
  worstFrameMs: number
  /** full rebuilds finished, and the wall time the last one took across its slices */
  rebuilds: number
  lastBuildMs: number
  /** the ally path queue and cache (S06) */
  paths: PathStats
}

export class NavGrid {
  /** Bumped whenever blockers or seals change; fields built for an older version are stale. */
  version = 0
  readonly sliceMs: number

  private readonly blockN: Uint8Array
  private readonly blockers = new Map<string, number[]>()
  /** 1 per crossing index while it is sealed */
  private readonly sealedX: Uint8Array
  private readonly crossingIdx = new Map<string, number>()
  private readonly fields = new Map<FieldTarget, FlowField>()
  private readonly jobs = new Map<FieldTarget, Job>()
  private readonly jobStart = new Map<FieldTarget, number>()
  private readonly now: () => number
  private readonly hallCell: number
  private st = { frameMs: 0, worstFrameMs: 0, rebuilds: 0, lastBuildMs: 0 }
  /** A* for allies (S06) */
  readonly paths: PathFinder

  constructor(readonly r: WorldRaster, opts: NavOpts) {
    this.sliceMs = opts.sliceMs ?? 6
    this.now = opts.now ?? (() => performance.now())
    this.blockN = new Uint8Array(r.N)
    const crossings = r.bp.FEATURES.crossings
    this.sealedX = new Uint8Array(crossings.length)
    crossings.forEach((c, k) => {
      this.crossingIdx.set(c.id, k)
      if (c.sealedUntil) this.sealedX[k] = 1
    })
    this.hallCell = this.nearestPassable(opts.hall.x, opts.hall.y)
    this.paths = new PathFinder(this, { wallCost: WALL_COST, sliceMs: opts.pathMs ?? 2, now: this.now })
  }

  // ---- cells -------------------------------------------------------------

  /** Terrain lets a walker stand here (land, and not a sealed crossing's water). */
  passable(i: number): boolean {
    const r = this.r
    if (i < 0 || r.terrain[i] !== T.LAND) return false
    const k = r.crossing[i]
    return !(k >= 0 && this.sealedX[k] && r.under[i] !== T.LAND)
  }

  passableAt(x: number, y: number): boolean {
    return this.passable(this.r.cell(x, y))
  }

  /** A built wall covers this cell. */
  blocked(i: number): boolean {
    return i >= 0 && this.blockN[i] > 0
  }

  blockedAt(x: number, y: number): boolean {
    return this.blocked(this.r.cell(x, y))
  }

  /** Movement multiplier here: a ford's `slow` while in its water, else 1. */
  speedAt(x: number, y: number): number {
    const i = this.r.cell(x, y)
    return i < 0 ? 1 : 1 / this.r.slowCost(i)
  }

  /** A road runs over this cell. */
  onRoad(x: number, y: number): boolean {
    const i = this.r.cell(x, y)
    return i >= 0 && this.r.road[i] === 1
  }

  /** `speedAt` with the road bonus: for the hero, soldiers and workers only. Enemies never use roads. */
  allySpeedAt(x: number, y: number): number {
    return this.speedAt(x, y) * (this.onRoad(x, y) ? ROAD_SPEED : 1)
  }

  /** The cell at (x, y) if passable, else the nearest passable one in rings out to 8 cells; -1 if none. */
  nearestPassable(x: number, y: number): number {
    const r = this.r
    const c = r.cell(x, y)
    if (this.passable(c)) return c
    let best = -1, bd = Infinity
    for (let rad = 1; rad <= 8 && best < 0; rad++) {
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
        const j = r.cell(x + dx * r.C, y + dy * r.C)
        if (!this.passable(j)) continue
        const [cx, cy] = r.xy(j)
        const d = (cx - x) ** 2 + (cy - y) ** 2
        if (d < bd) { bd = d; best = j }
      }
    }
    return best
  }

  // ---- blockers and seals -------------------------------------------------

  /** Mark (or clear) the cells whose centre lies within `radius` of (x, y) as a wall. */
  setBlocker(id: string, x: number, y: number, radius: number, on: boolean): void {
    const had = this.blockers.get(id)
    if (had) {
      for (const i of had) this.blockN[i]--
      this.blockers.delete(id)
    }
    if (on) {
      const r = this.r, cells: number[] = []
      const k = Math.ceil(radius / r.C) + 1
      const gx = Math.floor(x / r.C), gy = Math.floor(y / r.C)
      for (let yy = gy - k; yy <= gy + k; yy++) for (let xx = gx - k; xx <= gx + k; xx++) {
        if (xx < 0 || yy < 0 || xx >= r.GW || yy >= r.GH) continue
        const cx = xx * r.C + r.C / 2, cy = yy * r.C + r.C / 2
        if ((cx - x) ** 2 + (cy - y) ** 2 > radius * radius) continue
        const i = yy * r.GW + xx
        if (this.blockN[i] < 255) { this.blockN[i]++; cells.push(i) }
      }
      this.blockers.set(id, cells)
    }
    if (had || on) this.version++
  }

  /** Open or close a crossing with `sealedUntil` (the causeway). */
  setSealed(crossingId: string, sealed: boolean): void {
    const k = this.crossingIdx.get(crossingId)
    if (k === undefined || !!this.sealedX[k] === sealed) return
    this.sealedX[k] = sealed ? 1 : 0
    this.version++
  }

  isSealed(crossingId: string): boolean {
    const k = this.crossingIdx.get(crossingId)
    return k !== undefined && !!this.sealedX[k]
  }

  // ---- collision ------------------------------------------------------------

  /** The walker's centre and four points on its circle all stand on passable cells. */
  clearAt(x: number, y: number, radius: number): boolean {
    return this.passableAt(x, y)
      && this.passableAt(x + radius, y) && this.passableAt(x - radius, y)
      && this.passableAt(x, y + radius) && this.passableAt(x, y - radius)
  }

  /**
   * Collision for any walker: move by (dx, dy) unless that enters impassable
   * ground, else try the x and y parts alone, which slides along the edge.
   * Long moves go in steps under a third of a cell so nothing tunnels through
   * a thin cliff. A walker already overlapping the edge may move anywhere its
   * centre stays passable; one whose centre is off the ground is put back on
   * the nearest passable cell.
   */
  slide(x: number, y: number, dx: number, dy: number, radius: number): { x: number; y: number } {
    if (!this.passableAt(x, y)) {
      if (this.passableAt(x + dx, y + dy)) return { x: x + dx, y: y + dy }
      const j = this.nearestPassable(x, y)
      if (j < 0) return { x: x + dx, y: y + dy }
      const [cx, cy] = this.r.xy(j)
      return { x: cx, y: cy }
    }
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (this.r.C / 3)))
    const sx = dx / n, sy = dy / n
    for (let s = 0; s < n; s++) {
      const rad = this.clearAt(x, y, radius) ? radius : 0
      if (this.clearAt(x + sx, y + sy, rad)) { x += sx; y += sy }
      else if (sx && this.clearAt(x + sx, y, rad)) x += sx
      else if (sy && this.clearAt(x, y + sy, rad)) y += sy
      else break
    }
    return { x, y }
  }

  /** Nothing impassable or walled lies on the segment (sampled every quarter cell). */
  lineClear(ax: number, ay: number, bx: number, by: number): boolean {
    const L = Math.hypot(bx - ax, by - ay)
    const n = Math.max(1, Math.ceil(L / (this.r.C / 4)))
    let last = -2
    for (let s = 0; s <= n; s++) {
      const i = this.r.cell(ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n)
      if (i === last) continue
      last = i
      if (!this.passable(i) || this.blockN[i] > 0) return false
    }
    return true
  }

  // ---- ally paths (S06) ---------------------------------------------------------

  /**
   * An A* path now, start to goal inclusive, string-pulled; null past the
   * node cap (walk straight). With `maxLen`, gives up once every path left is
   * longer: a cheap "within reach?" check.
   */
  findPath(ax: number, ay: number, bx: number, by: number, maxLen?: number): Pt[] | null {
    return this.paths.find(ax, ay, bx, by, maxLen)
  }

  /** Queue a path; `tick` works the queue within its budget. Poll `ticket.done`. */
  requestPath(ax: number, ay: number, bx: number, by: number): PathTicket {
    return this.paths.request(ax, ay, bx, by)
  }

  // ---- flow fields ------------------------------------------------------------

  /** Source cells for a target: the hall's cell, or every cell of a crossing. */
  sources(target: FieldTarget): number[] {
    if (target === 'hall') return this.hallCell >= 0 ? [this.hallCell] : []
    const k = this.crossingIdx.get(target.slice(4))
    if (k === undefined) throw new Error(`NavGrid: no crossing for ${target}`)
    const out: number[] = []
    for (let i = 0; i < this.r.N; i++) if (this.r.crossing[i] === k && this.passable(i)) out.push(i)
    return out
  }

  /**
   * The field for a target. The first call builds it at once; after that a
   * stale field keeps serving while its rebuild runs in `tick`.
   */
  field(target: FieldTarget): FlowField {
    const f = this.fields.get(target)
    if (!f) {
      const job = this.startJob(target)
      this.run(job, Infinity)
      return this.fields.get(target) as FlowField
    }
    if (f.version !== this.version && !this.jobs.has(target)) this.jobs.set(target, this.startJob(target))
    return f
  }

  /** True while any field is being rebuilt. */
  get building(): boolean {
    return this.jobs.size > 0
  }

  /** Spend up to `sliceMs` (or `budgetMs`) on pending rebuilds. Call once per frame. */
  tick(budgetMs = this.sliceMs): void {
    this.paths.tick(budgetMs === Infinity ? Infinity : undefined)
    if (!this.jobs.size) { this.st.frameMs = 0; return }
    const t0 = this.now()
    // the clock is read every 64 pops, and a browser clock is coarse: stop a little short
    const deadline = t0 + budgetMs - 0.4
    for (const [target, job] of this.jobs) {
      if (job.version !== this.version) {
        const fresh = this.startJob(target)
        this.jobs.set(target, fresh)
        if (!this.run(fresh, deadline)) break
      } else if (!this.run(job, deadline)) break
    }
    const ms = this.now() - t0
    this.st.frameMs = ms
    this.st.worstFrameMs = Math.max(this.st.worstFrameMs, ms)
  }

  /** Run every pending rebuild to the end (tests, loads). */
  flush(): void {
    while (this.jobs.size) this.tick(Infinity)
    this.paths.flush()
  }

  stats(): NavStats {
    return { version: this.version, fields: this.fields.size, building: this.jobs.size, ...this.st, paths: this.paths.stats() }
  }

  private startJob(target: FieldTarget): Job {
    const d = new Float32Array(this.r.N).fill(Infinity)
    const step = new Int8Array(this.r.N).fill(-1)
    const heap = new Heap()
    for (const s of this.sources(target)) { d[s] = 0; heap.push(s, 0) }
    this.jobStart.set(target, this.now())
    return { target, version: this.version, d, step, heap }
  }

  /** Advance a job until done (true, and the field installed) or past the deadline (false). */
  private run(job: Job, deadline: number): boolean {
    const r = this.r, { GW, GH, C } = r, { d, step, heap } = job
    const blockN = this.blockN
    let n = 0
    while (heap.size) {
      if ((++n & 63) === 0 && this.now() > deadline) return false
      heap.pop()
      const i = heap.top, di = heap.topV
      if (di > d[i]) continue
      const gx = i % GW, gy = (i - gx) / GW
      for (let k = 0; k < 8; k++) {
        const [dx, dy, len] = NB8[k]
        const nx = gx + dx, ny = gy + dy
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue
        const j = ny * GW + nx
        if (!this.passable(j)) continue
        if (dx && dy) {
          // no corner cutting past cliffs, water or a wall's edge
          const a = gy * GW + nx, b = ny * GW + gx
          if (!this.passable(a) || !this.passable(b) || blockN[a] || blockN[b]) continue
        }
        const nd = di + len * C * r.slowCost(j) * (blockN[j] ? WALL_COST : 1)
        if (nd < d[j]) { d[j] = nd; step[j] = OPP[k]; heap.push(j, nd) }
      }
    }
    this.fields.set(job.target, new FlowField(r, d, step, job.version))
    this.jobs.delete(job.target)
    this.st.rebuilds++
    this.st.lastBuildMs = this.now() - (this.jobStart.get(job.target) ?? this.now())
    return true
  }
}
