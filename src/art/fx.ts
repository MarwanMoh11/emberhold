import type Phaser from 'phaser'
import { PAL } from '../config/palette'
import { bake, css, fill, form, glow, line, makeCanvas, P, register, Rng, INK, type Ctx } from './ink'

/**
 * Effects: what flies, what bursts, what marks the ground.
 *
 * Anything that gets tinted at runtime is painted in white or near-white so
 * the tint decides its colour; anything with a fixed identity (an arrow, a
 * shell) is painted in full colour and inked like the rest of the world.
 */

/** A soft round glow, white, for tinting. */
function soft(scene: Phaser.Scene, key: string, colour: number, size: number) {
  const c = size / 2
  const [canvas, x] = makeCanvas(size, size)
  const g = x.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, css(colour, 1))
  g.addColorStop(0.3, css(colour, 0.6))
  g.addColorStop(0.65, css(colour, 0.18))
  g.addColorStop(1, css(colour, 0))
  x.fillStyle = g
  x.fillRect(0, 0, size, size)
  register(scene, key, canvas)
}

/** A calligraphic arc: fat in the middle, tapering to hairlines at both ends. */
function brushArc(x: Ctx, cx: number, cy: number, r: number, a0: number, a1: number, width: number, c: number, alpha = 1) {
  const n = 28
  x.beginPath()
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = a0 + (a1 - a0) * t
    const w = Math.sin(t * Math.PI) * width / 2
    const px = cx + Math.cos(a) * (r + w), py = cy + Math.sin(a) * (r + w)
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py)
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n
    const a = a0 + (a1 - a0) * t
    const w = Math.sin(t * Math.PI) * width / 2
    x.lineTo(cx + Math.cos(a) * (r - w), cy + Math.sin(a) * (r - w))
  }
  x.closePath()
  x.fillStyle = css(c, alpha)
  x.fill()
}

export function buildFxTextures(scene: Phaser.Scene) {
  const r = new Rng(777)

  // ---- projectiles -----------------------------------------------------
  bake(scene, 'proj_arrow', 30, 10, {
    body: x => {
      line(x, xx => { xx.moveTo(4, 5); xx.lineTo(22, 5) }, 1.8, 0x8a5a32, 1)
      form(x, P.poly([[21, 2], [29, 5], [21, 8]]), 0xd8dfe8, { rim: 0.5, core: 0.8 })
      fill(x, P.poly([[2, 1.5], [9, 5], [2, 8.5], [5, 5]]), PAL.bone)
      fill(x, P.poly([[3, 3.6], [8, 5], [3, 6.4]]), PAL.lapis)
    },
    outline: 1,
    grain: 0,
  })
  bake(scene, 'proj_bolt', 26, 10, {
    body: x => {
      line(x, xx => { xx.moveTo(4, 5); xx.lineTo(18, 5) }, 2.4, 0x5a3a22, 1)
      form(x, P.poly([[17, 1.5], [25, 5], [17, 8.5]]), 0x9aa4ad, { rim: 0.5, core: 1 })
      fill(x, P.poly([[2, 2], [7, 5], [2, 8]]), 0x7d8f45)
    },
    outline: 1,
    grain: 0,
  })
  bake(scene, 'proj_enemyArrow', 28, 12, {
    body: x => {
      line(x, xx => { xx.moveTo(4, 6); xx.lineTo(19, 6) }, 1.8, 0x2a2024, 1)
      form(x, P.poly([[18, 2.5], [26, 6], [18, 9.5]]), 0xe8dcc0, { rim: 0.4, core: 0.8 })
      fill(x, P.poly([[2, 2.5], [8, 6], [2, 9.5]]), 0x3a2c30)
    },
    over: x => glow(x, 22, 6, 6, PAL.enemyArcher, 0.7),
    outline: 1,
    grain: 0,
  })
  bake(scene, 'proj_shell', 22, 22, {
    body: x => {
      form(x, P.circle(11, 12, 7), 0x3a3e44, { rim: 1.4, core: 3, light: 0x9aa4ad })
      line(x, xx => { xx.moveTo(14, 7); xx.quadraticCurveTo(17, 3, 19, 4) }, 1.4, 0x6e4a2e, 1)
    },
    over: x => { glow(x, 19, 4, 5, 0xffb040, 0.95); fill(x, P.circle(19, 4, 1.2), 0xfff4c8) },
    outline: 1.2,
    grain: 0,
  })
  {
    const [c, x] = makeCanvas(22, 22)
    glow(x, 11, 11, 11, 0xffffff, 0.6)
    fill(x, P.circle(11, 11, 4.2), 0xffffff)
    register(scene, 'proj_magic', c)
  }
  bake(scene, 'proj_rock', 26, 26, {
    body: x => {
      form(x, P.blob([[4, 14], [7, 6], [15, 3], [22, 8], [23, 17], [15, 23], [7, 21]], 0.5), 0x5a4e46, { rim: 1.6, core: 4, hatch: 0.2 })
      line(x, xx => { xx.moveTo(9, 9); xx.lineTo(13, 15); xx.lineTo(19, 12) }, 0.8, INK, 0.5)
    },
    outline: 1.4,
    grain: 0.1,
  })

  // ---- the hero's blade wave: a stroke of ward-light, tinted at runtime ----
  {
    const W = 46, H = 40
    const [c, x] = makeCanvas(W, H)
    glow(x, 16, H / 2, 20, 0xffffff, 0.35)
    brushArc(x, 2, H / 2, 22, -1.05, 1.05, 11, 0xffffff, 0.5)
    brushArc(x, 3, H / 2, 22, -0.95, 0.95, 6, 0xffffff, 1)
    brushArc(x, 5, H / 2, 21, -0.7, 0.7, 2.4, 0xffffff, 1)
    register(scene, 'proj_wave', c)
  }

  // ---- soft particles and glows ------------------------------------------
  soft(scene, 'fx_soft', 0xffffff, 48)
  soft(scene, 'fx_glow_gold', PAL.gold, 64)
  soft(scene, 'fx_glow_blue', PAL.heroTrim, 64)
  soft(scene, 'fx_glow_red', PAL.danger, 64)
  soft(scene, 'fx_glow_green', PAL.good, 64)
  soft(scene, 'fx_glow_purple', PAL.crystal, 64)
  soft(scene, 'fx_glow_fire', 0xff9840, 72)

  // fog brush: fully clear in the middle, with a ragged, bleeding edge — the
  // way ink runs into damp paper — so revealed ground never has a compass-drawn rim
  {
    const S = 480, c = S / 2
    const [canvas, x] = makeCanvas(S, S)
    const img = x.createImageData(S, S)
    const wob = Array.from({ length: 24 }, () => r.range(0.86, 1.08))
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const dx = i - c, dy = j - c
        const d = Math.hypot(dx, dy) / c
        const a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) * wob.length
        const i0 = Math.floor(a) % wob.length, i1 = (i0 + 1) % wob.length
        const f = a - Math.floor(a)
        const edge = wob[i0] + (wob[i1] - wob[i0]) * (f * f * (3 - 2 * f))
        const e = d / edge
        const v = e < 0.45 ? 1 : e > 1 ? 0 : Math.pow(1 - (e - 0.45) / 0.55, 1.6)
        const q = (j * S + i) * 4
        img.data[q] = 255; img.data[q + 1] = 255; img.data[q + 2] = 255
        img.data[q + 3] = Math.round(v * 255)
      }
    }
    x.putImageData(img, 0, 0)
    register(scene, 'fx_fogbrush', canvas)
  }

  // a round mote for sparks and embers
  {
    const [c, x] = makeCanvas(10, 10)
    glow(x, 5, 5, 5, 0xffffff, 1)
    fill(x, P.circle(5, 5, 2.4), 0xffffff)
    register(scene, 'fx_dot', c)
  }
  // an ash flake for debris: the horde crumbles, it does not bleed
  {
    const [c, x] = makeCanvas(10, 10)
    fill(x, P.poly([[1, 4], [5, 1], [9, 3], [8, 8], [3, 9]]), 0xffffff)
    register(scene, 'fx_chunk', c)
  }
  // a puff of smoke or dust
  {
    const S = 40
    const [c, x] = makeCanvas(S, S)
    for (const [px, py, rr] of [[14, 22, 10], [25, 20, 11], [20, 13, 9], [19, 24, 9]]) glow(x, px, py, rr * 1.4, 0xffffff, 0.55)
    register(scene, 'fx_smoke', c)
  }
  // a slash: one fat brushstroke, white for tinting
  {
    const S = 80
    const [c, x] = makeCanvas(S, S)
    brushArc(x, S / 2, S / 2, 30, -1.0, 1.0, 13, 0xffffff, 0.4)
    brushArc(x, S / 2, S / 2, 30, -0.9, 0.9, 7, 0xffffff, 1)
    register(scene, 'fx_slash', c)
  }
  // a shockwave ring, drawn as two brush circles
  {
    const S = 128, c = S / 2
    const [canvas, x] = makeCanvas(S, S)
    x.lineCap = 'round'
    x.strokeStyle = css(0xffffff, 0.95); x.lineWidth = 6
    x.beginPath(); x.arc(c, c, c - 8, 0, Math.PI * 2); x.stroke()
    x.strokeStyle = css(0xffffff, 0.45); x.lineWidth = 2
    x.setLineDash([10, 7])
    x.beginPath(); x.arc(c, c, c - 18, 0, Math.PI * 2); x.stroke()
    register(scene, 'fx_ring', canvas)
  }
  // targeting reticle for arrow rain: a surveyor's mark
  {
    const S = 128, c = S / 2
    const [canvas, x] = makeCanvas(S, S)
    x.strokeStyle = css(0xffffff, 0.85); x.lineWidth = 3
    x.beginPath(); x.arc(c, c, c - 6, 0, Math.PI * 2); x.stroke()
    x.strokeStyle = css(0xffffff, 0.45); x.lineWidth = 1.6
    x.setLineDash([6, 6])
    x.beginPath(); x.arc(c, c, c - 22, 0, Math.PI * 2); x.stroke()
    x.setLineDash([])
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      fill(x, P.poly([[c + Math.cos(a) * (c - 2), c + Math.sin(a) * (c - 2)], [c + Math.cos(a + 0.08) * (c - 16), c + Math.sin(a + 0.08) * (c - 16)], [c + Math.cos(a - 0.08) * (c - 16), c + Math.sin(a - 0.08) * (c - 16)]]), 0xffffff, 0.9)
    }
    register(scene, 'fx_reticle', canvas)
  }
  // burning ground: tongues of flame over a charred patch
  {
    const S = 96, c = S / 2
    const [canvas, x] = makeCanvas(S, S)
    glow(x, c, c, c, 0xff5a1a, 0.55)
    for (let i = 0; i < 14; i++) {
      const a = r.range(0, Math.PI * 2), d = r.range(0, c - 16)
      const px = c + Math.cos(a) * d, py = c + Math.sin(a) * d
      const h = r.range(8, 16)
      fill(x, P.blob([[px - 4, py + 3], [px - 2, py - h * 0.6], [px, py - h], [px + 2, py - h * 0.5], [px + 4, py + 3]], 0.8), 0xffa040, 0.75)
      fill(x, P.blob([[px - 2, py + 2], [px, py - h * 0.55], [px + 2, py + 2]], 0.8), 0xfff0b0, 0.8)
    }
    register(scene, 'fx_fire_patch', canvas)
  }

  // ground shadow: warm, soft, a little heavier at the core
  {
    const W = 40, H = 18
    const [canvas, x] = makeCanvas(W, H)
    x.save()
    x.translate(W / 2, H / 2); x.scale(1, H / W); x.translate(-W / 2, -H / 2)
    const g = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2)
    g.addColorStop(0, css(0x1a1008, 0.42)); g.addColorStop(0.6, css(0x1a1008, 0.26)); g.addColorStop(1, css(0x1a1008, 0))
    x.fillStyle = g
    x.beginPath(); x.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); x.fill()
    x.restore()
    register(scene, 'shadow', canvas)
  }

  // white square for bars and overlays
  {
    const [c, x] = makeCanvas(4, 4)
    x.fillStyle = '#fff'; x.fillRect(0, 0, 4, 4)
    register(scene, 'px', c)
  }

  // off-screen threat marker: a pennant-shaped arrowhead, white for tinting
  bake(scene, 'fx_marker', 28, 28, {
    body: x => {
      fill(x, P.poly([[14, 3], [24, 22], [14, 17], [4, 22]]), 0xffffff)
    },
    outline: 1.6,
    grain: 0,
  })

  // the objective arrow: a gilt pointer, baked tip-down
  bake(scene, 'fx_objective', 32, 38, {
    under: x => glow(x, 16, 20, 16, PAL.gold, 0.35),
    body: x => {
      const path = P.poly([[16, 34], [28, 20], [21, 20], [21, 5], [11, 5], [11, 20], [4, 20]])
      form(x, path, PAL.gilt, { rim: 1.4, core: 3, light: 0xfff0b0 })
      fill(x, P.poly([[16, 10], [18.5, 14], [16, 18], [13.5, 14]]), PAL.wax)
    },
    outline: 1.6,
    grain: 0,
  })
}
