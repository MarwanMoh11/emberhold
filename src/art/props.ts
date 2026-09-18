import { Pen, shade } from './draw'
import { PAL } from '../config/palette'
import { srand } from '../core/math'

export function buildPropTextures(p: Pen) {
  srand(90210)

  // ---- trees (3 variants + a stump) ---------------------------------
  const greens = [0x3f7d3a, 0x4a8f45, 0x35702f]
  for (let v = 0; v < 3; v++) {
    const W = 66, H = 86, cx = W / 2, by = H - 8
    p.fill(0x000000, 0.22).ellipse(cx, by, 34, 12)
    p.fill(0x6b4a2a).rect(cx - 5, by - 26, 10, 26, 2)
    p.fill(shade(0x6b4a2a, 0.18)).rect(cx - 5, by - 26, 4, 26, 2)
    const g = greens[v]
    p.fill(shade(g, -0.3)).circle(cx, by - 42, 25)
    p.fill(g).circle(cx - 8, by - 46, 20)
    p.fill(shade(g, 0.16)).circle(cx - 4, by - 54, 14)
    p.fill(shade(g, 0.28)).circle(cx - 9, by - 58, 8)
    p.fill(shade(g, -0.15)).circle(cx + 15, by - 40, 13)
    p.bake(`tree${v}`, W, H)
  }
  {
    const W = 44, H = 34, cx = W / 2, by = H - 6
    p.fill(0x000000, 0.2).ellipse(cx, by, 26, 10)
    p.fill(0x5a4020).ellipse(cx, by - 8, 26, 14)
    p.fill(shade(0x8a6a45, 0.1)).ellipse(cx, by - 11, 21, 10)
    p.fill(0x6b4a2a, 0.6).ring(cx, by - 11, 6)
    p.line(1.4, 0x5a4020).ring(cx, by - 11, 6)
    p.bake('stump', W, H)
  }

  // ---- rocks --------------------------------------------------------
  for (let v = 0; v < 2; v++) {
    const W = 60, H = 58, cx = W / 2, by = H - 8
    p.fill(0x000000, 0.22).ellipse(cx, by, 34, 12)
    const base = v === 0 ? PAL.stoneDark : shade(PAL.stoneDark, -0.12)
    p.fill(base).poly([[cx - 22, by], [cx - 18, by - 22], [cx - 4, by - 32], [cx + 14, by - 26], [cx + 22, by - 8], [cx + 18, by]])
    p.fill(shade(base, 0.26)).poly([[cx - 18, by - 22], [cx - 4, by - 32], [cx + 6, by - 24], [cx - 8, by - 16]])
    p.fill(shade(base, -0.2)).poly([[cx + 6, by - 24], [cx + 14, by - 26], [cx + 22, by - 8], [cx + 10, by - 10]])
    if (v === 1) { p.fill(0x6f8a5a, 0.55).ellipse(cx - 10, by - 28, 14, 6) }
    p.bake(`rock${v}`, W, H)
  }

  // ---- ore seam -----------------------------------------------------
  {
    const W = 60, H = 58, cx = W / 2, by = H - 8
    p.fill(0x000000, 0.22).ellipse(cx, by, 34, 12)
    p.fill(0x50463c).poly([[cx - 22, by], [cx - 16, by - 24], [cx + 2, by - 32], [cx + 20, by - 20], [cx + 20, by]])
    p.fill(shade(0x50463c, 0.2)).poly([[cx - 16, by - 24], [cx + 2, by - 32], [cx + 6, by - 20], [cx - 10, by - 16]])
    p.fill(PAL.metal, 0.95).circle(cx - 6, by - 20, 4).circle(cx + 6, by - 24, 3.4).circle(cx + 3, by - 12, 3)
    p.fill(0xffffff, 0.6).circle(cx - 7, by - 21.5, 1.5).circle(cx + 5, by - 25, 1.2)
    p.bake('ore0', W, H)
  }

  // ---- crystal cluster ---------------------------------------------
  {
    const W = 56, H = 62, cx = W / 2, by = H - 8
    p.fill(PAL.crystal, 0.2).ellipse(cx, by - 12, 48, 34)
    p.fill(0x000000, 0.2).ellipse(cx, by, 28, 10)
    p.fill(0x3e3050).poly([[cx - 18, by], [cx - 12, by - 10], [cx + 12, by - 10], [cx + 18, by]])
    const spike = (x: number, h: number, w: number) => {
      p.fill(shade(PAL.crystal, -0.25)).poly([[x - w, by - 8], [x, by - 8 - h], [x + w, by - 8]])
      p.fill(PAL.crystal).poly([[x - w, by - 8], [x, by - 8 - h], [x - w * 0.1, by - 8]])
      p.fill(0xffffff, 0.55).poly([[x - w * 0.5, by - 12], [x, by - 10 - h], [x - w * 0.1, by - 12]])
    }
    spike(cx - 9, 22, 6); spike(cx + 9, 18, 5); spike(cx, 34, 7)
    p.bake('crystal0', W, H)
  }

  // ---- resource pickups --------------------------------------------
  const pickup = (key: string, colour: number, shape: 'coin' | 'log' | 'sheaf' | 'block' | 'ingot' | 'gem') => {
    const S = 22, c = S / 2
    p.fill(0x000000, 0.18).ellipse(c, S - 3, 13, 5)
    switch (shape) {
      case 'coin':
        p.fill(shade(colour, -0.3)).circle(c, c + 1, 8)
        p.fill(colour).circle(c, c, 8)
        p.fill(shade(colour, 0.35)).circle(c, c, 5.4)
        p.fill(shade(colour, -0.2)).rect(c - 1.6, c - 3.6, 3.2, 7.2, 1)
        p.fill(0xffffff, 0.75).circle(c - 3, c - 3.4, 1.8)
        break
      case 'log':
        p.fill(shade(colour, -0.35)).rect(c - 9, c - 4, 18, 9, 4)
        p.fill(colour).rect(c - 9, c - 4, 18, 5, 3)
        p.fill(shade(colour, 0.3)).ellipse(c + 8, c + 0.5, 6, 9)
        p.fill(shade(colour, -0.35)).ellipse(c + 8, c + 0.5, 2.6, 4)
        break
      case 'sheaf':
        p.fill(shade(colour, -0.25)).poly([[c - 7, c + 7], [c - 3, c - 8], [c + 3, c - 8], [c + 7, c + 7]])
        p.fill(colour).poly([[c - 7, c + 7], [c - 3, c - 8], [c, c - 8], [c - 1, c + 7]])
        p.fill(shade(colour, 0.4)).circle(c - 3, c - 8, 2).circle(c + 2, c - 7, 2)
        p.fill(0x8a6a45).rect(c - 7, c + 1, 14, 3, 1)
        break
      case 'block':
        p.fill(shade(colour, -0.35)).poly([[c - 8, c + 6], [c - 8, c - 2], [c, c - 7], [c + 8, c - 2], [c + 8, c + 6], [c, c + 9]])
        p.fill(colour).poly([[c - 8, c - 2], [c, c - 7], [c + 8, c - 2], [c, c + 3]])
        p.fill(shade(colour, -0.15)).poly([[c, c + 3], [c + 8, c - 2], [c + 8, c + 6], [c, c + 9]])
        break
      case 'ingot':
        p.fill(shade(colour, -0.4)).poly([[c - 9, c + 6], [c - 6, c - 2], [c + 6, c - 2], [c + 9, c + 6]])
        p.fill(colour).poly([[c - 6, c - 2], [c + 6, c - 2], [c + 7, c + 1], [c - 7, c + 1]])
        p.fill(0xffffff, 0.7).rect(c - 4, c - 1.4, 7, 1.6, 1)
        break
      case 'gem':
        p.fill(colour, 0.28).circle(c, c, 11)
        p.fill(shade(colour, -0.3)).poly([[c - 6, c - 1], [c, c - 9], [c + 6, c - 1], [c, c + 9]])
        p.fill(colour).poly([[c - 6, c - 1], [c, c - 9], [c, c + 9]])
        p.fill(0xffffff, 0.75).poly([[c - 3, c - 2], [c, c - 7], [c, c - 1]])
        break
    }
    p.bake(key, S, S)
  }
  pickup('res_coins', PAL.coins, 'coin')
  pickup('res_wood', PAL.wood, 'log')
  pickup('res_food', PAL.food, 'sheaf')
  pickup('res_stone', PAL.stone, 'block')
  pickup('res_metal', PAL.metal, 'ingot')
  pickup('res_crystal', PAL.crystal, 'gem')

  // xp mote
  {
    const S = 16, c = S / 2
    p.fill(PAL.xp, 0.25).circle(c, c, 7)
    p.fill(PAL.xp).poly([[c, c - 6], [c + 4, c], [c, c + 6], [c - 4, c]])
    p.fill(0xffffff, 0.8).poly([[c, c - 4], [c + 2, c], [c, c + 2], [c - 2, c]])
    p.bake('res_xp', S, S)
  }

  // heart pickup (from healing drops)
  {
    const S = 20, c = S / 2
    p.fill(shade(0xff5a7a, -0.3)).circle(c - 3, c - 2, 4.6).circle(c + 3, c - 2, 4.6)
    p.fill(shade(0xff5a7a, -0.3)).tri(c - 7, c, c + 7, c, c, c + 8)
    p.fill(0xff5a7a).circle(c - 3, c - 3, 4).circle(c + 3, c - 3, 4)
    p.fill(0xff5a7a).tri(c - 6.5, c - 1, c + 6.5, c - 1, c, c + 6.5)
    p.fill(0xffffff, 0.65).circle(c - 3.5, c - 4, 1.4)
    p.bake('res_heart', S, S)
  }

  // ---- enemy warcamp (a stationary objective, drawn like a structure) ----
  {
    const W = 150, H = 130, cx = W / 2, by = H - 10
    p.fill(0x000000, 0.22).ellipse(cx, by, 118, 34)
    p.fill(0x4a3a2c).ellipse(cx, by - 6, 112, 36)
    // palisade ring
    for (let i = 0; i < 11; i++) {
      const a = Math.PI * (0.08 + (i / 10) * 0.84)
      const sx = cx - Math.cos(a) * 56
      const sy = by - 16 - Math.sin(a) * 12
      p.fill(0x5a4020).rect(sx - 4, sy - 30, 8, 32, 1)
      p.fill(shade(0x5a4020, 0.2)).rect(sx - 4, sy - 30, 3, 32, 1)
      p.fill(0x3a2a18).tri(sx - 4, sy - 30, sx + 4, sy - 30, sx, sy - 38)
    }
    // tents
    const tent = (tx: number, ty: number, s2: number, c: number) => {
      p.fill(shade(c, -0.3)).poly([[tx - 22 * s2, ty], [tx, ty - 30 * s2], [tx + 22 * s2, ty]])
      p.fill(c).poly([[tx - 22 * s2, ty], [tx, ty - 30 * s2], [tx - 3 * s2, ty]])
      p.fill(0x1a1208).poly([[tx - 7 * s2, ty], [tx, ty - 15 * s2], [tx + 7 * s2, ty]])
    }
    tent(cx - 30, by - 22, 1, 0x7d3a2a)
    tent(cx + 28, by - 20, 0.9, 0x6d3224)
    tent(cx, by - 40, 1.15, 0x8a4430)
    // banner pole with the horde mark
    p.fill(0x3a2a18).rect(cx - 2, by - 104, 5, 64)
    p.fill(0xb03a2a).poly([[cx + 3, by - 104], [cx + 34, by - 96], [cx + 3, by - 76]])
    p.fill(0x2a0d0d).circle(cx + 15, by - 92, 5)
    // cookfire
    p.fill(0xff7a2a, 0.9).circle(cx + 46, by - 14, 9)
    p.fill(0xffd24a, 0.95).circle(cx + 46, by - 17, 5)
    p.bake('enm_camp', W, H)
  }

  // chest
  {
    const W = 30, H = 26, cx = W / 2, by = H - 4
    p.fill(0x000000, 0.2).ellipse(cx, by, 20, 7)
    p.fill(shade(PAL.wood, -0.3)).rect(cx - 12, by - 13, 24, 13, 2)
    p.fill(PAL.wood).rect(cx - 12, by - 13, 24, 6, 2)
    p.fill(shade(PAL.wood, -0.45)).poly([[cx - 12, by - 13], [cx - 10, by - 21], [cx + 10, by - 21], [cx + 12, by - 13]])
    p.fill(PAL.gold).rect(cx - 13, by - 14, 26, 3, 1).rect(cx - 3, by - 16, 6, 8, 1)
    p.fill(0x3a2a18).circle(cx, by - 11, 1.6)
    p.bake('chest', W, H)
  }
}
