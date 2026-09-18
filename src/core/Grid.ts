import type { GridItem } from './types'

/**
 * Uniform spatial hash. Rebuilt once per frame in O(n), then all proximity
 * queries (targeting, separation, splash, pickup magnetism) are local.
 * This is what lets several hundred enemies run without O(n^2) blowup.
 */
export class Grid<T extends GridItem> {
  private cells = new Map<number, T[]>()
  private readonly inv: number
  readonly cellSize: number

  constructor(cell: number) {
    this.cellSize = cell
    this.inv = 1 / cell
  }

  private key(cx: number, cy: number) {
    // 16-bit pack, offset so negatives behave
    return ((cx + 2048) << 12) | (cy + 2048)
  }

  clear() {
    for (const arr of this.cells.values()) arr.length = 0
  }

  insert(item: T) {
    const cx = Math.floor(item.x * this.inv)
    const cy = Math.floor(item.y * this.inv)
    const k = this.key(cx, cy)
    let arr = this.cells.get(k)
    if (!arr) { arr = []; this.cells.set(k, arr) }
    arr.push(item)
  }

  /** Collect items whose cell overlaps the circle. Filtered by exact distance. */
  query(x: number, y: number, radius: number, out: T[]): T[] {
    out.length = 0
    const minX = Math.floor((x - radius) * this.inv)
    const maxX = Math.floor((x + radius) * this.inv)
    const minY = Math.floor((y - radius) * this.inv)
    const maxY = Math.floor((y + radius) * this.inv)
    const r2 = radius * radius
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const arr = this.cells.get(this.key(cx, cy))
        if (!arr) continue
        for (let i = 0; i < arr.length; i++) {
          const it = arr[i]
          if (!it.alive) continue
          const dx = it.x - x, dy = it.y - y
          if (dx * dx + dy * dy <= r2) out.push(it)
        }
      }
    }
    return out
  }

  /** Nearest live item within radius, or null. */
  nearest(x: number, y: number, radius: number, filter?: (t: T) => boolean): T | null {
    const minX = Math.floor((x - radius) * this.inv)
    const maxX = Math.floor((x + radius) * this.inv)
    const minY = Math.floor((y - radius) * this.inv)
    const maxY = Math.floor((y + radius) * this.inv)
    let best: T | null = null
    let bestD = radius * radius
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const arr = this.cells.get(this.key(cx, cy))
        if (!arr) continue
        for (let i = 0; i < arr.length; i++) {
          const it = arr[i]
          if (!it.alive) continue
          if (filter && !filter(it)) continue
          const dx = it.x - x, dy = it.y - y
          const d = dx * dx + dy * dy
          if (d < bestD) { bestD = d; best = it }
        }
      }
    }
    return best
  }
}
