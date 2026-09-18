import { Pen, shade } from './draw'
import { PAL } from '../config/palette'
import { rnd, srand } from '../core/math'

const T = 128

/** Terrain tiles. Subtle noise so a big field never looks like flat paint. */
export function buildGroundTextures(p: Pen) {
  const tile = (key: string, base: number, specks: number[], count: number, extra?: () => void) => {
    p.fill(base).rect(0, 0, T, T)
    for (let i = 0; i < count; i++) {
      const c = specks[i % specks.length]
      const x = rnd() * T, y = rnd() * T
      p.fill(c, 0.5 + rnd() * 0.4).ellipse(x, y, 5 + rnd() * 20, 4 + rnd() * 12)
    }
    extra?.()
    p.bake(key, T, T)
  }

  srand(424242)
  tile('gr_grass', PAL.grassA, [PAL.grassB, PAL.grassC, shade(PAL.grassA, 0.1)], 70, () => {
    // tufts
    for (let i = 0; i < 26; i++) {
      const x = rnd() * T, y = rnd() * T
      p.fill(shade(PAL.grassB, 0.22), 0.7)
        .rect(x, y, 1.6, 5, 1).rect(x + 3, y + 1, 1.6, 4, 1).rect(x - 3, y + 1.5, 1.6, 4, 1)
    }
  })

  tile('gr_forest', shade(PAL.grassC, -0.12), [0x2f5c2b, 0x376a32, 0x28501f], 80, () => {
    for (let i = 0; i < 18; i++) {
      const x = rnd() * T, y = rnd() * T
      p.fill(0x6b4a2a, 0.35).ellipse(x, y, 10 + rnd() * 8, 3)
    }
  })

  tile('gr_stone', PAL.stoneGround, [0x5f666e, 0x7c848e, 0x545b63], 60, () => {
    for (let i = 0; i < 14; i++) {
      const x = rnd() * T, y = rnd() * T
      p.line(1.4, 0x4c525a, 0.5)
      p.g.beginPath(); p.g.moveTo(x, y); p.g.lineTo(x + 12 + rnd() * 24, y + rnd() * 14 - 7); p.g.strokePath()
    }
  })

  tile('gr_ruins', PAL.ruins, [0x4a4c54, 0x676a73, 0x3e4048], 55, () => {
    for (let i = 0; i < 8; i++) {
      const x = rnd() * T, y = rnd() * T
      p.fill(0x7b7e88, 0.55).rect(x, y, 14 + rnd() * 16, 8 + rnd() * 8, 2)
    }
    for (let i = 0; i < 20; i++) {
      const x = rnd() * T, y = rnd() * T
      p.fill(0x6f8a5a, 0.3).ellipse(x, y, 8 + rnd() * 10, 5)
    }
  })

  tile('gr_dirt', PAL.dirt, [0x7a5c3c, 0x9b7a52, 0x6d5134], 70)

  tile('gr_ash', 0x4a4038, [0x3a322c, 0x5a4e44, 0x2e2822], 70, () => {
    for (let i = 0; i < 14; i++) {
      const x = rnd() * T, y = rnd() * T
      p.fill(0xff6a2a, 0.16).circle(x, y, 4 + rnd() * 9)
    }
  })

  tile('gr_field', 0x8a7444, [0x9c8450, 0x7a643a], 50, () => {
    for (let i = 0; i < 9; i++) {
      p.fill(0x6d5a34, 0.45).rect(0, i * 14 + 4, T, 5)
    }
  })

  // path overlay strip (drawn on top of grass)
  {
    p.fill(PAL.path, 0.85).rect(0, 0, T, T)
    for (let i = 0; i < 40; i++) {
      const x = rnd() * T, y = rnd() * T
      p.fill(shade(PAL.path, -0.15), 0.6).ellipse(x, y, 6 + rnd() * 14, 4 + rnd() * 8)
    }
    p.bake('gr_path', T, T)
  }
}
