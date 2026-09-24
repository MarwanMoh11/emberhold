import Phaser from 'phaser'
import { PAL } from '../config/palette'
import { DPR } from '../core/device'
import { css, makeCanvas, mix, type Ctx } from '../art/ink'
import type { BuildingKey } from '../config/buildings'
import type { GameScene } from '../scenes/GameScene'

/** Screen pixels per lightmap texel. Light is soft; a quarter-res map is plenty. */
const LS = 4
/** Radius of a cached light brush, in its own pixels. */
const BRUSH_R = 32

interface Flash { x: number; y: number; r: number; c: number; t: number; dur: number }

/** How far each kind of building throws its hearth-light, in world px. */
const HEARTH: Partial<Record<BuildingKey, number>> = {
  townHall: 380, watchtower: 250, cannonTower: 200, blacksmith: 240, barracks: 210,
  house: 190, warehouse: 190, workshop: 190, healingTent: 200, depot: 180,
  lumberCamp: 170, farm: 170, quarry: 150, mine: 190, crystalDelve: 230,
  archeryRange: 170, stable: 170, gate: 150,
}

/** Ambient colour for a given darkness: warm afternoon, amber dusk, violet gloaming, blue night. */
const AMBIENT: [number, number][] = [
  [0, 0xfff4e2],
  [0.45, 0xf2b98e],
  [0.72, 0x9c7ea4],
  [1, 0x4c5286],
]

function ambientFor(d: number) {
  for (let i = 1; i < AMBIENT.length; i++) {
    const [d1, c1] = AMBIENT[i]
    const [d0, c0] = AMBIENT[i - 1]
    if (d <= d1) return mix(c0, c1, (d - d0) / (d1 - d0))
  }
  return AMBIENT[AMBIENT.length - 1][1]
}

/**
 * Light, as a multiply pass over the world.
 *
 * Each frame a small screen-sized lightmap is filled with the ambient colour
 * for the hour, every light source is added into it as a soft brush, and a
 * vignette is multiplied over the top. The map is then multiplied over
 * everything below it. By day that is only a warm grade; by night the ambient
 * falls to a deep blue and what you can see is what is lit — hearths,
 * braziers, the hero's lantern, burning ground, and the embers inside every
 * one of the horde.
 *
 * The map is painted with a 2D canvas and uploaded as a texture. Drawing it
 * into a Phaser RenderTexture instead left each brush's square quad visible —
 * later brushes knocked out earlier light inside their own bounds — and a
 * quarter-resolution canvas costs less to upload than it does to argue with.
 *
 * It sits under the health bars, floating numbers and warning circles, so
 * nothing you must read is ever darkened.
 */
export class LightingManager {
  private tex: Phaser.Textures.CanvasTexture
  private ctx: Ctx
  private img: Phaser.GameObjects.Image
  private brushes = new Map<number, HTMLCanvasElement>()
  private vignette: HTMLCanvasElement
  private flashes: Flash[] = []
  private t = 0
  private w = 0
  private h = 0

  /** 0 = low, 1 = medium, 2 = high; mirrors the effects quality setting */
  quality = 2

  constructor(private scene: GameScene, depth: number) {
    if (scene.textures.exists('lightmap')) scene.textures.remove('lightmap')
    this.tex = scene.textures.createCanvas('lightmap', 16, 16) as Phaser.Textures.CanvasTexture
    this.ctx = this.tex.context
    this.img = scene.add.image(0, 0, 'lightmap')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(depth)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)

    const [v, vx] = makeCanvas(128, 128)
    const g = vx.createRadialGradient(64, 64, 26, 64, 64, 92)
    g.addColorStop(0, css(0xffffff))
    g.addColorStop(0.5, css(0xf4ecec))
    g.addColorStop(0.82, css(0xa8949c))
    g.addColorStop(1, css(0x6e5866))
    vx.fillStyle = g
    vx.fillRect(0, 0, 128, 128)
    this.vignette = v
    this.scene.events.once('shutdown', () => this.destroy())
  }

  /** A soft round light of one colour, cached: lights come in a handful of hues. */
  private brush(c: number) {
    let b = this.brushes.get(c)
    if (b) return b
    const S = BRUSH_R * 2
    const [canvas, x] = makeCanvas(S, S)
    const g = x.createRadialGradient(BRUSH_R, BRUSH_R, 0, BRUSH_R, BRUSH_R, BRUSH_R)
    g.addColorStop(0, css(c, 1))
    g.addColorStop(0.28, css(c, 0.78))
    g.addColorStop(0.58, css(c, 0.32))
    g.addColorStop(0.82, css(c, 0.08))
    g.addColorStop(1, css(c, 0))
    x.fillStyle = g
    x.fillRect(0, 0, S, S)
    b = canvas
    this.brushes.set(c, b)
    return b
  }

  /** A burst of light that fades out: explosions, ability casts, level-ups. */
  flash(x: number, y: number, radius: number, colour: number, seconds = 0.35) {
    if (this.flashes.length > 24) this.flashes.shift()
    this.flashes.push({ x, y, r: radius, c: colour, t: seconds, dur: seconds })
  }

  update(dt: number) {
    const s = this.scene
    this.t += dt
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].t -= dt
      if (this.flashes[i].t <= 0) this.flashes.splice(i, 1)
    }

    const cam = s.cameras.main
    const z = cam.zoom
    const W = cam.width, H = cam.height
    // one lightmap texel per LS CSS pixels, whatever the canvas resolution:
    // the light is soft by nature, and a DPR-sized map would cost 4x to paint
    const ls = LS * DPR
    const lw = Math.ceil(W / ls) + 1, lh = Math.ceil(H / ls) + 1
    if (lw !== this.w || lh !== this.h) {
      this.w = lw; this.h = lh
      this.tex.setSize(lw, lh)
      this.img.setTexture('lightmap')
    }
    // A scroll-factor-0 object still scales about the camera centre, so undo
    // the zoom to pin the map to the screen's top-left corner.
    this.img.setScale(ls / z).setPosition((W / 2) * (1 - 1 / z), (H / 2) * (1 - 1 / z))

    const x = this.ctx
    const d = s.waves.darkness
    x.globalCompositeOperation = 'source-over'
    x.globalAlpha = 1
    x.fillStyle = css(ambientFor(d))
    x.fillRect(0, 0, lw, lh)

    const view = cam.worldView
    const k = z / ls
    x.globalCompositeOperation = 'lighter'
    const put = (wx: number, wy: number, r: number, c: number, a: number) => {
      if (a <= 0.01) return
      const lx = (wx - view.x) * k, ly = (wy - view.y) * k, lr = r * k
      if (lx < -lr || ly < -lr || lx > lw + lr || ly > lh + lr) return
      x.globalAlpha = Math.min(1, a)
      x.drawImage(this.brush(c), lx - lr, ly - lr, lr * 2, lr * 2)
    }
    const flicker = (seed: number) => 0.9 + 0.1 * Math.sin(this.t * 7.3 + seed) * Math.sin(this.t * 3.1 + seed * 1.7)

    if (d > 0.03) {
      const lamp = Math.min(1, d * 1.4)

      // hearths and braziers
      for (const b of s.buildings.buildings) {
        if (b.level <= 0 || !b.visible) continue
        const r = HEARTH[b.key]
        if (!r) continue
        const big = b.key === 'townHall' && b.level <= 1 ? 1.15 : 1
        put(b.x, b.y - b.def.h * 0.35, r * big, 0xffbf78, 0.8 * lamp * flicker(b.x))
      }
      // the horde's own fires
      for (const c of s.camps.camps) {
        if (c.destroyed) continue
        // a sleeping camp's fires are banked low
        put(c.spec.x, c.spec.y - 20, 300, 0xff7a3a, (c.state === 'asleep' ? 0.35 : 0.9) * lamp * flicker(c.spec.x))
      }
      // crystal seams glow faintly
      for (const n of s.nodes.nodes) {
        if (n.type !== 'crystal' || !n.alive) continue
        put(n.x, n.y - 18, 120, PAL.crystal, 0.55 * lamp)
      }
      // burning ground and bright projectiles
      s.abilities.forEachFire((fx, fy, radius, life) => put(fx, fy, radius * 1.8, 0xff8a3a, Math.min(1, life) * lamp * flicker(fx)))
      if (this.quality > 0) s.projectiles.forEachGlow((px, py, c, r) => put(px, py, r, c, 0.65 * lamp))
      // the embers inside every one of them
      if (this.quality > 0) {
        const cap = this.quality === 1 ? 90 : 220
        let n = 0
        for (const e of s.enemies.list) {
          if (!e.active || !e.alive || e.def.structure) continue
          if (n++ > cap) break
          const r = e.def.boss ? 320 : 36 + e.radius * 2.6
          put(e.x, e.y - e.radius, r, e.def.colour, (e.def.boss ? 0.9 : 0.6) * lamp)
        }
      }
      // the hero's lantern, last so it wins
      const p = s.player
      if (p.alive) {
        put(p.x, p.y - 14, 300, 0xffd6a0, 0.95 * lamp)
        put(p.x, p.y - 14, 120, 0xfff0d8, 0.45 * lamp)
      }
    }
    for (const f of this.flashes) {
      const a = f.t / f.dur
      put(f.x, f.y, f.r * (1.2 - a * 0.2), f.c, a * (0.3 + d * 0.8))
    }

    // the vignette: faint in daylight, heavy in the dark
    x.globalCompositeOperation = 'multiply'
    x.globalAlpha = 0.5 + d * 0.5
    x.drawImage(this.vignette, 0, 0, lw, lh)
    x.globalCompositeOperation = 'source-over'
    x.globalAlpha = 1

    this.tex.refresh()
  }

  destroy() {
    this.img.destroy()
    const tm = this.scene.textures
    if (tm?.exists('lightmap')) tm.remove('lightmap')
  }
}
