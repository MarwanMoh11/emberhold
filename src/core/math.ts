export const TAU = Math.PI * 2

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay
  return dx * dx + dy * dy
}
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt(dist2(ax, ay, bx, by))

/** Deterministic-ish fast rng so debug repro is possible if we ever need it. */
let seed = 1337
export const srand = (s: number) => { seed = s >>> 0 }
export const rnd = () => {
  seed ^= seed << 13; seed >>>= 0
  seed ^= seed >> 17
  seed ^= seed << 5; seed >>>= 0
  return seed / 4294967296
}
export const rr = (lo: number, hi: number) => lo + rnd() * (hi - lo)
export const ri = (lo: number, hi: number) => Math.floor(rr(lo, hi + 1))
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length) % arr.length]
export const chance = (p: number) => rnd() < p

export const shuffled = <T>(arr: readonly T[]): T[] => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Short human number: 1200 -> 1.2k */
export const short = (n: number): string => {
  const a = Math.abs(n)
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'
  return Math.floor(n).toString()
}

export const approach = (cur: number, target: number, maxDelta: number) => {
  if (cur < target) return Math.min(cur + maxDelta, target)
  return Math.max(cur - maxDelta, target)
}
