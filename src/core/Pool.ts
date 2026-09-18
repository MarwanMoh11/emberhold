/** Fixed-growth object pool. Avoids per-frame allocation for hordes. */
export class Pool<T extends { active: boolean }> {
  readonly items: T[] = []
  private cursor = 0

  constructor(private readonly factory: () => T, prealloc = 0) {
    for (let i = 0; i < prealloc; i++) this.items.push(this.factory())
  }

  /** Returns a free item, growing the pool if needed. */
  obtain(): T {
    const n = this.items.length
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n
      const it = this.items[idx]
      if (!it.active) {
        this.cursor = (idx + 1) % n
        it.active = true
        return it
      }
    }
    const fresh = this.factory()
    fresh.active = true
    this.items.push(fresh)
    return fresh
  }

  get activeCount(): number {
    let c = 0
    for (const it of this.items) if (it.active) c++
    return c
  }

  forEachActive(fn: (item: T) => void) {
    for (const it of this.items) if (it.active) fn(it)
  }
}
