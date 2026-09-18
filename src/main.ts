import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { GameScene } from './scenes/GameScene'
import { UIScene } from './scenes/UIScene'
import { PAL, CSS } from './config/palette'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: CSS(PAL.grassC),
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance',
    batchSize: 4096,
  },
  fps: { target: 60, min: 30 },
  input: { activePointers: 3 },
  scene: [BootScene, GameScene, UIScene],
}

const game = new Phaser.Game(config)

// Scale.RESIZE already tracks the window; only orientation flips on mobile
// need a nudge once the new viewport metrics have settled.
window.addEventListener('orientationchange', () => {
  setTimeout(() => game.scale.refresh(), 150)
})

// handy for debugging from the console (and for the F2 panel's perf readout)
;(window as unknown as { emberhold: Phaser.Game }).emberhold = game

// window.H — scripted-play helpers. Dev only; tree-shaken out of a build.
if (import.meta.env.DEV) {
  import('./dev/harness').then(m => m.installHarness(game))
}

export default game
