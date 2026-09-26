import type Phaser from 'phaser'
import { NB8 } from './flow'
import type { NavGrid } from './NavGrid'

const DEPTH = 870_000
/** at most this many cells drawn; zoomed far out, every other cell */
const MAX_CELLS = 9000

/**
 * F2 overlay for the NavGrid: tints impassable cells red and walled cells
 * amber, and draws the hall field's step as an arrow on every passable cell
 * around the camera. With `roads`, road cells (ROAD_SPEED for allies) are
 * tinted blue. Redraws when the camera moves a cell or the grid changes.
 */
export class NavDebug {
  on = false
  roads = false
  private g: Phaser.GameObjects.Graphics
  private lastKey = ''

  constructor(scene: Phaser.Scene, private nav: NavGrid) {
    this.g = scene.add.graphics().setDepth(DEPTH).setVisible(false)
  }

  toggle(): boolean {
    this.on = !this.on
    this.g.setVisible(this.on)
    this.lastKey = ''
    if (!this.on) this.g.clear()
    return this.on
  }

  /** Road tint on or off; shows the overlay if it was hidden. */
  toggleRoads(): boolean {
    this.roads = !this.roads
    if (!this.on) this.toggle()
    this.lastKey = ''
    return this.roads
  }

  update(cam: Phaser.Cameras.Scene2D.Camera): void {
    if (!this.on) return
    const { r } = this.nav
    const f = this.nav.field('hall')
    const v = cam.worldView
    const key = `${Math.floor(v.x / r.C)},${Math.floor(v.y / r.C)},${Math.round(v.width)},${f.version},${this.nav.version},${this.roads}`
    if (key === this.lastKey) return
    this.lastKey = key

    const g = this.g.clear()
    const x0 = Math.max(0, Math.floor(v.x / r.C) - 1), x1 = Math.min(r.GW - 1, Math.ceil((v.x + v.width) / r.C) + 1)
    const y0 = Math.max(0, Math.floor(v.y / r.C) - 1), y1 = Math.min(r.GH - 1, Math.ceil((v.y + v.height) / r.C) + 1)
    const every = (x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS ? 2 : 1
    const C = r.C, half = C / 2, arm = C * 0.36
    for (let gy = y0; gy <= y1; gy += every) {
      for (let gx = x0; gx <= x1; gx += every) {
        const i = gy * r.GW + gx
        const cx = gx * C + half, cy = gy * C + half
        if (!this.nav.passable(i)) {
          g.fillStyle(0xd03a2a, 0.28).fillRect(gx * C, gy * C, C, C)
          continue
        }
        if (this.nav.blocked(i)) g.fillStyle(0xf0a020, 0.4).fillRect(gx * C, gy * C, C, C)
        else if (this.roads && r.road[i]) g.fillStyle(0x3a8ee0, 0.35).fillRect(gx * C, gy * C, C, C)
        const k = f.step[i]
        if (k < 0) continue
        const [dx, dy] = NB8[k]
        const l = Math.hypot(dx, dy)
        const ux = dx / l, uy = dy / l
        const tx = cx + ux * arm, ty = cy + uy * arm
        g.lineStyle(2, 0xfff2c0, 0.75).lineBetween(cx - ux * arm, cy - uy * arm, tx, ty)
        g.fillStyle(0xfff2c0, 0.9).fillTriangle(
          tx + ux * 4, ty + uy * 4,
          tx - uy * 5 - ux * 3, ty + ux * 5 - uy * 3,
          tx + uy * 5 - ux * 3, ty - ux * 5 - uy * 3,
        )
      }
    }
  }
}
