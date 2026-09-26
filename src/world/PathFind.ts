/**
 * A* for allies (S06): workers and soldiers walking to a point.
 *
 * Enemies read the flow fields; allies each want their own destination, so
 * they search. The search is 8-way over the NavGrid's cells with an octile
 * heuristic and the fields' rules (no corner cutting past cliffs, water or a
 * wall's edge; fords cost their `slow`; walls cost WALL_COST, so a gate is
 * preferred but a sealed ring is still crossable). The cell path is then
 * string-pulled: the waypoints kept are the corners a walker of `clearance`
 * px cannot see past, so a path over open ground is one straight leg.
 *
 * Results sit in an LRU keyed by the coarse (4 × 4 cell) start and goal, so a
 * squad or a worker's repeat trip reuses a path; a hit is checked from the
 * caller's own ends before it is trusted. The cache empties when the grid's
 * version changes. A search past `nodeCap` expansions gives up (null): the
 * caller walks straight.
 *
 * `find` searches at once (tests, a worker's short node check); `request`
 * queues, and `tick` spends at most `sliceMs` a frame on the queue.
 */
import { NB8 } from './flow'
import { Heap } from './heap'
import type { WorldRaster } from './raster'

export type Pt = [number, number]

/** What the finder needs from the NavGrid. */
export interface PathGrid {
  readonly r: WorldRaster
  readonly version: number
  passable(i: number): boolean
  blocked(i: number): boolean
  nearestPassable(x: number, y: number): number
}

export interface PathTicket {
  done: boolean
  /** start to goal inclusive; null when there is no path within the node cap (walk straight) */
  path: Pt[] | null
}

export interface PathOpts {
  wallCost: number
  /** LRU entries */
  cache?: number
  /** expansions before a search gives up */
  nodeCap?: number
  /** queue budget per tick, ms */
  sliceMs?: number
  /** the widest walker's collision radius: pulled legs keep this far off impassable ground */
  clearance?: number
  maxQueue?: number
  now?: () => number
}

export interface PathStats {
  searches: number
  cacheHits: number
  /** searches that ran out of nodes or found nothing */
  failed: number
  /** requests waiting, including the one in progress */
  queued: number
  /** queue work in the last tick, and the worst tick */
  frameMs: number
  worstFrameMs: number
  /** CPU time of the last and the dearest single search (all its slices), and the cells it expanded */
  lastMs: number
  worstMs: number
  lastExpanded: number
}

const MORE = 0, FOUND = 1, FAIL = 2
const SQ2m1 = Math.SQRT2 - 1

/** One search's scratch: generation-stamped so nothing is cleared between searches. */
class Search {
  readonly g: Float32Array
  readonly parent: Int32Array
  readonly seen: Uint32Array
  readonly closed: Uint32Array
  readonly heap = new Heap()
  gen = 0
  s = -1
  t = -1
  tx = 0
  ty = 0
  maxCost = Infinity
  expanded = 0
  cpu = 0
  constructor(N: number) {
    this.g = new Float32Array(N)
    this.parent = new Int32Array(N)
    this.seen = new Uint32Array(N)
    this.closed = new Uint32Array(N)
  }
}

interface Job {
  a: Pt
  b: Pt
  key: number
  ticket: PathTicket
}

export class PathFinder {
  readonly nodeCap: number
  readonly sliceMs: number
  readonly clearance: number
  private readonly wallCost: number
  private readonly cacheMax: number
  private readonly maxQueue: number
  private readonly now: () => number
  private readonly lru = new Map<number, Pt[] | null>()
  private cacheVersion = -1
  private readonly queue: Job[] = []
  private readonly pending = new Map<number, Job>()
  private active: Job | null = null
  private readonly bg: Search
  private readonly fg: Search
  private readonly BW: number
  private readonly BN: number
  private st = { searches: 0, cacheHits: 0, failed: 0, frameMs: 0, worstFrameMs: 0, lastMs: 0, worstMs: 0, lastExpanded: 0 }

  constructor(private readonly nav: PathGrid, opts: PathOpts) {
    this.wallCost = opts.wallCost
    this.cacheMax = opts.cache ?? 256
    this.nodeCap = opts.nodeCap ?? 20000
    this.sliceMs = opts.sliceMs ?? 2
    this.clearance = opts.clearance ?? 12
    this.maxQueue = opts.maxQueue ?? 64
    this.now = opts.now ?? (() => performance.now())
    const { N, GW, GH } = nav.r
    this.bg = new Search(N)
    this.fg = new Search(N)
    this.BW = Math.ceil(GW / 4)
    this.BN = this.BW * Math.ceil(GH / 4)
  }

  /**
   * A path now, from the cache or a fresh search. With `maxLen`, the search
   * stops once every path left would be longer (a cheap "is it within
   * reach?"), and a miss is not remembered.
   */
  find(ax: number, ay: number, bx: number, by: number, maxLen = Infinity): Pt[] | null {
    const ends = this.ends(ax, ay, bx, by)
    if (!ends) return null
    const [a, b, s, t, key] = ends
    const hit = this.fromCache(key, a, b)
    if (hit !== undefined) return hit
    const S = this.fg
    // 8-way steps run up to 8% over the pulled length
    this.begin(S, s, t, maxLen * 1.1)
    const res = this.run(S, Infinity)
    return this.settle(S, res, a, b, key, maxLen === Infinity)
  }

  /** Queue a search; a cache hit comes back already done. Requests for the same coarse ends share a ticket. */
  request(ax: number, ay: number, bx: number, by: number): PathTicket {
    const ends = this.ends(ax, ay, bx, by)
    if (!ends) return { done: true, path: null }
    const [a, b, , , key] = ends
    const hit = this.fromCache(key, a, b)
    if (hit !== undefined) return { done: true, path: hit }
    const same = this.pending.get(key)
    if (same) return same.ticket
    if (this.pending.size >= this.maxQueue) return { done: true, path: null }
    const job: Job = { a, b, key, ticket: { done: false, path: null } }
    this.queue.push(job)
    this.pending.set(key, job)
    return job.ticket
  }

  /** Spend up to `budgetMs` on queued searches. */
  tick(budgetMs = this.sliceMs): void {
    if (!this.active && !this.queue.length) { this.st.frameMs = 0; return }
    const t0 = this.now()
    // the clock is read every few hundred pops and a search settles past it: stop short (S21 saw 2.1 ms)
    const deadline = t0 + budgetMs - 0.4
    for (;;) {
      if (!this.active) {
        const job = this.queue.shift()
        if (!job) break
        const hit = this.fromCache(job.key, job.a, job.b)
        const s = this.nav.nearestPassable(job.a[0], job.a[1]), t = this.nav.nearestPassable(job.b[0], job.b[1])
        if (hit !== undefined || s < 0 || t < 0) { this.resolve(job, hit ?? null); continue }
        this.active = job
        this.begin(this.bg, s, t, Infinity)
      }
      const job = this.active
      const res = this.run(this.bg, deadline)
      if (res === MORE) break
      this.active = null
      this.resolve(job, this.settle(this.bg, res, job.a, job.b, job.key, true))
      if (this.now() > deadline) break
    }
    const ms = this.now() - t0
    this.st.frameMs = ms
    this.st.worstFrameMs = Math.max(this.st.worstFrameMs, ms)
  }

  /** Run the queue dry (tests). */
  flush(): void {
    while (this.active || this.queue.length) this.tick(Infinity)
  }

  stats(): PathStats {
    return { ...this.st, queued: this.queue.length + (this.active ? 1 : 0) }
  }

  /** A walker of radius `rad` fits along the segment: its centre and four axis points stay on passable ground, its centre off walls. */
  segClear(ax: number, ay: number, bx: number, by: number, rad: number): boolean {
    const nav = this.nav, r = nav.r
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (r.C / 4)))
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n
      const i = r.cell(x, y)
      if (!nav.passable(i) || nav.blocked(i)) return false
      if (rad && !(nav.passable(r.cell(x + rad, y)) && nav.passable(r.cell(x - rad, y))
        && nav.passable(r.cell(x, y + rad)) && nav.passable(r.cell(x, y - rad)))) return false
    }
    return true
  }

  // ---- internals --------------------------------------------------------------

  /** Snap both ends onto passable ground; null if either has none nearby. */
  private ends(ax: number, ay: number, bx: number, by: number): [Pt, Pt, number, number, number] | null {
    const nav = this.nav, r = nav.r
    const s = nav.nearestPassable(ax, ay), t = nav.nearestPassable(bx, by)
    if (s < 0 || t < 0) return null
    const a: Pt = r.cell(ax, ay) === s ? [ax, ay] : r.xy(s)
    const b: Pt = r.cell(bx, by) === t ? [bx, by] : r.xy(t)
    return [a, b, s, t, this.block(s) * this.BN + this.block(t)]
  }

  private block(i: number): number {
    const GW = this.nav.r.GW, gx = i % GW
    return ((i - gx) / GW >> 2) * this.BW + (gx >> 2)
  }

  /** A cached path re-ended at (a, b) if both new end legs are clear; null for a remembered failure; undefined on a miss. */
  private fromCache(key: number, a: Pt, b: Pt): Pt[] | null | undefined {
    if (this.cacheVersion !== this.nav.version) { this.lru.clear(); this.cacheVersion = this.nav.version }
    if (!this.lru.has(key)) return undefined
    const p = this.lru.get(key) as Pt[] | null
    if (p) {
      const n = p.length
      if (n === 2 ? !this.segClear(a[0], a[1], b[0], b[1], 0)
        : !this.segClear(a[0], a[1], p[1][0], p[1][1], 0) || !this.segClear(p[n - 2][0], p[n - 2][1], b[0], b[1], 0)) return undefined
    }
    this.lru.delete(key)
    this.lru.set(key, p)
    this.st.cacheHits++
    return p ? [a, ...p.slice(1, -1), b] : null
  }

  private remember(key: number, p: Pt[] | null): void {
    if (this.cacheVersion !== this.nav.version) { this.lru.clear(); this.cacheVersion = this.nav.version }
    this.lru.delete(key)
    this.lru.set(key, p)
    if (this.lru.size > this.cacheMax) this.lru.delete(this.lru.keys().next().value as number)
  }

  private resolve(job: Job, path: Pt[] | null): void {
    this.pending.delete(job.key)
    job.ticket.path = path
    job.ticket.done = true
  }

  private begin(S: Search, s: number, t: number, maxCost: number): void {
    if (++S.gen === 0xffffffff) { S.seen.fill(0); S.closed.fill(0); S.gen = 1 }
    const GW = this.nav.r.GW
    S.s = s; S.t = t
    S.tx = t % GW; S.ty = (t - S.tx) / GW
    S.maxCost = maxCost
    S.expanded = 0
    S.cpu = 0
    S.heap.size = 0
    S.g[s] = 0; S.parent[s] = -1; S.seen[s] = S.gen
    S.heap.push(s, 0)
  }

  /** Expand until found, failed, or past the deadline. */
  private run(S: Search, deadline: number): number {
    const nav = this.nav, r = nav.r, { GW, GH, C } = r
    const { g, parent, seen, closed, heap } = S
    const gen = S.gen, t = S.t, tx = S.tx, ty = S.ty, W = this.wallCost, cap = this.nodeCap
    const t0 = this.now()
    let n = 0, res = FAIL
    while (heap.size) {
      if ((++n & 63) === 0 && this.now() > deadline) { res = MORE; break }
      heap.pop()
      const i = heap.top
      if (closed[i] === gen) continue
      closed[i] = gen
      if (i === t) { res = FOUND; break }
      if (heap.topV > S.maxCost || ++S.expanded > cap) break
      const gi = g[i], gx = i % GW, gy = (i - gx) / GW
      for (let k = 0; k < 8; k++) {
        const [dx, dy, len] = NB8[k]
        const nx = gx + dx, ny = gy + dy
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue
        const j = ny * GW + nx
        if (closed[j] === gen || !nav.passable(j)) continue
        if (dx && dy) {
          const a = gy * GW + nx, b = ny * GW + gx
          if (!nav.passable(a) || !nav.passable(b) || nav.blocked(a) || nav.blocked(b)) continue
        }
        const ng = gi + len * C * r.slowCost(j) * (nav.blocked(j) ? W : 1)
        if (seen[j] !== gen || ng < g[j]) {
          seen[j] = gen; g[j] = ng; parent[j] = i
          const ex = Math.abs(nx - tx), ey = Math.abs(ny - ty)
          // a hair over admissible breaks ties toward the goal
          heap.push(j, ng + C * (ex > ey ? ex + SQ2m1 * ey : ey + SQ2m1 * ex) * 1.001)
        }
      }
    }
    S.cpu += this.now() - t0
    return res
  }

  /** Record a finished search; the pulled path, or null. */
  private settle(S: Search, res: number, a: Pt, b: Pt, key: number, rememberFail: boolean): Pt[] | null {
    const st = this.st
    st.searches++
    st.lastMs = S.cpu
    st.worstMs = Math.max(st.worstMs, S.cpu)
    st.lastExpanded = S.expanded
    if (res !== FOUND) {
      st.failed++
      if (rememberFail) this.remember(key, null)
      return null
    }
    const path = this.pull(S)
    path[0] = a
    path[path.length - 1] = b
    this.remember(key, path)
    return path
  }

  /** The cell chain, cut to its turns, then pulled tight where a walker of `clearance` can see past a turn. */
  private pull(S: Search): Pt[] {
    const r = this.nav.r
    const cells: number[] = []
    for (let i = S.t; i >= 0; i = S.parent[i]) { cells.push(i); if (i === S.s) break }
    cells.reverse()
    if (cells.length < 2) return [r.xy(cells[0]), r.xy(cells[0])]
    const turns = [cells[0]]
    for (let k = 1; k < cells.length - 1; k++) {
      if (cells[k] - cells[k - 1] !== cells[k + 1] - cells[k]) turns.push(cells[k])
    }
    turns.push(cells[cells.length - 1])
    const out: Pt[] = [r.xy(turns[0])]
    let [ax, ay] = out[0]
    for (let k = 1; k < turns.length - 1; k++) {
      const [bx, by] = r.xy(turns[k + 1])
      if (!this.segClear(ax, ay, bx, by, this.clearance)) {
        const p = r.xy(turns[k])
        out.push(p)
        ;[ax, ay] = p
      }
    }
    out.push(r.xy(turns[turns.length - 1]))
    return out
  }
}

/** Length of a path in px. */
export function pathLength(p: readonly Pt[]): number {
  let L = 0
  for (let k = 1; k < p.length; k++) L += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1])
  return L
}
