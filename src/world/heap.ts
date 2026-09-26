/** Min-heap of (cell, cost) in typed arrays, shared by the flow fields and A*. */
export class Heap {
  k = new Int32Array(4096)
  v = new Float32Array(4096)
  size = 0
  push(key: number, val: number): void {
    if (this.size === this.k.length) {
      const k = new Int32Array(this.size * 2); k.set(this.k); this.k = k
      const v = new Float32Array(this.size * 2); v.set(this.v); this.v = v
    }
    const { k, v } = this
    let i = this.size++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (v[p] <= val) break
      k[i] = k[p]; v[i] = v[p]; i = p
    }
    k[i] = key; v[i] = val
  }
  /** Pops the top; its key and value are left in `top` / `topV`. */
  top = 0
  topV = 0
  pop(): void {
    const { k, v } = this
    this.top = k[0]; this.topV = v[0]
    const n = --this.size
    if (!n) return
    const lk = k[n], lv = v[n]
    let i = 0
    for (;;) {
      const l = 2 * i + 1, rr = l + 1
      let m = i, mv = lv
      if (l < n && v[l] < mv) { m = l; mv = v[l] }
      if (rr < n && v[rr] < mv) { m = rr; mv = v[rr] }
      if (m === i) break
      k[i] = k[m]; v[i] = v[m]; i = m
    }
    k[i] = lk; v[i] = lv
  }
}
