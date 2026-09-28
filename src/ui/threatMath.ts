import type { NightLog } from '../core/Events'
import { RESOURCE_ORDER } from '../core/types'
import { short } from '../core/math'

/**
 * The pure half of the night awareness (R6): where the horde is bunched,
 * where a chevron meets the edge of the screen, and what the dawn card says.
 * No Phaser here, so the tests can load it.
 */

export interface Cluster { x: number; y: number; n: number }

/**
 * Walkers binned into a coarse grid, then the fullest cells kept. Two cells
 * whose means lie within one cell of each other are one horde (a front
 * straddling a line is still one front), the smaller folded into the larger.
 * Everything is pooled: `begin`, `add` per walker, `finish` for the top few.
 */
export class Clusterer {
  /** the result of the last `finish`, fullest first */
  readonly top: Cluster[] = []
  private cells = new Map<number, Cluster>()
  private pool: Cluster[] = []
  private used = 0
  private all: Cluster[] = []

  constructor(readonly cell = 600, readonly max = 4) {}

  begin() {
    this.cells.clear()
    this.used = 0
    this.top.length = 0
  }

  add(x: number, y: number) {
    const k = Math.floor(x / this.cell) * 65536 + Math.floor(y / this.cell)
    let c = this.cells.get(k)
    if (!c) {
      c = this.pool[this.used] ?? (this.pool[this.used] = { x: 0, y: 0, n: 0 })
      this.used++
      c.x = 0; c.y = 0; c.n = 0
      this.cells.set(k, c)
    }
    c.x += x; c.y += y; c.n++
  }

  finish(): Cluster[] {
    const all = this.all
    all.length = 0
    for (const c of this.cells.values()) {
      c.x /= c.n; c.y /= c.n
      all.push(c)
    }
    all.sort(byCount)
    const r2 = this.cell * this.cell
    const top = this.top
    for (const c of all) {
      let into: Cluster | null = null
      for (const k of top) {
        const dx = k.x - c.x, dy = k.y - c.y
        if (dx * dx + dy * dy < r2) { into = k; break }
      }
      if (into) {
        const n = into.n + c.n
        into.x = (into.x * into.n + c.x * c.n) / n
        into.y = (into.y * into.n + c.y * c.n) / n
        into.n = n
      } else top.push(c)
    }
    top.sort(byCount)
    if (top.length > this.max) top.length = this.max
    return top
  }
}

const byCount = (a: Cluster, b: Cluster) => b.n - a.n

/**
 * Where a ray from (cx, cy) along angle `ang` leaves the frame
 * [left, top, right, bottom]: the point a chevron stands on. The centre must
 * lie inside the frame. Writes into `out` and returns it.
 */
export function edgePoint(
  cx: number, cy: number, ang: number,
  left: number, top: number, right: number, bottom: number,
  out: { x: number; y: number },
) {
  const c = Math.cos(ang), s = Math.sin(ang)
  let t = Infinity
  if (c > 1e-6) t = Math.min(t, (right - cx) / c)
  else if (c < -1e-6) t = Math.min(t, (left - cx) / c)
  if (s > 1e-6) t = Math.min(t, (bottom - cy) / s)
  else if (s < -1e-6) t = Math.min(t, (top - cy) / s)
  if (!Number.isFinite(t)) t = 0
  t = Math.max(0, t)
  out.x = cx + c * t
  out.y = cy + s * t
  return out
}

/** Between the parts of a dawn card line. */
export const SEP = ' · '

/**
 * The dawn card's words (`night:summary`), as two groups of parts: the
 * night's tally, then what the sweep brought in and what is mending. Empty
 * parts are left out, so a quiet night is one short line. The card packs
 * each group into as many lines as its width needs (`packParts`).
 */
export function dawnParts(log: NightLog): [string[], string[]] {
  const head = [`Night ${log.wave} held`]
  if (log.kills > 0) head.push(`${short(log.kills)} slain`)
  if (log.coins > 0) head.push(`+${short(Math.round(log.coins))} coins`)
  const tail: string[] = []
  const goods = RESOURCE_ORDER
    .filter(k => k !== 'coins' && Math.round(log.swept[k] ?? 0) > 0)
    .sort((a, b) => (log.swept[b] ?? 0) - (log.swept[a] ?? 0))
    .slice(0, 3)
    .map(k => `${short(Math.round(log.swept[k] ?? 0))} ${k}`)
  if (goods.length) tail.push(`swept ${goods.join(', ')}`)
  if (log.sacked > 0) tail.push(`${log.sacked} sacked, mending`)
  return [head, tail]
}

/**
 * Parts joined by SEP into lines no wider than `maxW` (by `measure`), greedily,
 * breaking only between parts. A part wider than `maxW` gets a line to itself.
 */
export function packParts(parts: string[], measure: (s: string) => number, maxW: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const p of parts) {
    const cand = cur ? cur + SEP + p : p
    if (!cur || measure(cand) <= maxW) cur = cand
    else { out.push(cur); cur = p }
  }
  if (cur) out.push(cur)
  return out
}
