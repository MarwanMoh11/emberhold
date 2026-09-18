import { Pen, shade } from './draw'
import { PAL } from '../config/palette'
import { rnd, srand } from '../core/math'

export function buildFxTextures(p: Pen) {
  // ---- projectiles ---------------------------------------------------
  {
    const W = 26, H = 8
    p.fill(0x6b4a2a).rect(2, H / 2 - 1, 17, 2)
    p.fill(0xd8dfe8).poly([[17, H / 2 - 3], [26, H / 2], [17, H / 2 + 3]])
    p.fill(PAL.allyAlt).poly([[0, H / 2 - 3.4], [6, H / 2], [0, H / 2 + 3.4]])
    p.bake('proj_arrow', W, H)
  }
  {
    const W = 24, H = 8
    p.fill(0x4a3a2a).rect(2, H / 2 - 1.2, 15, 2.4)
    p.fill(0x8a9f4f).poly([[15, H / 2 - 3.4], [24, H / 2], [15, H / 2 + 3.4]])
    p.fill(0xd8dfe8).poly([[0, H / 2 - 3], [5, H / 2], [0, H / 2 + 3]])
    p.bake('proj_bolt', W, H)
  }
  {
    const W = 22, H = 8
    p.fill(0x7d2a4c).rect(2, H / 2 - 1, 14, 2)
    p.fill(0xe8d8c0).poly([[14, H / 2 - 3], [22, H / 2], [14, H / 2 + 3]])
    p.fill(PAL.enemyArcher).poly([[0, H / 2 - 3], [5, H / 2], [0, H / 2 + 3]])
    p.bake('proj_enemyArrow', W, H)
  }
  {
    const S = 18, c = S / 2
    p.fill(0x1b2029).circle(c, c, 7)
    p.fill(0x3a4048).circle(c, c, 5.6)
    p.fill(0xffffff, 0.5).circle(c - 2, c - 2.4, 1.8)
    p.bake('proj_shell', S, S)
  }
  {
    const S = 18, c = S / 2
    p.fill(PAL.crystal, 0.35).circle(c, c, 8)
    p.fill(PAL.crystal).circle(c, c, 5)
    p.fill(0xffffff, 0.8).circle(c, c, 2.4)
    p.bake('proj_magic', S, S)
  }
  {
    const S = 22, c = S / 2
    p.fill(0x5a4a3a).circle(c, c, 9)
    p.fill(0x7a6a52).circle(c - 2, c - 2, 6)
    p.fill(0x3a3026).circle(c + 3, c + 2, 3)
    p.bake('proj_rock', S, S)
  }


  // ---- hero blade wave ------------------------------------------------
  {
    const W = 40, H = 30
    p.fill(PAL.heroTrim, 0.35)
    p.g.beginPath(); p.g.arc(4, H / 2, 22, -1.05, 1.05, false); p.g.lineTo(4, H / 2); p.g.closePath(); p.g.fillPath()
    p.line(5, PAL.heroTrim, 0.95)
    p.g.beginPath(); p.g.arc(4, H / 2, 21, -0.95, 0.95, false); p.g.strokePath()
    p.line(2, 0xffffff, 1)
    p.g.beginPath(); p.g.arc(4, H / 2, 21, -0.8, 0.8, false); p.g.strokePath()
    p.bake('proj_wave', W, H)
  }

  // ---- soft particles -------------------------------------------------
  const soft = (key: string, colour: number, size: number) => {
    const c = size / 2
    for (let i = 8; i >= 1; i--) {
      p.fill(colour, 0.12 * (1 - i / 9) + 0.06).circle(c, c, (c * i) / 8)
    }
    p.fill(colour, 0.9).circle(c, c, c * 0.3)
    p.bake(key, size, size)
  }
  soft('fx_soft', 0xffffff, 48)
  soft('fx_glow_gold', PAL.gold, 64)
  soft('fx_glow_blue', PAL.heroTrim, 64)
  soft('fx_glow_red', PAL.danger, 64)
  soft('fx_glow_green', PAL.good, 64)
  soft('fx_glow_purple', PAL.crystal, 64)
  soft('fx_glow_fire', 0xff9840, 72)

  // fog brush: builds to fully opaque in the middle so revealed ground is clean
  {
    const S = 480, c = S / 2
    for (let i = 26; i >= 1; i--) {
      p.fill(0xffffff, 0.085).circle(c, c, (c * i) / 26)
    }
    p.fill(0xffffff, 1).circle(c, c, c * 0.42)
    p.bake('fx_fogbrush', S, S)
  }

  // hard dot for blood/dust bursts
  {
    const S = 10, c = S / 2
    p.fill(0xffffff).circle(c, c, c - 0.5)
    p.bake('fx_dot', S, S)
  }
  // square chunk for debris
  {
    const S = 8
    p.fill(0xffffff).rect(0, 0, S, S, 1.5)
    p.bake('fx_chunk', S, S)
  }
  // smoke puff
  {
    const S = 40, c = S / 2
    p.fill(0xffffff, 0.5).circle(c - 6, c + 2, 10)
    p.fill(0xffffff, 0.6).circle(c + 5, c, 11)
    p.fill(0xffffff, 0.75).circle(c, c - 6, 9)
    p.bake('fx_smoke', S, S)
  }
  // slash arc
  {
    const W = 78, H = 78
    p.line(9, 0xffffff, 0.95)
    p.g.beginPath()
    p.g.arc(W / 2, H / 2, 30, -0.9, 0.9, false)
    p.g.strokePath()
    p.line(3.5, 0xffffff, 1)
    p.g.beginPath()
    p.g.arc(W / 2, H / 2, 30, -0.75, 0.75, false)
    p.g.strokePath()
    p.bake('fx_slash', W, H)
  }
  // shockwave ring
  {
    const S = 128, c = S / 2
    p.line(7, 0xffffff, 0.95).ring(c, c, c - 8)
    p.line(2.5, 0xffffff, 0.55).ring(c, c, c - 18)
    p.bake('fx_ring', S, S)
  }
  // targeting reticle for arrow rain
  {
    const S = 128, c = S / 2
    p.line(3, 0xffffff, 0.8).ring(c, c, c - 6)
    p.line(2, 0xffffff, 0.45).ring(c, c, c - 22)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      p.fill(0xffffff, 0.8).rect(c + Math.cos(a) * (c - 6) - 2, c + Math.sin(a) * (c - 6) - 2, 4, 4, 1)
    }
    p.bake('fx_reticle', S, S)
  }
  // burning ground patch
  {
    const S = 96, c = S / 2
    srand(7)
    p.fill(0xff5a1a, 0.5).circle(c, c, c - 6)
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * (c - 14)
      p.fill(0xffb03a, 0.55).circle(c + Math.cos(a) * r, c + Math.sin(a) * r, 6 + rnd() * 9)
    }
    p.fill(0xffd24a, 0.5).circle(c, c, c * 0.42)
    p.bake('fx_fire_patch', S, S)
  }

  // shadow blob
  {
    const W = 40, H = 18
    p.fill(0x0a1408, 0.34).ellipse(W / 2, H / 2, W - 4, H - 4)
    p.fill(0x0a1408, 0.22).ellipse(W / 2, H / 2, W, H)
    p.bake('shadow', W, H)
  }

  // white 1x1 for bars/overlays
  {
    p.fill(0xffffff).rect(0, 0, 4, 4)
    p.bake('px', 4, 4)
  }

  // directional off-screen marker
  {
    const S = 26, c = S / 2
    p.fill(0x000000, 0.35).tri(c, 2.5, S - 2.5, S - 3.5, 2.5, S - 3.5)
    p.fill(0xffffff).tri(c, 3, S - 3, S - 4, 3, S - 4)
    p.bake('fx_marker', S, S)
  }

  // objective arrow that points at the current quest target
  {
    const W = 30, H = 34
    p.fill(0x000000, 0.28).poly([[W / 2, H - 2], [W - 2, H - 16], [W * 0.68, H - 16], [W * 0.68, 3], [W * 0.32, 3], [W * 0.32, H - 16], [2, H - 16]])
    p.fill(PAL.gold).poly([[W / 2, H - 4], [W - 4, H - 17], [W * 0.66, H - 17], [W * 0.66, 4], [W * 0.34, 4], [W * 0.34, H - 17], [4, H - 17]])
    p.fill(shade(PAL.gold, 0.4)).poly([[W / 2, H - 9], [W - 9, H - 18], [W * 0.66, H - 18], [W * 0.66, 6], [W * 0.5, 6]])
    p.bake('fx_objective', W, H)
  }
}
