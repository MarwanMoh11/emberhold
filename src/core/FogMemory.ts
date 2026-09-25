/** Digits for the run lengths: base64url, so a save stays plain ASCII. */
const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const DIGIT_VALUE = new Int8Array(128).fill(-1)
for (let i = 0; i < DIGITS.length; i++) DIGIT_VALUE[DIGITS.charCodeAt(i)] = i

/** Whole cells covering a `width` × `height` world. */
const cellCount = (width: number, height: number, cell: number) =>
  Math.ceil(width / cell) * Math.ceil(height / cell)

/** Unpadded base64 length of `bytes` bytes. */
const b64Length = (bytes: number) => Math.ceil(bytes * 4 / 3)

/**
 * A compact record of where the fog brush has touched the world: one bit per
 * `cell`-px square, row-major, sized from the world it covers.
 *
 * `toJSON` writes whichever of two forms is shorter:
 * - `b:` + the bitset in unpadded base64. Its length is fixed by the world,
 *   so it is the ceiling `maxEncodedLength` promises.
 * - `r:` + run lengths over the cells, alternating unexplored and explored
 *   from cell 0 (so the first run may be empty). Each is a little-endian
 *   varint of base64url digits: five bits of value, the sixth set on every
 *   digit but the last. Explored ground is a few broad blobs, so a save made
 *   in play is usually this form and a fraction of the bitset.
 *
 * A bare base64 string with no prefix is the v1 bitset; `load` still reads it
 * while the old map is live (S19 drops it).
 */
export class FogMemory {
  readonly cols: number
  readonly rows: number
  private readonly bits: Uint8Array

  constructor(private readonly width: number, private readonly height: number, private readonly cell = 64) {
    this.cols = Math.ceil(width / cell)
    this.rows = Math.ceil(height / cell)
    this.bits = new Uint8Array(Math.ceil(this.cols * this.rows / 8))
  }

  /** The longest string `toJSON` can return for a world this size: the bitset form. */
  static maxEncodedLength(width: number, height: number, cell = 64) {
    return 2 + b64Length(Math.ceil(cellCount(width, height, cell) / 8))
  }

  /** A fresh memory holding `encoded`; empty if it is malformed or from another world size. */
  static fromJSON(encoded: string, width: number, height: number, cell = 64) {
    const memory = new FogMemory(width, height, cell)
    memory.load(encoded)
    return memory
  }

  mark(x: number, y: number) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return
    const cx = Math.floor(x / this.cell)
    const cy = Math.floor(y / this.cell)
    const i = cy * this.cols + cx
    this.bits[i >> 3] |= 1 << (i & 7)
  }

  /** True when any marked cell's centre lies within `r` of (x, y). */
  anyWithin(x: number, y: number, r: number): boolean {
    const c = this.cell
    const x0 = Math.max(0, Math.floor((x - r) / c)), x1 = Math.min(this.cols - 1, Math.floor((x + r) / c))
    const y0 = Math.max(0, Math.floor((y - r) / c)), y1 = Math.min(this.rows - 1, Math.floor((y + r) / c))
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * this.cols + cx
        if (!(this.bits[i >> 3] & (1 << (i & 7)))) continue
        if (Math.hypot((cx + 0.5) * c - x, (cy + 0.5) * c - y) <= r) return true
      }
    }
    return false
  }

  forEachMarked(fn: (x: number, y: number) => void) {
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const i = cy * this.cols + cx
        if (this.bits[i >> 3] & (1 << (i & 7))) {
          fn(Math.min(this.width - 1, (cx + 0.5) * this.cell),
            Math.min(this.height - 1, (cy + 0.5) * this.cell))
        }
      }
    }
  }

  toJSON(): string {
    const bitset = 'b:' + this.bitsetBase64()
    return this.runLengths(bitset.length) ?? bitset
  }

  /** A malformed or older map cannot damage the save; retain the known area. */
  load(encoded: string) {
    const bits = this.decode(encoded)
    if (!bits) return
    for (let i = 0; i < bits.length; i++) this.bits[i] |= bits[i]
  }

  private bitsetBase64() {
    let bytes = ''
    for (const b of this.bits) bytes += String.fromCharCode(b)
    return btoa(bytes).replace(/=+$/, '')
  }

  /** The `r:` form, or null once it would be no shorter than `limit`. */
  private runLengths(limit: number): string | null {
    const n = this.cols * this.rows
    let out = 'r:'
    let want = 0
    let run = 0
    const flush = () => {
      let v = run
      while (v >= 32) { out += DIGITS[32 | (v & 31)]; v >>>= 5 }
      out += DIGITS[v]
    }
    for (let i = 0; i < n; i++) {
      const bit = (this.bits[i >> 3] >> (i & 7)) & 1
      if (bit === want) { run++; continue }
      flush()
      if (out.length >= limit) return null
      want = bit
      run = 1
    }
    flush()
    return out.length < limit ? out : null
  }

  private decode(encoded: string): Uint8Array | null {
    if (typeof encoded !== 'string') return null
    try {
      if (encoded.startsWith('r:')) return this.decodeRuns(encoded)
      // `b:` is the bitset; a bare string is the v1 bitset (padded, same bytes)
      const raw = atob(encoded.startsWith('b:') ? encoded.slice(2) : encoded)
      if (raw.length !== this.bits.length) return null
      const bits = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) bits[i] = raw.charCodeAt(i)
      return bits
    } catch {
      return null
    }
  }

  /** Runs must cover every cell exactly, or the string is from somewhere else. */
  private decodeRuns(encoded: string): Uint8Array | null {
    const n = this.cols * this.rows
    const bits = new Uint8Array(this.bits.length)
    let at = 0
    let set = false
    let run = 0
    let shift = 0
    for (let k = 2; k < encoded.length; k++) {
      const code = encoded.charCodeAt(k)
      const d = code < 128 ? DIGIT_VALUE[code] : -1
      if (d < 0 || shift > 25) return null
      run += (d & 31) * 2 ** shift
      if (d & 32) { shift += 5; continue }
      if (at + run > n) return null
      if (set) for (let i = at; i < at + run; i++) bits[i >> 3] |= 1 << (i & 7)
      at += run
      set = !set
      run = 0
      shift = 0
    }
    return at === n && shift === 0 ? bits : null
  }
}
