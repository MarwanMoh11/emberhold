/**
 * Walks a walker along a path from `NavGrid.findPath` (S06).
 *
 * It does not move anything: each frame it says which waypoint to steer at,
 * so the walker keeps its own speed, separation and `slide` collision. A
 * waypoint within `reach` counts as passed. `stuck` counts the seconds the
 * walker has failed to get closer to its waypoint, so the owner can repath.
 */
import type { Pt } from './PathFind'

export class PathFollower {
  path: Pt[] | null = null
  /** index of the waypoint being steered at */
  i = 0
  /** seconds without closing on the current waypoint */
  stuck = 0
  private best = Infinity

  set(path: Pt[] | null): void {
    this.path = path && path.length > 1 ? path : null
    this.i = 1
    this.stuck = 0
    this.best = Infinity
  }

  clear(): void {
    this.path = null
    this.stuck = 0
  }

  get active(): boolean {
    return this.path !== null
  }

  /** The path's last point, or null. */
  get goal(): Pt | null {
    return this.path ? this.path[this.path.length - 1] : null
  }

  /**
   * The point to steer at from (x, y). Waypoints within `reach` are passed;
   * `done` (and the path dropped) once the last one is within reach.
   */
  step(x: number, y: number, dt: number, reach = 22): { x: number; y: number; done: boolean } {
    const p = this.path
    if (!p) return { x, y, done: true }
    while (this.i < p.length - 1 && Math.hypot(p[this.i][0] - x, p[this.i][1] - y) < reach) {
      this.i++
      this.best = Infinity
      this.stuck = 0
    }
    const [tx, ty] = p[this.i]
    const d = Math.hypot(tx - x, ty - y)
    if (this.i === p.length - 1 && d < reach) {
      this.clear()
      return { x: tx, y: ty, done: true }
    }
    if (d < this.best - 1) { this.best = d; this.stuck = 0 } else this.stuck += dt
    return { x: tx, y: ty, done: false }
  }
}
