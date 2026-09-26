import type Phaser from 'phaser'
import { PAL } from '../config/palette'
import type { Pt } from '../config/world/blueprint'
import type { GameScene } from '../scenes/GameScene'

/** Route dots are drawn on the ground only this close to the hero. */
export const ROUTE_NEAR = 1200
/** Spacing of the dots along a route, px. */
export const ROUTE_GAP = 28

/** Points every `gap` px along a polyline, the first point included. */
export function dotsAlong(route: readonly Pt[], gap = ROUTE_GAP): Pt[] {
  const out: Pt[] = []
  if (!route.length) return out
  out.push([route[0][0], route[0][1]])
  let carry = 0
  for (let s = 1; s < route.length; s++) {
    const [x0, y0] = route[s - 1], [x1, y1] = route[s]
    const len = Math.hypot(x1 - x0, y1 - y0)
    let at = gap - carry
    while (at <= len) {
      const t = at / len
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t])
      at += gap
    }
    carry = len - (at - gap)
  }
  return out
}

/**
 * Tonight's approaches as ember dotted lines on the ground (S09): from the
 * warning until the night ends, only within ROUTE_NEAR of the hero, with a
 * glint running along each toward the hall.
 *
 * The Graphics is re-tessellated every frame, so only dots on screen are
 * drawn, and where routes share a road a dot is drawn once (S21: three
 * fronts near the hall came to ~1200 dots and ~2.8 ms of render a frame).
 */
export class RouteMarks {
  private g: Phaser.GameObjects.Graphics
  private src: unknown = null
  private dots: Pt[][] = []
  private drawn = new Set<number>()

  constructor(private scene: GameScene, depth: number) {
    this.g = scene.add.graphics().setDepth(depth)
  }

  update() {
    const g = this.g
    g.clear()
    const w = this.scene.waves
    if (w.phase === 'day' || !w.tonight.length) { this.src = null; return }
    if (w.tonight !== this.src) {
      this.src = w.tonight
      this.dots = w.tonight.map(t => dotsAlong(t.route))
    }
    const p = this.scene.player
    const near2 = ROUTE_NEAR * ROUTE_NEAR
    const run = this.scene.now / 1000 * 6
    const v = this.scene.cameras.main.worldView
    const x0 = v.x - 16, x1 = v.right + 16, y0 = v.y - 16, y1 = v.bottom + 16
    const drawn = this.drawn
    drawn.clear()
    for (const dots of this.dots) {
      for (let k = 0; k < dots.length; k++) {
        const [x, y] = dots[k]
        if (x < x0 || x > x1 || y < y0 || y > y1) continue
        const cell = Math.round(y / 14) * 4096 + Math.round(x / 14)
        if (drawn.has(cell)) continue
        drawn.add(cell)
        const dx = x - p.x, dy = y - p.y
        const d2 = dx * dx + dy * dy
        if (d2 > near2) continue
        const edge = Math.min(1, (ROUTE_NEAR - Math.sqrt(d2)) / 240)
        const glint = (((k - run) % 6) + 6) % 6 < 1.2
        const a = (glint ? 1 : 0.72) * edge
        g.fillStyle(0x1a0c06, 0.5 * a)
        g.fillCircle(x, y + 1.5, glint ? 6.5 : 5.5)
        g.fillStyle(glint ? 0xffc36a : PAL.ember, a)
        g.fillCircle(x, y, glint ? 5 : 3.8)
      }
    }
  }
}
