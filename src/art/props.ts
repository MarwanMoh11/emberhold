import type Phaser from 'phaser'
import { PAL } from '../config/palette'
import { bake, css, fill, form, glow, line, lightOf, mix, P, Rng, rimLight, shade, INK, type Ctx } from './ink'

/**
 * Things standing in the world: trees and rocks to chop, seams to mine, the
 * horde's warcamps, and the loot that spills out of everything.
 *
 * World props share the unit rule: feet 8px above the bottom of the canvas.
 */

const FOOT = 8

export function groundShadow(x: Ctx, cx: number, by: number, rx: number, ry: number, a = 0.28) {
  const g = x.createRadialGradient(cx, by, 0, cx, by, rx)
  g.addColorStop(0, css(0x1a1208, a))
  g.addColorStop(0.7, css(0x1a1208, a * 0.6))
  g.addColorStop(1, css(0x1a1208, 0))
  x.save()
  x.translate(cx, by); x.scale(1, ry / rx); x.translate(-cx, -by)
  x.fillStyle = g
  x.beginPath(); x.arc(cx, by, rx, 0, Math.PI * 2); x.fill()
  x.restore()
}

// ---- trees ----------------------------------------------------------------

export function trunk(x: Ctx, cx: number, by: number, w: number, h: number, c = 0x6e4a2c) {
  form(x, x2 => {
    x2.moveTo(cx - w * 0.9, by)
    x2.quadraticCurveTo(cx - w * 0.5, by - h * 0.15, cx - w * 0.5, by - h)
    x2.lineTo(cx + w * 0.5, by - h)
    x2.quadraticCurveTo(cx + w * 0.5, by - h * 0.15, cx + w * 0.95, by)
    x2.closePath()
  }, c, { rim: 1.2, core: w * 0.5 })
  line(x, x2 => { x2.moveTo(cx - w * 0.1, by - h * 0.2); x2.lineTo(cx - w * 0.05, by - h * 0.7) }, 0.8, INK, 0.45)
}

function canopy(x: Ctx, circles: number[][], base: number, r: Rng, hatchA = 0.22) {
  const path = P.cluster(circles)
  const size = Math.max(...circles.map(c => c[2]))
  form(x, path, base, { rim: size * 0.18, core: size * 0.55, hatch: hatchA, light: lightOf(base, 0.28), dark: mix(shade(base, -0.4), 0x1e2a3a, 0.2) })
  // leaf clumps: short curved strokes that break up the silhouette's interior
  x.save(); x.beginPath(); path(x); x.clip()
  for (let i = 0; i < circles.length * 5; i++) {
    const c = circles[i % circles.length]
    const a = r.range(0, Math.PI * 2)
    const d = r.range(0.2, 0.85) * c[2]
    const px = c[0] + Math.cos(a) * d, py = c[1] + Math.sin(a) * d
    const lit = py < c[1] - c[2] * 0.1 && px < c[0] + c[2] * 0.2
    line(x, x2 => { x2.arc(px, py, r.range(2.5, 4.5), Math.PI * 1.05, Math.PI * 1.85) }, 1, lit ? lightOf(base, 0.45) : shade(base, -0.45), lit ? 0.7 : 0.55)
  }
  x.restore()
}

function oak(x: Ctx, cx: number, by: number, base: number, r: Rng) {
  trunk(x, cx, by, 5, 30)
  canopy(x, [
    [cx - 13, by - 40, 14], [cx + 12, by - 42, 15], [cx - 2, by - 56, 17],
    [cx - 18, by - 52, 11], [cx + 17, by - 55, 11], [cx + 2, by - 38, 12],
  ], base, r)
}

export function pine(x: Ctx, cx: number, by: number, base: number) {
  trunk(x, cx, by, 4, 16, 0x5e3e26)
  const tiers = [[by - 12, 22, 22], [by - 28, 18, 20], [by - 42, 14, 18], [by - 54, 9, 15]]
  for (const [ty, hw, th] of tiers) {
    // apex, down the right flank, a ragged hem back to the left, up the left flank
    const pts: number[][] = [[cx, ty - th - 6], [cx + hw, ty]]
    const n = 6
    for (let i = n - 1; i >= 1; i--) pts.push([cx - hw + (2 * hw * i) / n, ty + (i % 2 ? 3 : -1)])
    pts.push([cx - hw, ty])
    form(x, P.poly(pts), base, { rim: 2, core: hw * 0.55, hatch: 0.25, light: lightOf(base, 0.25), dark: mix(shade(base, -0.42), 0x1e2a3a, 0.25) })
  }
}

function birch(x: Ctx, cx: number, by: number, base: number, r: Rng) {
  form(x, P.round(cx - 3.2, by - 40, 6.4, 40, 2), 0xe8e0cc, { rim: 1, core: 2.4 })
  for (let i = 0; i < 6; i++) {
    const yy = by - 6 - i * 6 - r.range(0, 3)
    fill(x, P.rect(cx - 3.2 + r.range(0, 2), yy, r.range(2, 4), 1.4), INK, 0.8)
  }
  canopy(x, [
    [cx - 6, by - 50, 11], [cx + 7, by - 54, 11], [cx, by - 66, 12], [cx - 2, by - 42, 9], [cx + 8, by - 43, 8],
  ], base, r, 0.18)
}

// ---- rocks and seams --------------------------------------------------------

export function boulder(x: Ctx, cx: number, by: number, s: number, base: number, r: Rng, moss = false) {
  const pts = [
    [cx - 22 * s, by], [cx - 21 * s, by - 16 * s], [cx - 10 * s, by - 29 * s], [cx + 6 * s, by - 31 * s],
    [cx + 19 * s, by - 20 * s], [cx + 23 * s, by - 6 * s], [cx + 18 * s, by],
  ]
  const path = P.blob(pts, 0.35)
  form(x, path, base, { rim: 3 * s, core: 10 * s, hatch: 0.2 })
  // facets
  line(x, x2 => { x2.moveTo(cx - 10 * s, by - 29 * s); x2.lineTo(cx - 4 * s, by - 14 * s); x2.lineTo(cx + 19 * s, by - 20 * s) }, 1, INK, 0.5)
  line(x, x2 => { x2.moveTo(cx - 4 * s, by - 14 * s); x2.lineTo(cx - 8 * s, by) }, 1, INK, 0.35)
  if (moss) {
    x.save(); x.beginPath(); path(x); x.clip()
    for (let i = 0; i < 7; i++) fill(x, P.ellipse(cx - 12 * s + r.range(0, 18) * s, by - 27 * s + r.range(0, 8) * s, r.range(3, 6) * s, r.range(2, 3) * s), 0x6f8a44, 0.9)
    x.restore()
  }
}

// ---- pickups ---------------------------------------------------------------

type PickupShape = 'coin' | 'log' | 'sheaf' | 'block' | 'ingot' | 'gem'

function pickupBody(x: Ctx, c: number, colour: number, shape: PickupShape) {
  switch (shape) {
    case 'coin': {
      form(x, P.ellipse(c, c + 1, 8, 7.4), shade(colour, -0.3), { rim: 0, core: 0 })
      form(x, P.circle(c, c - 0.5, 7.4), colour, { rim: 1.4, core: 2.6, light: 0xfff4c0 })
      line(x, P.circle(c, c - 0.5, 4.6), 0.9, shade(colour, -0.45), 0.8)
      fill(x, P.poly([[c, c - 3.6], [c + 2.2, c - 0.5], [c, c + 2.6], [c - 2.2, c - 0.5]]), shade(colour, -0.35))
      break
    }
    case 'log': {
      form(x, P.round(c - 9, c - 4.5, 16, 9, 4.5), colour, { rim: 1.2, core: 2.6 })
      for (const lx of [-4, 1]) line(x, x2 => { x2.moveTo(c + lx, c - 4); x2.lineTo(c + lx + 1, c + 4) }, 0.7, INK, 0.4)
      form(x, P.ellipse(c + 7, c, 3.6, 4.6), 0xe0bc84, { rim: 0.6, core: 1 })
      line(x, P.ellipse(c + 7, c, 1.6, 2.2), 0.7, shade(colour, -0.3), 0.8)
      break
    }
    case 'sheaf': {
      for (const [ox, a] of [[-3, -0.25], [0, 0], [3, 0.25]]) {
        form(x, x2 => {
          x2.save(); x2.translate(c + ox, c + 2); x2.rotate(a)
          x2.ellipse(0, -7, 2.6, 5, 0, 0, Math.PI * 2)
          x2.restore()
        }, 0xe8c860, { rim: 0.8, core: 1.2 })
      }
      form(x, P.poly([[c - 4, c + 1], [c + 4, c + 1], [c + 3, c + 9], [c - 3, c + 9]]), colour, { rim: 0.8, core: 1.4 })
      fill(x, P.rect(c - 4.5, c + 2, 9, 2), 0xa8402c)
      break
    }
    case 'block': {
      form(x, P.poly([[c - 8, c - 2], [c, c - 7], [c + 8, c - 2], [c, c + 3]]), lightOf(colour, 0.2), { rim: 0, core: 0 })
      form(x, P.poly([[c - 8, c - 2], [c, c + 3], [c, c + 10], [c - 8, c + 5]]), colour, { rim: 0, core: 0 })
      form(x, P.poly([[c, c + 3], [c + 8, c - 2], [c + 8, c + 5], [c, c + 10]]), shade(colour, -0.25), { rim: 0, core: 0 })
      line(x, x2 => { x2.moveTo(c - 3, c + 3); x2.lineTo(c - 5, c + 6) }, 0.7, INK, 0.5)
      break
    }
    case 'ingot': {
      form(x, P.poly([[c - 9, c + 5], [c - 6, c - 2], [c + 6, c - 2], [c + 9, c + 5]]), colour, { rim: 1.2, core: 2.4, light: 0xffffff })
      fill(x, P.round(c - 4, c - 1, 7, 1.6, 1), 0xffffff, 0.85)
      break
    }
    case 'gem': {
      form(x, P.poly([[c - 6, c - 1], [c - 2, c - 7], [c + 2, c - 7], [c + 6, c - 1], [c, c + 8]]), colour, { rim: 1.2, core: 2.4, light: 0xf0e0ff })
      line(x, x2 => { x2.moveTo(c - 6, c - 1); x2.lineTo(c + 6, c - 1); x2.moveTo(c - 2, c - 7); x2.lineTo(c, c + 8); x2.lineTo(c + 2, c - 7) }, 0.6, INK, 0.45)
      break
    }
  }
}

export function buildPropTextures(scene: Phaser.Scene) {
  const r = new Rng(90210)

  // ---- trees: an oak, a pine and a birch, each on its own ground shadow ----
  const W = 70, H = 96
  const treeBase = [0x6f8a3c, 0x3f6a4a, 0x93a44a]
  for (let v = 0; v < 3; v++) {
    const cx = W / 2, by = H - FOOT
    bake(scene, `tree${v}`, W, H, {
      under: x => groundShadow(x, cx + 4, by - 1, 24, 7),
      body: x => {
        if (v === 0) oak(x, cx, by, treeBase[0], r)
        else if (v === 1) pine(x, cx, by, treeBase[1])
        else birch(x, cx, by, treeBase[2], r)
      },
      outline: 2,
      grain: 0.12,
    })
  }
  {
    const w = 44, h = 34, cx = w / 2, by = h - FOOT
    bake(scene, 'stump', w, h, {
      under: x => groundShadow(x, cx + 2, by, 16, 5),
      body: x => {
        form(x, P.round(cx - 10, by - 12, 20, 12, 3), 0x6e4a2c, { rim: 1, core: 4 })
        form(x, P.ellipse(cx, by - 12, 10, 4.2), 0xd8b47e, { rim: 0.8, core: 1.4 })
        line(x, P.ellipse(cx, by - 12, 6, 2.4), 0.7, 0x8a6a45, 0.9)
        line(x, P.ellipse(cx, by - 12, 2.6, 1), 0.7, 0x8a6a45, 0.9)
        form(x, P.poly([[cx + 5, by - 15], [cx + 13, by - 22], [cx + 15, by - 19], [cx + 8, by - 13]]), 0xc9d1da, { rim: 0.6, core: 1 })
      },
      outline: 1.6,
    })
  }

  // ---- rocks ---------------------------------------------------------------
  for (let v = 0; v < 2; v++) {
    const w = 60, h = 52, cx = w / 2, by = h - FOOT
    bake(scene, `rock${v}`, w, h, {
      under: x => groundShadow(x, cx + 3, by, 25, 7),
      body: x => boulder(x, cx, by, v === 0 ? 1 : 0.9, v === 0 ? 0xa39c8c : 0x8f8a80, r, v === 1),
      outline: 2,
      grain: 0.14,
    })
  }

  // ---- ore seam ------------------------------------------------------------
  {
    const w = 60, h = 54, cx = w / 2, by = h - FOOT
    bake(scene, 'ore0', w, h, {
      under: x => groundShadow(x, cx + 3, by, 25, 7),
      body: x => {
        boulder(x, cx, by, 0.95, 0x5e5248, r)
        for (const [ox, oy, s] of [[-7, -18, 3.6], [6, -22, 3.2], [2, -10, 2.8], [-12, -8, 2.2]]) {
          form(x, P.poly([[cx + ox - s, cy(by, oy)], [cx + ox, cy(by, oy) - s], [cx + ox + s, cy(by, oy)], [cx + ox, cy(by, oy) + s]]), PAL.metal, { rim: 0.8, core: 1.2, light: 0xffffff })
        }
      },
      over: x => {
        for (const [ox, oy] of [[-7, -19], [6, -23]]) {
          glow(x, cx + ox, by + oy, 4, 0xffffff, 0.8)
        }
      },
      outline: 2,
      grain: 0.14,
    })
  }

  // ---- crystal cluster -----------------------------------------------------
  {
    const w = 58, h = 66, cx = w / 2, by = h - FOOT
    bake(scene, 'crystal0', w, h, {
      under: x => { glow(x, cx, by - 16, 30, PAL.crystal, 0.35); groundShadow(x, cx + 2, by, 20, 6) },
      body: x => {
        form(x, P.blob([[cx - 18, by], [cx - 12, by - 9], [cx + 12, by - 10], [cx + 18, by]], 0.5), 0x4e3e62, { rim: 1, core: 3 })
        const spike = (sx: number, h2: number, w2: number, lean: number) => {
          form(x, P.poly([[sx - w2, by - 6], [sx - w2 * 0.7 + lean, by - 6 - h2 * 0.85], [sx + lean, by - 6 - h2], [sx + w2 * 0.7 + lean, by - 6 - h2 * 0.85], [sx + w2, by - 6]]), PAL.crystal, { rim: 2, core: w2 * 0.9, light: 0xf2e6ff, dark: 0x5a3a9a })
          line(x, x2 => { x2.moveTo(sx + lean, by - 6 - h2); x2.lineTo(sx + lean * 0.3, by - 7) }, 0.7, 0xf2e6ff, 0.6)
        }
        spike(cx - 10, 22, 6, -3); spike(cx + 10, 18, 5, 3); spike(cx, 36, 7.5, 0)
      },
      over: x => { glow(x, cx - 1, by - 34, 5, 0xffffff, 0.7) },
      outline: 2,
      grain: 0.08,
    })
  }

  // ---- a crop plant for the fields ----------------------------------------
  {
    const w = 30, h = 34, cx = w / 2, by = h - FOOT
    bake(scene, 'crop', w, h, {
      under: x => groundShadow(x, cx + 1, by, 11, 3.5, 0.24),
      body: x => {
        for (const [ox, a, hh] of [[-5, -0.3, 16], [0, 0, 20], [5, 0.3, 16], [-2, -0.12, 18], [3, 0.14, 17]]) {
          line(x, x2 => { x2.moveTo(cx + ox * 0.4, by); x2.quadraticCurveTo(cx + ox * 0.6, by - hh * 0.5, cx + ox + Math.sin(a) * 6, by - hh) }, 1.4, 0x7a8a3a, 1)
          form(x, P.ellipse(cx + ox + Math.sin(a) * 6, by - hh - 2, 2.2, 4.6, a), 0xe2c25c, { rim: 0.6, core: 1 })
        }
      },
      outline: 1.2,
    })
  }

  // ---- resource pickups ----------------------------------------------------
  const pickup = (key: string, colour: number, shape: PickupShape) => {
    const S = 24, c = S / 2
    bake(scene, key, S, S, { body: x => pickupBody(x, c, colour, shape), outline: 1.4, grain: 0.06 })
    // The HUD shows these at icon size on a screen twice or three times as
    // dense as the world's art, so it gets its own copy painted at 3x.
    const U = 3
    bake(scene, `ui_${key}`, S * U, S * U, {
      body: x => { x.save(); x.scale(U, U); pickupBody(x, c, colour, shape); x.restore() },
      outline: 1.4 * U, grain: 0.06,
    })
  }
  pickup('res_coins', PAL.coins, 'coin')
  pickup('res_wood', PAL.wood, 'log')
  pickup('res_food', PAL.food, 'sheaf')
  pickup('res_stone', PAL.stone, 'block')
  pickup('res_metal', PAL.metal, 'ingot')
  pickup('res_crystal', PAL.crystal, 'gem')

  // experience: a mote of ward-light
  {
    const S = 18, c = S / 2
    bake(scene, 'res_xp', S, S, {
      under: x => glow(x, c, c, 8, PAL.xp, 0.55),
      body: x => form(x, P.poly([[c, c - 6], [c + 4, c], [c, c + 6], [c - 4, c]]), PAL.xp, { rim: 1, core: 1.6, light: 0xffffff }),
      outline: 1.1,
      grain: 0,
    })
  }

  // a heart, from healing drops
  {
    const S = 22, c = S / 2
    bake(scene, 'res_heart', S, S, {
      body: x => {
        form(x, x2 => {
          x2.moveTo(c, c + 7)
          x2.bezierCurveTo(c - 10, c, c - 7, c - 8, c, c - 3)
          x2.bezierCurveTo(c + 7, c - 8, c + 10, c, c, c + 7)
          x2.closePath()
        }, 0xe8485a, { rim: 1.4, core: 2.6, light: 0xffb0b0 })
      },
      outline: 1.3,
    })
  }

  // ---- the horde's warcamp ---------------------------------------------------
  {
    const w = 164, h = 146, cx = w / 2, by = h - 12
    bake(scene, 'enm_camp', w, h, {
      under: x => {
        groundShadow(x, cx, by - 4, 74, 22, 0.35)
        const g = x.createRadialGradient(cx, by - 8, 4, cx, by - 8, 64)
        g.addColorStop(0, css(0x2a1c16, 0.9)); g.addColorStop(1, css(0x2a1c16, 0))
        x.fillStyle = g; x.beginPath(); x.ellipse(cx, by - 8, 64, 22, 0, 0, Math.PI * 2); x.fill()
      },
      body: x => {
        // back palisade
        for (let i = 0; i < 12; i++) {
          const a = Math.PI * (0.06 + (i / 11) * 0.88)
          const sx = cx - Math.cos(a) * 60
          const sy = by - 20 - Math.sin(a) * 14
          form(x, P.poly([[sx - 4.5, sy + 2], [sx - 4.5, sy - 30], [sx, sy - 38], [sx + 4.5, sy - 30], [sx + 4.5, sy + 2]]), 0x4a3424, { rim: 1, core: 2.4 })
        }
        // hide tents
        const tent = (tx: number, ty: number, s: number, c: number) => {
          const p = P.poly([[tx - 24 * s, ty], [tx - 2 * s, ty - 32 * s], [tx + 2 * s, ty - 34 * s], [tx + 24 * s, ty]])
          form(x, p, c, { rim: 2, core: 12 * s, hatch: 0.2 })
          rimLight(x, p, 0xff7a2e, 1.6, Math.PI * 0.55, 0.6)
          fill(x, P.poly([[tx - 7 * s, ty], [tx, ty - 16 * s], [tx + 7 * s, ty]]), 0x120a06)
          line(x, x2 => { x2.moveTo(tx, ty - 33 * s); x2.lineTo(tx - 6 * s, ty - 40 * s); x2.moveTo(tx, ty - 33 * s); x2.lineTo(tx + 5 * s, ty - 40 * s) }, 1.6, 0x3a2a1a, 1)
        }
        tent(cx - 32, by - 22, 1, 0x5e3a2c)
        tent(cx + 30, by - 20, 0.92, 0x543226)
        tent(cx - 2, by - 40, 1.18, 0x66402e)
        // war banner: the horde's mark, an ember eye
        form(x, P.round(cx - 2.5, by - 118, 5, 80, 2), 0x2a1c12, { rim: 0.8, core: 1.6 })
        const flag = P.poly([[cx + 2, by - 116], [cx + 38, by - 110], [cx + 30, by - 99], [cx + 40, by - 88], [cx + 2, by - 90]])
        form(x, flag, 0x7a1e18, { rim: 1.4, core: 5, hatch: 0.2 })
        fill(x, P.ellipse(cx + 18, by - 102, 7, 4.6), 0x1a0806)
        for (const s of [-1, 1]) {
          form(x, P.poly([[cx + s * 4, by - 118], [cx + s * 14, by - 128], [cx + s * 8, by - 116]]), 0xd8ccb4, { rim: 0.6, core: 1 })
        }
        // front palisade
        for (let i = 0; i < 9; i++) {
          const sx = cx - 58 + i * 14.5
          if (Math.abs(sx - cx) < 16) continue
          const sy = by - 4 + Math.abs(i - 4) * -1.5
          form(x, P.poly([[sx - 4.5, sy + 2], [sx - 4.5, sy - 22], [sx, sy - 30], [sx + 4.5, sy - 22], [sx + 4.5, sy + 2]]), 0x563c28, { rim: 1, core: 2.6 })
        }
        // braziers
        for (const bx of [cx - 20, cx + 20]) {
          form(x, P.poly([[bx - 6, by - 14], [bx + 6, by - 14], [bx + 3, by - 6], [bx - 3, by - 6]]), 0x3a3634, { rim: 0.8, core: 1.4 })
          line(x, x2 => { x2.moveTo(bx - 3, by - 6); x2.lineTo(bx - 5, by); x2.moveTo(bx + 3, by - 6); x2.lineTo(bx + 5, by) }, 1.4, 0x2a2624, 1)
        }
      },
      over: x => {
        glow(x, cx + 18, by - 102, 6, 0xff7a2e, 0.9)
        fill(x, P.ellipse(cx + 18, by - 102, 2.6, 2), 0xffd24a)
        for (const bx of [cx - 20, cx + 20]) {
          glow(x, bx, by - 20, 14, 0xff7a2e, 0.85)
          fill(x, P.blob([[bx - 5, by - 14], [bx - 2, by - 24], [bx, by - 19], [bx + 3, by - 26], [bx + 5, by - 14]], 0.8), 0xffb040)
          fill(x, P.blob([[bx - 2.5, by - 14], [bx, by - 20], [bx + 2.5, by - 14]], 0.8), 0xfff0b0)
        }
      },
      outline: 2.4,
      grain: 0.14,
    })
  }

  // ---- supply chest ------------------------------------------------------------
  {
    const w = 34, h = 32, cx = w / 2, by = h - 5
    bake(scene, 'chest', w, h, {
      under: x => groundShadow(x, cx + 1, by, 14, 4),
      body: x => {
        form(x, P.round(cx - 12, by - 13, 24, 13, 2), 0x8a5a32, { rim: 1, core: 3 })
        form(x, x2 => { x2.moveTo(cx - 12, by - 13); x2.quadraticCurveTo(cx, by - 25, cx + 12, by - 13); x2.closePath() }, 0x9e6a3a, { rim: 1.2, core: 3 })
        for (const bx of [cx - 8, cx + 6]) fill(x, P.rect(bx, by - 21, 2.4, 21), PAL.gilt)
        form(x, P.round(cx - 3, by - 16, 6, 7, 1), PAL.gilt, { rim: 0.6, core: 1 })
        fill(x, P.circle(cx, by - 12.5, 1), INK)
      },
      outline: 1.5,
    })
  }
}

const cy = (by: number, oy: number) => by + oy
