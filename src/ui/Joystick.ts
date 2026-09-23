import Phaser from 'phaser'
import { medalTexture, stickRingTexture } from './skin'
import { DPR } from '../core/device'

/**
 * Floating thumbstick: appears wherever the left half of the screen is touched,
 * so the player never has to find a fixed pad.
 */
export class Joystick {
  private base: Phaser.GameObjects.Image
  private knob: Phaser.GameObjects.Image
  private originX = 0
  private originY = 0
  private pointerId = -1
  readonly radius = 64

  value = { x: 0, y: 0 }
  enabled = true

  constructor(private scene: Phaser.Scene) {
    // A compass ring and a gilt-and-lapis boss, painted like the rest of the HUD.
    this.base = scene.add.image(0, 0, stickRingTexture(scene, this.radius))
      .setScrollFactor(0).setDepth(1_000_010).setVisible(false).setScale(1 / DPR)
    this.knob = scene.add.image(0, 0, medalTexture(scene, 26))
      .setScrollFactor(0).setDepth(1_000_011).setVisible(false).setScale(1 / DPR)

    scene.input.on('pointerdown', this.onDown, this)
    scene.input.on('pointermove', this.onMove, this)
    scene.input.on('pointerup', this.onUp, this)
    scene.input.on('pointerupoutside', this.onUp, this)
  }

  /** Left half of the screen drives movement; the right half is for buttons. */
  private isMoveZone(p: Phaser.Input.Pointer) {
    return p.x < this.scene.scale.width * 0.55
  }

  /**
   * Controls sit inside the movement half all the time: the build card's
   * UPGRADE button lands wherever the structure is, and on a phone the HUD's
   * own buttons reach well past the halfway line — the hotbar spans nearly the
   * full width in portrait, and pause and the army stance live under the health
   * bar. Without this a thumb pressing one of them also drags the hero, and
   * walking off the pad cancels the very thing it just asked for.
   */
  private overControl(p: Phaser.Input.Pointer) {
    // The HUD is a scene of its own, so it needs its own hit test.
    if (this.scene.input.hitTestPointer(p).length > 0) return true
    const game = this.scene.scene.get('Game') as Phaser.Scene & {
      buildings?: { panelContains(x: number, y: number): boolean }
    }
    if (!game?.input) return false
    if (game.input.hitTestPointer(p).length > 0) return true
    // The whole card counts, not just the button. A thumb that lands an inch
    // wide of UPGRADE should still not start walking.
    const cam = game.cameras?.main
    if (!cam || !game.buildings) return false
    const wp = cam.getWorldPoint(p.x, p.y)
    return game.buildings.panelContains(wp.x, wp.y)
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (!this.enabled || this.pointerId !== -1) return
    if (!this.isMoveZone(p)) return
    if (this.overControl(p)) return
    this.pointerId = p.id
    // Pointer positions arrive in device pixels; the stick is drawn and
    // measured in the CSS pixels the rest of the HUD is laid out in.
    this.originX = p.x / DPR
    this.originY = p.y / DPR
    this.base.setPosition(this.originX, this.originY).setVisible(true).setAlpha(0.9)
    this.knob.setPosition(this.originX, this.originY).setVisible(true).setAlpha(0.9)
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (p.id !== this.pointerId) return
    const dx = p.x / DPR - this.originX
    const dy = p.y / DPR - this.originY
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
