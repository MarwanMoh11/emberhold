/**
 * Seeded value noise for the painter, sampled from world coordinates alone,
 * so any two rects of the world paint the same pixels where they meet. Pure:
 * no Phaser, no DOM.
 */

export function hash32(ix: number, iy: number, seed: number) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

export function hash(ix: number, iy: number, seed: number) {
  return hash32(ix, iy, seed) / 4294967296
}

export function vnoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed)
  const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

export function fbm(x: number, y: number, seed: number, oct = 4) {
  let v = 0, amp = 0.5, f = 1, norm = 0
  for (let o = 0; o < oct; o++) {
    v += vnoise(x * f, y * f, seed + o * 17) * amp
    norm += amp
    amp *= 0.5
    f *= 2.03
  }
  return v / norm
}

/** A small seeded generator (mulberry32): `next()` in [0, 1). */
export class Mulberry {
  private s: number
  constructor(seed: number) { this.s = seed >>> 0 }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(a: number, b: number) { return a + (b - a) * this.next() }
}

export const smooth = (e0: number, e1: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
