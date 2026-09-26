/**
 * World v2 pathing over the raster: an 8-way Dijkstra flow field with no
 * corner cutting, a walk downhill along it, and the nearest walkable cell.
 * Pure TypeScript, no Phaser. The lint tool routes night approaches with
 * these; the game's NavGrid builds on them (S05).
 */
import type { WorldRaster } from './raster'

export interface FlowOpts {
  /** treat sealedUntil crossings as still closed */
  sealed?: boolean
  /** per-cell step cost multiplier; defaults to the raster's slowCost (fords) */
  cost?: (i: number) => number
}

/** 8 neighbours as [dx, dy, step length in cells]; the 4 orthogonal ones first. */
export const NB8: readonly (readonly [number, number, number])[] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
]

/** Binary min-heap of (cell, distance) pairs. */
class Heap {
  private k: number[] = []
  private v: number[] = []
  get size(): number { return this.k.length }
  push(key: number, val: number): void {
    const { k, v } = this
    let i = k.length
    k.push(key); v.push(val)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (v[p] <= val) break
      k[i] = k[p]; v[i] = v[p]; i = p
    }
    k[i] = key; v[i] = val
  }
  pop(): [number, number] {
    const { k, v } = this
    const topK = k[0], topV = v[0]
    const lk = k.pop() as number, lv = v.pop() as number
    if (k.length) {
      let i = 0
      for (;;) {
        const l = 2 * i + 1, rr = l + 1
        let m = i, mv = lv
        if (l < k.length && v[l] < mv) { m = l; mv = v[l] }
        if (rr < k.length && v[rr] < mv) { m = rr; mv = v[rr] }
        if (m === i) break
        k[i] = k[m]; v[i] = v[m]; i = m
      }
      k[i] = lk; v[i] = lv
    }
    return [topK, topV]
  }
}

/** The neighbour of cell i at (dx, dy) if it can be stepped to, else -1. Diagonals may not cut a blocked corner. */
export function step(r: WorldRaster, i: number, dx: number, dy: number, sealed = false): number {
  const gx = i % r.GW, gy = Math.floor(i / r.GW)
  const nx = gx + dx, ny = gy + dy
  if (nx < 0 || ny < 0 || nx >= r.GW || ny >= r.GH) return -1
  const j = ny * r.GW + nx
  if (!r.passable(j, sealed)) return -1
  if (dx && dy && (!r.passable(gy * r.GW + nx, sealed) || !r.passable(ny * r.GW + gx, sealed))) return -1
  return j
}

/** Distance in px from every cell to the nearest source; Infinity where unreachable. */
export function flowField(r: WorldRaster, sources: readonly number[], { sealed = false, cost }: FlowOpts = {}): Float64Array {
  const costOf = cost ?? r.slowCost
  const d = new Float64Array(r.N).fill(Infinity)
  const h = new Heap()
  for (const s of sources) if (s >= 0) { d[s] = 0; h.push(s, 0) }
  while (h.size) {
    const [i, di] = h.pop()
    if (di > d[i]) continue
    for (const [dx, dy, c] of NB8) {
      const j = step(r, i, dx, dy, sealed)
      if (j < 0) continue
      const nd = di + c * r.C * costOf(j)
      if (nd < d[j]) { d[j] = nd; h.push(j, nd) }
    }
  }
  return d
}

/** Walk strictly downhill from `from` until a source (field 0) or a dead end; the cells visited, `from` first. */
export function descend(r: WorldRaster, field: Float64Array, from: number, { sealed = false }: Pick<FlowOpts, 'sealed'> = {}): number[] {
  const path = [from]
  let i = from
  for (let guard = 0; guard < 20000 && field[i] > 0; guard++) {
    let best = -1, bv = field[i]
    for (const [dx, dy] of NB8) {
      const j = step(r, i, dx, dy, sealed)
      if (j >= 0 && field[j] < bv) { bv = field[j]; best = j }
    }
    if (best < 0) break
    path.push(best)
    i = best
  }
  return path
}

/** The cell at (x, y) if passable, else the nearest passable cell in rings out to 8 cells; -1 if none. */
export function nearestPassable(r: WorldRaster, x: number, y: number, { sealed = false }: Pick<FlowOpts, 'sealed'> = {}): number {
  const c = r.cell(x, y)
  if (r.passable(c, sealed)) return c
  for (let rad = 1; rad <= 8; rad++) {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
      const j = r.cell(x + dx * r.C, y + dy * r.C)
      if (r.passable(j, sealed)) return j
    }
  }
  return -1
}
