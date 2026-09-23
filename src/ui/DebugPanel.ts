import { Overlay } from './Overlay'
import type { Tone } from './skin'
import { PAL } from '../config/palette'
import { SaveManager } from '../systems/SaveManager'
import type { GameScene } from '../scenes/GameScene'
import type Phaser from 'phaser'

/** F2 panel. Hidden in normal play, invaluable for balancing. */
export class DebugPanel extends Overlay {
  private heading!: Phaser.GameObjects.Text
  private info!: Phaser.GameObjects.Text
  private rows: ReturnType<Overlay['button']>[] = []
  private nextRefresh = 0

  constructor(scene: Phaser.Scene, private game: GameScene) {
    super(scene, 1_250_000)
    // not modal: the game keeps running and answering taps around the panel
    this.dim.setFillStyle(0x0c0704, 0.2).disableInteractive()
    this.vignette.setVisible(false)
    this.heading = this.text(20, PAL.uiText, true)
    this.info = this.text(11, PAL.uiDim)

    const b = (label: string, fn: () => void, tone: Tone = 'quiet') => {
      const btn = this.button(label, () => { fn(); this.layout() }, tone, 12)
      this.rows.push(btn)
      return btn
    }

    b('+1,000 EVERYTHING', () => this.game.debugGiveResources(1000))
    b('+50,000 EVERYTHING', () => this.game.debugGiveResources(50000))
    b('SPAWN 10', () => this.game.debugSpawn(10))
    b('SPAWN 100', () => this.game.debugSpawn(100))
    b('SPAWN 300', () => this.game.debugSpawn(300))
    b('SUMMON FINAL BOSS', () => this.game.debugSpawnFinalBoss(), 'danger')
    b('NEXT WAVE NOW', () => this.game.waves.forceNextWave())
    b('END NIGHT', () => this.game.waves.skipToDay())
    b('KILL ALL', () => this.game.enemies.killAll(), 'danger')
    b('LEVEL +1', () => this.game.debugLevel(1))
    b('LEVEL +5', () => this.game.debugLevel(5))
    b('BUILD EVERYTHING', () => this.game.buildings.unlockAll())
    b('UNLOCK MAP', () => { this.game.zones.revealAll(); for (const z of ['whisperwood', 'greyfall', 'hollow', 'deepvein', 'ashgate'] as const) this.game.zones.unlock(z, true) })
    b('TOGGLE GODMODE', () => { this.game.player.invincible = !this.game.player.invincible })
    b('TOGGLE NAV OVERLAY', () => this.game.navDebug.toggle())
    b('TOGGLE ROAD TINT', () => this.game.navDebug.toggleRoads())
    b('TOGGLE PERF READOUT', () => this.scene.events.emit('toggleStats'))
    b('RESET SAVE', () => { SaveManager.clear(); window.location.reload() }, 'danger')
  }

  protected layout() {
    const cols = this.W >= 600 ? 2 : 1
    const perCol = Math.ceil(this.rows.length / cols)
    const w = Math.min(cols === 2 ? 500 : 250, this.W - 24)
    const h = Math.min(this.H - 24, 192 + perCol * 30)
    const x = 14
    const y = this.H / 2 - h / 2
    this.drawCard(x, y, w, h, PAL.wax)
    this.heading.setText('Debug  ·  F2').setPosition(x + w / 2, y + 24)
    const s = this.game.stats
    this.info.setText(
      `${s.fps} fps   sim p95 ${s.simP95.toFixed(1)} ms\n` +
      `frame p95 ${s.frameP95.toFixed(1)} ms   enemies ${s.enemies}\n` +
      `troops ${s.soldiers}   workers ${s.workers}\n` +
      `drops ${s.pickups}   shots ${s.projectiles}\n` +
      `chunks ${s.chunks.resident} held  ${s.chunks.queued} queued  ${s.chunks.baked} baked\n` +
      `bake ${s.chunks.frameMs.toFixed(1)} ms  worst ${s.chunks.worstFrameMs.toFixed(1)} ms  chunk ${s.chunks.chunkMs.toFixed(1)} worst ${s.chunks.worstChunkMs.toFixed(1)} ms\n` +
      `static ${s.cull.shown} drawn  ${s.cull.total - s.cull.shown} culled\n` +
      `nav v${s.nav.version} ${s.nav.building ? 'rebuilding' : 'ready'} slice ${s.nav.worstFrameMs.toFixed(1)} · paths ${s.nav.paths.searches} worst ${s.nav.paths.worstMs.toFixed(1)} ms\n` +
      `godmode ${this.game.player.invincible ? 'ON' : 'off'}`,
    ).setPosition(x + w / 2, y + 88)

    const pitch = Math.min(30, (h - 188) / perCol)
    const buttonW = (w - 28 - (cols - 1) * 8) / cols
    for (let i = 0; i < this.rows.length; i++) {
      const col = Math.floor(i / perCol)
      const row = i % perCol
      const bx = x + 14 + col * (buttonW + 8) + buttonW / 2
      const by = y + 176 + row * pitch
      this.rows[i].place(bx, by, buttonW, Math.min(26, pitch - 2))
    }
  }

  update() {
    if (!this.open || this.scene.time.now < this.nextRefresh) return
    this.nextRefresh = this.scene.time.now + 250
    this.layout()
  }
}
