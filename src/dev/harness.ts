import type Phaser from 'phaser'

/**
 * Dev-only scripted-play harness, stripped from production builds.
 *
 * The browser throttles requestAnimationFrame hard when the tab is not the
 * foreground window, which makes a real-time playthrough useless for checking
 * balance. So this pumps `game.loop.step()` by hand off a synthetic clock and
 * lets a whole day/night cycle run in a fraction of a second.
 *
 * Open the console and try:
 *   H.start(); H.build('lumber1'); H.pump(60); H.snap('one night')
 */
export function installHarness(game: Phaser.Game) {
  // Keep the fake clock well ahead of the real one: Phaser clamps a step whose
  // timestamp is behind the previous frame, which silently yields dt === 0.
  let t = performance.now() + 5_000_000

  const gs = () => game.scene.getScene('Game') as any
  const ui = () => game.scene.getScene('UI') as any

  /** Answer any modal that would otherwise block a scripted run. */
  const auto = () => {
    const u = ui()
    if (u?.levelUp?.open) u.levelUp.choose(0)
  }

  const pump = (seconds: number, stepMs = 33) => {
    const n = Math.max(1, Math.round((seconds * 1000) / stepMs))
    for (let i = 0; i < n; i++) { t += stepMs; game.loop.step(t); auto() }
  }

  const start = (load = false) => {
    const boot = game.scene.getScene('Boot') as any
    boot.scene.start('Game', { load, settings: boot.settings })
    pump(0.6)
    return 'game started'
  }

  const goTo = (x: number, y: number, maxSeconds = 10) => {
    const g = gs(); const p = g.player
    const stepMs = 33
    for (let i = 0; i < Math.round((maxSeconds * 1000) / stepMs); i++) {
      const dx = x - p.x, dy = y - p.y
      const d = Math.hypot(dx, dy) || 1
      if (d < 16) break
      g.moveInput.x = dx / d; g.moveInput.y = dy / d
      t += stepMs; game.loop.step(t); auto()
    }
    g.moveInput.x = 0; g.moveInput.y = 0
    return [Math.round(p.x), Math.round(p.y)]
  }

  const pad = (id: string) => gs().buildings.byPad.get(id)

  const build = (id: string, dwellSeconds = 6) => {
    const b = pad(id)
    if (!b) return `no pad "${id}"`
    goTo(b.x, b.y + 30, 12)
    pump(dwellSeconds)
    return `${id}:${b.level}`
  }

  const snap = (tag = '') => {
    const g = gs()
    const r = (k: string) => +(g.res.rate[k] || 0).toFixed(2)
    return {
      tag,
      stored: { ...g.res.stored },
      rate: { coins: r('coins'), wood: r('wood'), food: r('food') },
      workers: g.workers.count,
      workerStates: g.workers.workers.map((w: any) => w.state).join(','),
      army: g.army?.count ?? 0,
      wave: g.waves.wave,
      phase: g.waves.phase,
      enemies: g.enemies.walkerCount,
      hero: `${Math.round(g.player.hp)}/${g.player.maxHp} lv${g.levels?.level ?? 1}`,
      built: [...g.buildings.byPad.values()]
        .filter((b: any) => b.level > 0)
        .map((b: any) => `${b.padId}:${b.level}`),
    }
  }

  ;(window as any).H = { pump, start, goTo, pad, build, snap, gs, ui, game }
}
