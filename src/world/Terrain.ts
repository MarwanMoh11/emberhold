import Phaser from 'phaser'
import { WORLD } from '../config/balance'
import { ZONES, WALL_RING, PADS, SPAWN_GATES } from '../config/map'
import { PAL } from '../config/palette'
import { rnd, srand, rr, pick } from '../core/math'

const TILE = 64          // world-space size of one stamped tile
const SCALE = 0.5        // render texture is half resolution

interface Biome { key: string; x: number; y: number; w: number; h: number; tile: string }

/** Cheap deterministic hash so biome edges are ragged instead of ruler-straight. */
function jitter(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * The whole map is stamped into one half-resolution RenderTexture at boot.
 * After that the ground is a single draw call no matter how big the world is.
 */
export function buildTerrain(scene: Phaser.Scene, depth: number) {
  const rtW = Math.ceil(WORLD.width * SCALE)
  const rtH = Math.ceil(WORLD.height * SCALE)
  const rt = scene.add.renderTexture(0, 0, rtW, rtH)
    .setOrigin(0, 0).setScale(1 / SCALE).setDepth(depth)

  const stamp = scene.make.image({ key: 'gr_grass', add: false })
    .setOrigin(0, 0).setScale((TILE / 128) * SCALE * 1.02)

  const biomes: Biome[] = ZONES.filter(z => z.id !== 'hold').map(z => ({
    key: z.id, x: z.x, y: z.y, w: z.w, h: z.h,
    tile: z.id === 'whisperwood' ? 'gr_forest'
      : z.id === 'greyfall' ? 'gr_stone'
      : z.id === 'hollow' ? 'gr_ruins'
      : z.id === 'deepvein' ? 'gr_dirt'
      : 'gr_ash',
  }))

  srand(31337)
  const cx = WORLD.centerX, cy = WORLD.centerY

  for (let ty = 0; ty < WORLD.height; ty += TILE) {
    for (let tx = 0; tx < WORLD.width; tx += TILE) {
      const n = jitter(tx, ty)
      const jx = tx + (n - 0.5) * 120
      const jy = ty + (jitter(ty, tx) - 0.5) * 120
      let tile = 'gr_grass'

      for (const b of biomes) {
        if (jx > b.x && jx < b.x + b.w && jy > b.y && jy < b.y + b.h) { tile = b.tile; break }
      }

      // trodden ground inside the rampart ring
      const insideRing =
        tx > WALL_RING.left - 40 && tx < WALL_RING.right + 40 &&
        ty > WALL_RING.top - 40 && ty < WALL_RING.bottom + 40
      if (insideRing) {
        const d = Math.hypot(tx - cx, (ty - cy) * 1.1)
        if (d < 150 + n * 70) tile = 'gr_dirt'
      }

      stamp.setTexture(tile)
      rt.draw(stamp, tx * SCALE, ty * SCALE)
    }
  }
  stamp.destroy()

  // ---- roads: drawn as soft strokes over the tiles ----------------------
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  const road = (ax: number, ay: number, bx: number, by: number, w: number) => {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 26)
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = (ax + (bx - ax) * t) * SCALE + rr(-4, 4)
      const y = (ay + (by - ay) * t) * SCALE + rr(-4, 4)
      g.fillStyle(PAL.path, 0.28)
      g.fillEllipse(x, y, w * SCALE * rr(0.85, 1.15), w * SCALE * rr(0.7, 1))
    }
  }
  for (const gate of WALL_RING.gates) road(cx, cy, gate.x, gate.y, 56)
  for (const gate of SPAWN_GATES) {
    const nearestWallGate = WALL_RING.gates.reduce((a, b) =>
      Math.hypot(b.x - gate.x, b.y - gate.y) < Math.hypot(a.x - gate.x, a.y - gate.y) ? b : a)
    road(nearestWallGate.x, nearestWallGate.y, gate.x, gate.y, 42)
  }
  // short spurs from the plaza to each site, not a web of mud
  for (const pad of PADS) {
    if (pad.zone !== 'hold') continue
    if (pad.key === 'wall' || pad.key === 'gate') continue
    const dx = pad.x - cx, dy = pad.y - cy
    const d = Math.hypot(dx, dy) || 1
    road(cx + (dx / d) * 110, cy + (dy / d) * 110, pad.x, pad.y, 26)
  }
  rt.draw(g)
  g.destroy()

  // ---- scatter: tufts and pebbles keep the ground from reading as wallpaper
  const deco = scene.add.container(0, 0).setDepth(depth + 1)
  const decoG = scene.make.graphics({ x: 0, y: 0 }, false)
  for (let i = 0; i < 620; i++) {
    const x = rnd() * WORLD.width
    const y = rnd() * WORLD.height
    const inRing = x > WALL_RING.left && x < WALL_RING.right && y > WALL_RING.top && y < WALL_RING.bottom
    if (inRing && rnd() < 0.6) continue
    const c = pick([0x5e9a52, 0x4a8040, 0x6fae5f])
    decoG.fillStyle(c, 0.85)
    const bx = x * SCALE, by = y * SCALE
    decoG.fillRect(bx, by, 1, 2.6)
    decoG.fillRect(bx + 1.6, by + 0.6, 1, 2)
    decoG.fillRect(bx - 1.6, by + 0.8, 1, 2)
  }
  for (let i = 0; i < 180; i++) {
    const x = rnd() * WORLD.width, y = rnd() * WORLD.height
    decoG.fillStyle(pick([0x8a8f96, 0x6f7680]), 0.7)
    decoG.fillEllipse(x * SCALE, y * SCALE, rr(2, 5), rr(1.5, 3.5))
  }
  rt.draw(decoG)
  decoG.destroy()
  deco.destroy()

  return rt
}
