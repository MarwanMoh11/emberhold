import { Overlay } from './Overlay'
import { PAL } from '../config/palette'
import { SaveManager } from '../systems/SaveManager'
import type { GameScene } from '../scenes/GameScene'
import type Phaser from 'phaser'

/** F2 panel. Hidden in normal play, invaluable for balancing. */
export class DebugPanel extends Overlay {
  private heading!: Phaser.GameObjects.Text
  private info!: Phaser.GameObjects.Text
  private rows: ReturnType<Overlay['button']>[] = []

  constructor(scene: Phaser.Scene, private game: GameScene) {
    super(scene, 1_250_000)
    this.dim.setFillStyle(0x040810, 0.35)
    this.heading = this.text(18, PAL.gold, true)
    this.info = this.text(11, PAL.uiDim)

    const b = (label: string, fn: () => void, colour = PAL.heroTrim) => {
      const btn = this.button(label, () => { fn(); this.layout() }, colour)
      this.rows.push(btn)
      return btn
    }

    b('+1,000 EVERYTHING', () => this.game.debugGiveResources(1000))
    b('+50,000 EVERYTHING', () => this.game.debugGiveResources(50000))
    b('SPAWN 10', () => this.game.debugSpawn(10))
    b('SPAWN 100', () => this.game.debugSpawn(100))
    b('SPAWN 300', () => this.game.debugSpawn(300))
    b('NEXT WAVE NOW', () => this.game.waves.forceNextWave())
    b('END NIGHT', () => this.game.waves.skipToDay())
    b('KILL ALL', () => this.game.enemies.killAll(), PAL.danger)
    b('LEVEL +1', () => this.game.debugLevel(1))
    b('LEVEL +5', () => this.game.debugLevel(5))
    b('BUILD EVERYTHING', () => this.game.buildings.unlockAll())
    b('UNLOCK MAP', () => { this.game.zones.revealAll(); for (const z of ['whisperwood', 'greyfall', 'hollow', 'deepvein', 'ashgate'] as const) this.game.zones.unlock(z, true) })
    b('TOGGLE GODMODE', () => { this.game.player.invincible = !this.game.player.invincible })
    b('TOGGLE PERF READOUT', () => this.scene.events.emit('toggleStats'))
    b('RESET SAVE', () => { SaveManager.clear(); window.location.reload() }, PAL.danger)
  }

  protected layout() {
    const w = Math.min(250, this.W - 24)
    const h = Math.min(this.H - 24, 120 + this.rows.length * 30)
    const x = 14
    const y = this.H / 2 - h / 2
    this.drawCard(x, y, w, h, PAL.danger)
    this.heading.setText('DEBUG  ·  F2').setPosition(x + w / 2, y + 28)
    const s = this.game.stats
    this.info.setText(
      `${s.fps} fps   enemies ${s.enemies}\n` +
      `troops ${s.soldiers}   workers ${s.workers}\n` +
      `drops ${s.pickups}   shots ${s.projectiles}\n` +
      `godmode ${this.game.player.invincible ? 'ON' : 'off'}`,
    ).setPosition(x + w / 2, y + 62)

    let by = y + 104
    for (const r of this.rows) {
      r.place(x + w / 2, by, w - 28, 26)
      by += 30
    }
  }

  update() { if (this.open) this.layout() }
}
