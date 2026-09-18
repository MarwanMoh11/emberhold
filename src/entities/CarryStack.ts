import Phaser from 'phaser'
import { RESOURCE_ORDER, type ResourceType } from '../core/types'
import type { ResourceManager } from '../systems/ResourceManager'

const TEX: Record<ResourceType, string> = {
  coins: 'res_coins', wood: 'res_wood', food: 'res_food',
  stone: 'res_stone', metal: 'res_metal', crystal: 'res_crystal',
}

const MAX_ICONS = 14

/**
 * The visible pile on the hero's back. Icon count tracks the fraction of the
 * pack that is full, and composition tracks what is actually in it — so the
 * player reads "I'm loaded, go dump it" without looking at any number.
 */
export class CarryStack {
  private icons: Phaser.GameObjects.Image[] = []
  private t = 0
  private shown = 0

  constructor(scene: Phaser.Scene, private container: Phaser.GameObjects.Container) {
    for (let i = 0; i < MAX_ICONS; i++) {
      const img = scene.add.image(0, 0, 'res_coins').setVisible(false).setScale(0.78)
      this.container.add(img)
      this.icons.push(img)
    }
  }

  update(res: ResourceManager, dt: number, moving: boolean, facing: number) {
    this.t += dt * (moving ? 9 : 2.6)
    const total = res.carriedTotal
    const frac = res.carryCapacity > 0 ? Math.min(1, total / res.carryCapacity) : 0
    const want = total <= 0 ? 0 : Math.max(1, Math.round(frac * MAX_ICONS))

    // build a proportional composition of which icons to show
    if (want !== this.shown) this.shown = want
    let idx = 0
    if (want > 0) {
      for (const type of RESOURCE_ORDER) {
        const amt = res.carried[type]
        if (amt <= 0) continue
        const share = Math.max(1, Math.round((amt / total) * want))
        for (let i = 0; i < share && idx < want; i++, idx++) {
          this.icons[idx].setTexture(TEX[type])
        }
      }
    }

    for (let i = 0; i < MAX_ICONS; i++) {
      const img = this.icons[i]
      if (i >= want) { img.setVisible(false); continue }
      const row = Math.floor(i / 2)
      const col = i % 2
      const sway = Math.sin(this.t + row * 0.55) * (moving ? 2.4 : 1.1)
      img.setVisible(true)
      img.x = -facing * (9 + col * 9) + sway
      img.y = -18 - row * 8 + Math.cos(this.t * 0.8 + i) * 0.8
      img.setDepth(-row)
      img.setScale(0.72 - row * 0.015)
    }
  }
}
