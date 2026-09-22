/** A compact record of where the fog brush has touched the world. */
export class FogMemory {
  private readonly cols: number
  private readonly rows: number
  private readonly bits: Uint8Array

  constructor(private readonly width: number, private readonly height: number, private readonly cell = 64) {
    this.cols = Math.ceil(width / cell)
    this.rows = Math.ceil(height / cell)
    this.bits = new Uint8Array(Math.ceil(this.cols * this.rows / 8))
  }

  mark(x: number, y: number) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return
    const cx = Math.floor(x / this.cell)
    const cy = Math.floor(y / this.cell)
    const i = cy * this.cols + cx
    this.bits[i >> 3] |= 1 << (i & 7)
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
    let bytes = ''
    for (const b of this.bits) bytes += String.fromCharCode(b)
    return btoa(bytes)
  }

  /** A malformed or older map cannot damage the save; retain the known area. */
  load(encoded: string) {
    try {
      const raw = atob(encoded)
      if (raw.length !== this.bits.length) return
      for (let i = 0; i < raw.length; i++) this.bits[i] |= raw.charCodeAt(i)
    } catch { /* ignore corrupt exploration data */ }
  }
}
