import type Phaser from 'phaser'
import { REGIONS, WORLD } from '../config/world'

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
 *
 * World v2 helpers:
 *   H.tp(5120, 4230)     teleport the hero (camera and terrain follow at once)
 *   H.claim('downs')     claim a region without paying (zones.unlock(id, true))
 *   H.reveal()           clear the fog everywhere
 *   H.where()            { x, y, region } of the hero
 *   H.world()            counts: size, regions claimed, pads, camps, nodes, enemies, chunks
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

  /**
   * Lay every texture whose key starts with one of `prefixes` out on a
   * full-window canvas, magnified. Click it to dismiss. The art is all baked
   * at boot, so this is the quickest way to look at a change to it.
   */
  const gallery = (prefixes: string[], zoom = 3, bg = '#8a9454') => {
    document.getElementById('gal')?.remove()
    const tm = game.textures
    const keys = tm.getTextureKeys().filter(k => prefixes.some(p => k.startsWith(p)))
    const c = document.createElement('canvas')
    c.id = 'gal'
    c.width = innerWidth; c.height = innerHeight
    Object.assign(c.style, { position: 'fixed', inset: '0', zIndex: '99', background: bg })
    const x = c.getContext('2d')!
    x.imageSmoothingEnabled = false
    let px = 8, py = 8, rowH = 0
    for (const k of keys) {
      const img = tm.get(k).getSourceImage() as CanvasImageSource & { width: number; height: number }
      const w = img.width * zoom, h = img.height * zoom
      if (px + w > c.width) { px = 8; py += rowH + 14; rowH = 0 }
      x.drawImage(img, px, py, w, h)
      x.fillStyle = '#000'; x.font = '10px sans-serif'; x.fillText(k, px, py + h + 10)
      px += w + 10; rowH = Math.max(rowH, h)
    }
    document.body.appendChild(c)
    c.onclick = () => c.remove()
    return keys.length
  }

  const tp = (x: number, y: number) => {
    const g = gs(); const p = g.player
    p.x = Math.max(24, Math.min(WORLD.width - 24, x))
    p.y = Math.max(24, Math.min(WORLD.height - 24, y))
    const cam = g.cameras.main
    cam.centerOn(p.x, p.y)
    g.terrain.prime(cam)
    pump(0.1)
    return where()
  }

  const claim = (id: string) => {
    const z = gs().zones
    if (!REGIONS.some(r => r.id === id)) return `no region "${id}"`
    z.unlock(id, true)
    return `${id}: ${z.isUnlocked(id) ? 'claimed' : 'locked'}`
  }

  const reveal = () => { gs().zones.revealAll(); return 'fog cleared' }

  const where = () => {
    const g = gs(); const p = g.player
    return { x: Math.round(p.x), y: Math.round(p.y), region: g.zones.zoneAt(p.x, p.y)?.spec.id ?? null }
  }

  const world = () => {
    const g = gs()
    const pads = [...g.buildings.byPad.values()]
    return {
      size: `${WORLD.width}x${WORLD.height}`,
      regions: REGIONS.length,
      claimed: REGIONS.filter(r => g.zones.isUnlocked(r.id)).map(r => r.id),
      pads: pads.length,
      built: pads.filter((b: any) => b.level > 0).length,
      camps: g.camps.camps.length,
      campsLive: g.camps.camps.filter((c: any) => !c.destroyed).length,
      nodes: g.nodes.nodes.length,
      enemies: g.enemies.walkerCount,
      wave: g.waves.wave,
      phase: g.waves.phase,
      chunks: g.terrain.stats(),
      cull: g.culler.stats(),
    }
  }

  ;(window as any).H = { pump, start, goTo, pad, build, snap, gs, ui, game, gallery, tp, claim, reveal, where, world }
}
