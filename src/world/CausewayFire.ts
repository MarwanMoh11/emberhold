import Phaser from 'phaser'
import { CROSSINGS } from '../config/world'
import { rr } from '../core/math'
import type { GameScene } from '../scenes/GameScene'

/** The crossing the fire closes, and the camp whose burning puts it out (S10). */
export const CAUSEWAY = 'calderaCauseway'
export const CAUSEWAY_KEEPER = 'campAshgate'
/** Rows of flame along the causeway (fractions of its length), and tongues per row across its width. */
const ROWS = [0.22, 0.5, 0.78]
const PER_ROW = 5

/**
 * The wall of fire on the Regent's Causeway. It keeps the crossing sealed in
 * the NavGrid until Ashgate burns; then the flames fade, the crossing opens,
 * and `crossing:opened` fires (the HUD's banner, S17's finale).
 */
export class CausewayFire {
  private flames: Phaser.GameObjects.Image[] = []
  private emberT = 0
  private mid = { x: 0, y: 0 }
  lit = false

  constructor(private scene: GameScene) {}

  /** At boot, after the save has loaded: light the fire unless Ashgate already burned. */
  sync() {
    const burned = this.scene.camps.isBurned(CAUSEWAY_KEEPER)
    this.scene.nav.setSealed(CAUSEWAY, !burned)
    if (!burned) this.light()
    this.scene.bus.on('camp:burned', ({ id }) => { if (id === CAUSEWAY_KEEPER) this.douse() })
  }

  private light() {
    const c = CROSSINGS.find(k => k.id === CAUSEWAY)
    if (!c || this.lit || !this.scene.textures.exists('fx_firewall')) return
    this.lit = true
    const [ax, ay] = c.a, [bx, by] = c.b
    const len = Math.hypot(bx - ax, by - ay) || 1
    const nx = -(by - ay) / len, ny = (bx - ax) / len
    this.mid = { x: (ax + bx) / 2, y: (ay + by) / 2 }
    const across = c.width * 0.85
    for (const t of ROWS) {
      for (let k = 0; k < PER_ROW; k++) {
        const o = (k / (PER_ROW - 1) - 0.5) * across + rr(-8, 8)
        const x = ax + (bx - ax) * t + nx * o, y = ay + (by - ay) * t + ny * o
        const f = this.scene.add.image(x, y, 'fx_firewall').setOrigin(0.5, 0.94).setDepth(y)
          .setScale(rr(0.85, 1.15)).setBlendMode(Phaser.BlendModes.ADD)
        this.scene.tweens.add({
          targets: f, scaleY: f.scaleY * rr(1.15, 1.3), scaleX: f.scaleX * rr(0.86, 0.94), alpha: rr(0.75, 0.9),
          duration: rr(320, 560), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: rr(0, 400),
        })
        this.scene.culler.add(f, x, y - 40, 80)
        this.flames.push(f)
      }
    }
  }

  /** Ashgate burned: the fire dies and the causeway opens. */
  douse() {
    const s = this.scene
    s.nav.setSealed(CAUSEWAY, false)
    if (!this.lit) return
    this.lit = false
    for (const f of this.flames) {
      s.tweens.killTweensOf(f)
      s.tweens.add({ targets: f, alpha: 0, scaleY: 0.2, duration: rr(1200, 2000), ease: 'Quad.easeIn', onComplete: () => f.destroy() })
    }
    this.flames = []
    s.fx.smoke(this.mid.x, this.mid.y - 20, 18)
    s.bus.emit('crossing:opened', { id: CAUSEWAY })
  }

  /** A few embers off the fire while it is on screen. */
  update(dt: number) {
    if (!this.lit) return
    this.emberT -= dt
    if (this.emberT > 0) return
    this.emberT = 0.25
    const view = this.scene.cameras.main.worldView
    if (!Phaser.Geom.Rectangle.Contains(view, this.mid.x, this.mid.y)) return
    const f = this.flames[(Math.random() * this.flames.length) | 0]
    if (f) this.scene.fx.embers(f.x, f.y - 50, 2)
  }
}
