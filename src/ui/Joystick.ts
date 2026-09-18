import Phaser from 'phaser'
import { PAL } from '../config/palette'

/**
 * Floating thumbstick: appears wherever the left half of the screen is touched,
 * so the player never has to find a fixed pad.
 */
export class Joystick {
  private base: Phaser.GameObjects.Graphics
  private knob: Phaser.GameObjects.Graphics
  private originX = 0
  private originY = 0
  private pointerId = -1
  readonly radius = 64

  value = { x: 0, y: 0 }
  enabled = true

  constructor(private scene: Phaser.Scene) {
    this.base = scene.add.graphics().setScrollFactor(0).setDepth(1_000_010).setVisible(false)
    this.knob = scene.add.graphics().setScrollFactor(0).setDepth(1_000_011).setVisible(false)
    this.drawBase()
    this.drawKnob()

    scene.input.on('pointerdown', this.onDown, this)
    scene.input.on('pointermove', this.onMove, this)
    scene.input.on('pointerup', this.onUp, this)
    scene.input.on('pointerupoutside', this.onUp, this)
  }

  private drawBase() {
    const g = this.base
    g.clear()
    g.fillStyle(PAL.uiBg, 0.35); g.fillCircle(0, 0, this.radius)
    g.lineStyle(3, PAL.heroTrim, 0.5); g.strokeCircle(0, 0, this.radius)
    g.lineStyle(1.5, PAL.heroTrim, 0.25); g.strokeCircle(0, 0, this.radius * 0.55)
  }

  private drawKnob() {
    const g = this.knob
    g.clear()
    g.fillStyle(PAL.heroTrim, 0.55); g.fillCircle(0, 0, 27)
    g.fillStyle(PAL.uiText, 0.9); g.fillCircle(0, 0, 19)
  }

  /** Left half of the screen drives movement; the right half is for buttons. */
  private isMoveZone(p: Phaser.Input.Pointer) {
    return p.x < this.scene.scale.width * 0.55
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (!this.enabled || this.pointerId !== -1) return
    if (!this.isMoveZone(p)) return
    this.pointerId = p.id
    this.originX = p.x
    this.originY = p.y
    this.base.setPosition(p.x, p.y).setVisible(true).setAlpha(0.9)
    this.knob.setPosition(p.x, p.y).setVisible(true).setAlpha(0.9)
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (p.id !== this.pointerId) return
    const dx = p.x - this.originX
    const dy = p.y - this.originY
    const d = Math.hypot(dx, dy)
    const clamped = Math.min(d, this.radius)
    const nx = d > 0 ? dx / d : 0
    const ny = d > 0 ? dy / d : 0
    this.knob.setPosition(this.originX + nx * clamped, this.originY + ny * clamped)
    const mag = clamped / this.radius
    this.value.x = nx * mag
    this.value.y = ny * mag
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (p.id !== this.pointerId) return
    this.pointerId = -1
    this.value.x = 0
    this.value.y = 0
    this.base.setVisible(false)
    this.knob.setVisible(false)
  }

  get active() { return this.pointerId !== -1 }

  destroy() {
    this.scene.input.off('pointerdown', this.onDown, this)
    this.scene.input.off('pointermove', this.onMove, this)
    this.scene.input.off('pointerup', this.onUp, this)
    this.scene.input.off('pointerupoutside', this.onUp, this)
    this.base.destroy()
    this.knob.destroy()
  }
}
