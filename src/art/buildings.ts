import { Pen, shade } from './draw'
import { PAL } from '../config/palette'
import { BUILDINGS, type BuildingKey } from '../config/buildings'

const WL = PAL.woodLight, WD = PAL.woodDark
const SL = PAL.stoneLight, SD = PAL.stoneDark

/** Dirt pad every structure sits on, so buildings never look like floating stickers. */
function plinth(p: Pen, cx: number, by: number, w: number, tone = 0x6a5236) {
  p.fill(shade(tone, -0.25), 0.55).ellipse(cx, by + 3, w * 1.12, w * 0.32)
  p.fill(tone, 0.85).ellipse(cx, by, w * 1.04, w * 0.28)
}

function gable(p: Pen, cx: number, topY: number, w: number, h: number, c: number) {
  p.fill(shade(c, -0.22)).poly([[cx - w / 2 - 4, topY + h], [cx, topY], [cx + w / 2 + 4, topY + h]])
  p.fill(c).poly([[cx - w / 2 - 4, topY + h], [cx, topY], [cx + 2, topY + h]])
}

function flag(p: Pen, x: number, y: number, h: number, c: number) {
  p.fill(0x4a3320).rect(x - 1, y - h, 2, h)
  p.fill(c).poly([[x + 1, y - h], [x + 11, y - h + 4], [x + 1, y - h + 8]])
}

function windows(p: Pen, cx: number, y: number, count: number, gap: number, w = 5, h = 6) {
  const start = cx - ((count - 1) * gap) / 2
  for (let i = 0; i < count; i++) {
    p.fill(0x2a1f14).rect(start + i * gap - w / 2, y, w, h, 1)
    p.fill(0xffc76a, 0.85).rect(start + i * gap - w / 2 + 1, y + 1, w - 2, h - 2, 1)
  }
}

function logPile(p: Pen, x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 3), col = i % 3
    const lx = x + col * 9 - row * 4.5, ly = y - row * 7
    p.fill(WD).circle(lx, ly, 4.4)
    p.fill(shade(WL, 0.12)).circle(lx, ly, 3)
    p.fill(shade(WD, -0.2)).circle(lx, ly, 1.2)
  }
}

type Draw = (p: Pen, lvl: number, W: number, H: number, cx: number, by: number) => void

const DRAW: Record<BuildingKey, Draw> = {
  townHall: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 62, lvl >= 3 ? 0x6f7680 : 0x6a5236)
    if (lvl <= 1) {
      // ember tent: canvas lean-to with a fire out front
      p.fill(0x8a6a45).rect(cx - 34, by - 26, 68, 26, 3)
      p.fill(0xcfc0a4).poly([[cx - 40, by - 24], [cx, by - 58], [cx + 40, by - 24]])
      p.fill(shade(0xcfc0a4, -0.2)).poly([[cx + 2, by - 56], [cx + 40, by - 24], [cx + 8, by - 24]])
      p.fill(0x2a1f14).poly([[cx - 10, by], [cx - 10, by - 22], [cx + 10, by - 22], [cx + 10, by]])
      p.fill(0xff9840, 0.9).circle(cx - 44, by - 6, 7)
      p.fill(0xffd24a).circle(cx - 44, by - 8, 4)
      flag(p, cx, by - 58, 16, PAL.banner)
      return
    }
    const stone = lvl >= 3
    const wallC = stone ? SL : WL
    const bw = 40 + lvl * 8
    const bh = 26 + lvl * 3
    // side towers from level 4
    if (lvl >= 4) {
      for (const sx of [cx - bw / 2 - 10, cx + bw / 2 + 10]) {
        p.fill(shade(SD, -0.1)).rect(sx - 10, by - bh - 22, 20, bh + 22, 2)
        p.fill(SL).rect(sx - 10, by - bh - 22, 20, (bh + 22) * 0.5, 2)
        p.fill(shade(SD, -0.3)).rect(sx - 12, by - bh - 30, 24, 8, 1)
        flag(p, sx, by - bh - 30, 14, lvl >= 5 ? PAL.gold : PAL.banner)
      }
    }
    p.fill(shade(wallC, -0.25)).rect(cx - bw / 2, by - bh, bw, bh, 3)
    p.fill(wallC).rect(cx - bw / 2, by - bh, bw, bh * 0.52, 3)
    if (stone) {
      p.fill(shade(SD, -0.15)).rect(cx - bw / 2, by - 8, bw, 8, 2)
      for (let i = 0; i < 5; i++) p.fill(shade(SL, -0.12)).rect(cx - bw / 2 + 4 + i * (bw / 5), by - bh + 3, bw / 5 - 5, 4, 1)
    }
    gable(p, cx, by - bh - 22, bw + 8, 24, lvl >= 4 ? 0x4f7fb5 : PAL.roofA)
    windows(p, cx, by - bh * 0.62, Math.min(5, 2 + lvl), 13)
    p.fill(0x3a2a18).rect(cx - 8, by - 20, 16, 20, 2)
    p.fill(PAL.gold, 0.9).circle(cx, by - 12, 2)
    flag(p, cx, by - bh - 22, 20, lvl >= 5 ? PAL.gold : PAL.banner)
    if (lvl >= 5) {
      p.fill(PAL.crystal, 0.9).circle(cx, by - bh - 46, 6)
      p.fill(0xffffff, 0.6).circle(cx - 1.5, by - bh - 48, 2)
    }
  },

  depot: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 44)
    p.fill(shade(WD, -0.2)).rect(cx - 30, by - 8, 60, 8, 1)
    // crate stack
    const rows = 1 + lvl
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 3 - (r % 2); c++) {
        const x = cx - 22 + c * 16 + (r % 2) * 8
        const y = by - 10 - r * 14
        p.fill(shade(WL, -0.28)).rect(x, y - 13, 15, 13, 2)
        p.fill(WL).rect(x, y - 13, 15, 6, 2)
        p.fill(shade(WD, -0.1)).rect(x, y - 8, 15, 2)
        p.fill(shade(WD, -0.1)).rect(x + 6.5, y - 13, 2, 13)
      }
    }
    // awning
    p.fill(PAL.banner, 0.9).poly([[cx - 34, by - 10 - rows * 14], [cx + 34, by - 10 - rows * 14], [cx + 28, by - 18 - rows * 14], [cx - 28, by - 18 - rows * 14]])
    if (lvl >= 2) flag(p, cx + 30, by - 10 - rows * 14, 14, PAL.banner)
  },

  lumberCamp: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 44)
    // open shed
    p.fill(WD).rect(cx - 26, by - 30, 4, 30).rect(cx + 22, by - 30, 4, 30)
    p.fill(shade(WD, -0.3)).rect(cx - 30, by - 36, 60, 8, 2)
    p.fill(WL).rect(cx - 30, by - 36, 60, 4, 2)
    logPile(p, cx - 18, by - 5, 3 + lvl * 2)
    // sawhorse + axe in a stump
    p.fill(shade(WL, -0.1)).rect(cx + 6, by - 14, 18, 5, 1)
    p.fill(WD).rect(cx + 8, by - 10, 3, 10).rect(cx + 19, by - 10, 3, 10)
    p.fill(0x5a4020).circle(cx + 24, by - 4, 5)
    p.fill(0xd8dfe8).poly([[cx + 24, by - 8], [cx + 31, by - 14], [cx + 33, by - 10], [cx + 26, by - 6]])
    if (lvl >= 3) { p.fill(shade(WL, -0.1)).rect(cx - 32, by - 52, 64, 16, 2); gable(p, cx, by - 62, 64, 12, PAL.roofA) }
  },

  farm: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 48, 0x7a5f38)
    // ploughed rows
    for (let i = 0; i < 4; i++) {
      p.fill(shade(0x8a6a45, -0.1)).ellipse(cx - 24 + i * 16, by - 4, 13, 8)
      if (lvl >= 1) {
        for (let k = 0; k < 3; k++) {
          const gx = cx - 27 + i * 16 + k * 4
          p.fill(PAL.food).rect(gx, by - 14 - (k % 2), 2, 10, 1)
          p.fill(shade(PAL.food, 0.3)).circle(gx + 1, by - 15 - (k % 2), 1.8)
        }
      }
    }
    // barn
    p.fill(shade(PAL.roofA, -0.2)).rect(cx + 18, by - 28, 26, 28, 2)
    p.fill(PAL.roofA).rect(cx + 18, by - 28, 26, 13, 2)
    gable(p, cx + 31, by - 40, 30, 14, shade(PAL.roofA, -0.3))
    p.fill(0x3a2a18).rect(cx + 27, by - 16, 9, 16, 1)
    if (lvl >= 2) { p.fill(shade(0xd9c58a, -0.15)).circle(cx - 34, by - 9, 9); p.fill(0xd9c58a).circle(cx - 34, by - 11, 7) }
    if (lvl >= 3) flag(p, cx + 31, by - 40, 12, PAL.food)
  },

  quarry: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 48, 0x6f7680)
    p.fill(shade(SD, -0.2)).ellipse(cx, by - 6, 62, 22)
    for (let i = 0; i < 3 + lvl; i++) {
      const bx = cx - 26 + (i % 4) * 15, byy = by - 12 - Math.floor(i / 4) * 12
      p.fill(shade(SD, -0.1)).rect(bx, byy - 12, 14, 12, 1)
      p.fill(SL).rect(bx, byy - 12, 14, 6, 1)
    }
    // crane
    p.fill(WD).rect(cx + 22, by - 44, 4, 44)
    p.fill(WD).rect(cx + 2, by - 46, 26, 4)
    p.fill(0x3a3a3a).rect(cx + 3, by - 42, 1.5, 12)
    p.fill(SL).rect(cx - 2, by - 30, 11, 9, 1)
    if (lvl >= 2) flag(p, cx + 24, by - 46, 12, PAL.stoneLight)
  },

  mine: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 48, 0x5a4a3a)
    p.fill(shade(0x4a3f34, -0.2)).ellipse(cx, by - 14, 66, 34)
    // shaft mouth
    p.fill(0x120d09).poly([[cx - 18, by - 4], [cx - 14, by - 28], [cx + 14, by - 28], [cx + 18, by - 4]])
    p.fill(WD).rect(cx - 22, by - 30, 44, 5, 1).rect(cx - 20, by - 30, 5, 28).rect(cx + 15, by - 30, 5, 28)
    // ore cart
    p.fill(0x4a4f57).rect(cx + 20, by - 14, 18, 11, 2)
    p.fill(PAL.metal).circle(cx + 25, by - 15, 3).circle(cx + 32, by - 16, 2.6)
    p.fill(0x2a2f36).circle(cx + 24, by - 2, 3).circle(cx + 34, by - 2, 3)
    if (lvl >= 2) { p.fill(0xffc76a, 0.8).circle(cx, by - 20, 4); p.fill(0xfff0b0, 0.9).circle(cx, by - 20, 2) }
    if (lvl >= 3) { p.fill(WD).rect(cx - 40, by - 40, 4, 40); flag(p, cx - 38, by - 40, 12, PAL.metal) }
  },

  crystalDelve: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 48, 0x57496a)
    // the working face: a shelf of violet rock with the seam split through it
    p.fill(0x4a3d60).ellipse(cx, by - 14, 78, 38)
    p.fill(shade(0x4a3d60, -0.34)).ellipse(cx + 1, by - 17, 58, 26)
    p.fill(0x1d1528).poly([[cx - 11, by - 12], [cx - 8, by - 32], [cx + 8, by - 32], [cx + 11, by - 12]])
    // the crystals themselves are the silhouette — everything else frames them
    const spike = (x: number, yb: number, h: number, w: number) => {
      p.fill(shade(PAL.crystal, -0.38)).poly([[x - w, yb], [x, yb - h], [x + w, yb]])
      p.fill(PAL.crystal).poly([[x - w, yb], [x, yb - h], [x - w * 0.12, yb]])
      p.fill(0xffffff, 0.55).poly([[x - w * 0.55, yb - h * 0.28], [x, yb - h * 0.84], [x - w * 0.12, yb - h * 0.28]])
    }
    spike(cx - 17, by - 8, 20 + lvl * 3, 7)
    spike(cx + 14, by - 10, 15 + lvl * 3, 6)
    spike(cx - 2, by - 5, 26 + lvl * 4, 8)
    if (lvl >= 2) spike(cx + 26, by - 6, 13 + lvl * 2, 5)
    if (lvl >= 3) spike(cx - 29, by - 6, 16, 5)
    // head frame over the cut, with a hoist rope and the shard it just lifted
    p.fill(WD).rect(cx - 31, by - 50, 4, 46).rect(cx + 27, by - 50, 4, 46)
    p.fill(shade(WD, -0.32)).rect(cx - 36, by - 54, 72, 6, 1)
    p.fill(WL).rect(cx - 36, by - 54, 72, 3, 1)
    p.fill(0x2a2018).rect(cx + 7, by - 48, 1.6, 12)
    p.fill(shade(PAL.crystal, -0.25)).poly([[cx + 3, by - 32], [cx + 8, by - 40], [cx + 13, by - 32], [cx + 8, by - 27]])
    p.fill(PAL.crystal, 0.95).poly([[cx + 3, by - 32], [cx + 8, by - 40], [cx + 8, by - 27]])
    // a lantern, because the seam is dark work
    p.fill(0x4a3320).rect(cx - 30, by - 48, 2.5, 3)
    p.fill(0x2a2018).rect(cx - 29.5, by - 46, 1.2, 6)
    p.fill(0xffc76a, 0.9).circle(cx - 29, by - 37, 4)
    p.fill(0xfff0b0).circle(cx - 29, by - 38, 2)
    // spoil: chips of dead rock swept out of the cut
    p.fill(shade(0x4a3d60, 0.22)).circle(cx - 36, by - 4, 3.4).circle(cx - 31, by - 2, 2.6).circle(cx + 36, by - 3, 3)
    if (lvl >= 2) {
      // trimming bench, out past the frame where you can see it
      p.fill(shade(WL, -0.12)).rect(cx + 34, by - 17, 22, 4, 1)
      p.fill(WD).rect(cx + 36, by - 13, 3, 13).rect(cx + 52, by - 13, 3, 13)
      p.fill(shade(PAL.crystal, 0.2)).poly([[cx + 38, by - 17], [cx + 41, by - 25], [cx + 44, by - 17]])
      p.fill(PAL.crystal).poly([[cx + 46, by - 17], [cx + 49, by - 23], [cx + 52, by - 17]])
    }
    if (lvl >= 3) {
      p.fill(PAL.crystal, 0.16).circle(cx - 2, by - 30, 34)
      flag(p, cx - 34, by - 54, 15, PAL.crystal)
    }
  },

  barracks: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 52)
    const w = 62
    p.fill(shade(WL, -0.28)).rect(cx - w / 2, by - 30, w, 30, 3)
    p.fill(WL).rect(cx - w / 2, by - 30, w, 15, 3)
    gable(p, cx, by - 46, w + 6, 18, lvl >= 3 ? 0x4f7fb5 : PAL.roofB)
    p.fill(0x2a1f14).rect(cx - 9, by - 20, 18, 20, 2)
    windows(p, cx - 22, by - 25, 1, 0)
    windows(p, cx + 22, by - 25, 1, 0)
    // weapon rack
    p.fill(WD).rect(cx + w / 2 - 2, by - 20, 14, 3)
    for (let i = 0; i < 3; i++) {
      p.fill(0xd8dfe8).rect(cx + w / 2 + i * 4, by - 30, 1.6, 12)
      p.fill(0x6b4a2a).rect(cx + w / 2 + i * 4 - 0.5, by - 20, 2.6, 4)
    }
    flag(p, cx - w / 2 + 3, by - 46, 18, PAL.allyBody)
    if (lvl >= 2) flag(p, cx + w / 2 - 3, by - 46, 18, PAL.allyBody)
    if (lvl >= 3) { p.fill(SD).rect(cx - w / 2, by - 8, w, 8, 2) }
  },

  archeryRange: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 52)
    p.fill(shade(WL, -0.28)).rect(cx - 34, by - 24, 46, 24, 2)
    p.fill(WL).rect(cx - 34, by - 24, 46, 12, 2)
    gable(p, cx - 11, by - 36, 52, 14, PAL.roofB)
    p.fill(0x2a1f14).rect(cx - 18, by - 16, 13, 16, 1)
    // targets
    for (let i = 0; i < 1 + lvl; i++) {
      const tx = cx + 20 + i * 14
      p.fill(WD).rect(tx - 1.5, by - 16, 3, 16)
      p.fill(0xeee3cf).circle(tx, by - 20, 7)
      p.fill(PAL.danger).circle(tx, by - 20, 4.5)
      p.fill(0xeee3cf).circle(tx, by - 20, 2)
      p.fill(PAL.allyAlt).rect(tx - 9, by - 21, 8, 1.4)
    }
    flag(p, cx - 34, by - 36, 16, PAL.allyAlt)
  },

  stable: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 54)
    // fence
    for (let i = 0; i < 6; i++) p.fill(WD).rect(cx - 36 + i * 13, by - 14, 3, 14)
    p.fill(shade(WD, 0.1)).rect(cx - 36, by - 12, 76, 2.5).rect(cx - 36, by - 6, 76, 2.5)
    // shelter
    p.fill(shade(WL, -0.28)).rect(cx + 6, by - 32, 38, 32, 2)
    p.fill(WL).rect(cx + 6, by - 32, 38, 16, 2)
    gable(p, cx + 25, by - 44, 44, 14, 0x8a5a3a)
    p.fill(0x2a1f14).rect(cx + 18, by - 20, 14, 20, 1)
    // horse silhouette
    p.fill(0x6f4a2c).ellipse(cx - 18, by - 18, 26, 13)
    p.fill(0x6f4a2c).rect(cx - 28, by - 26, 7, 12, 3)
    p.fill(0x6f4a2c).rect(cx - 26, by - 12, 4, 12).rect(cx - 12, by - 12, 4, 12)
    p.fill(0x3a2413).circle(cx - 25, by - 29, 3.4)
    if (lvl >= 2) flag(p, cx + 25, by - 44, 14, 0xc08a4a)
  },

  house: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 38)
    const w = 34 + lvl * 5
    p.fill(shade(0xd9c8a8, -0.25)).rect(cx - w / 2, by - 26, w, 26, 2)
    p.fill(0xd9c8a8).rect(cx - w / 2, by - 26, w, 13, 2)
    // timber framing
    p.fill(WD).rect(cx - w / 2, by - 14, w, 2.5)
    p.fill(WD).rect(cx - 2, by - 26, 2.5, 26)
    gable(p, cx, by - 40, w + 6, 16, PAL.roofA)
    p.fill(0x3a2a18).rect(cx - 6, by - 16, 12, 16, 1)
    windows(p, cx + w / 4, by - 23, 1, 0)
    // chimney + smoke
    p.fill(SD).rect(cx + w / 2 - 10, by - 48, 8, 12, 1)
    p.fill(0xdfe6ee, 0.35).circle(cx + w / 2 - 6, by - 54, 4).circle(cx + w / 2 - 3, by - 61, 5)
    if (lvl >= 3) flag(p, cx - w / 2 + 2, by - 40, 12, PAL.banner)
  },

  warehouse: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 54)
    const w = 62
    p.fill(shade(WL, -0.3)).rect(cx - w / 2, by - 32, w, 32, 2)
    p.fill(WL).rect(cx - w / 2, by - 32, w, 16, 2)
    for (let i = 0; i < 4; i++) p.fill(shade(WD, -0.05)).rect(cx - w / 2 + 6 + i * 15, by - 32, 3, 32)
    p.fill(shade(0x8a8f96, -0.2)).poly([[cx - w / 2 - 5, by - 32], [cx + w / 2 + 5, by - 32], [cx + w / 2, by - 44], [cx - w / 2, by - 44]])
    p.fill(0x3a2a18).rect(cx - 12, by - 22, 24, 22, 1)
    p.fill(shade(WD, 0.1)).rect(cx - 1, by - 22, 2, 22)
    // goods spilling out front
    p.fill(PAL.wood).circle(cx - 26, by - 5, 4).circle(cx - 19, by - 5, 4)
    p.fill(PAL.stone).rect(cx + 18, by - 9, 9, 9, 1)
    if (lvl >= 2) { p.fill(PAL.coins).circle(cx + 30, by - 5, 3.4).circle(cx + 25, by - 4, 3.4) }
    if (lvl >= 4) { p.fill(PAL.metal).rect(cx - 34, by - 8, 11, 6, 1) }
    flag(p, cx, by - 44, 14, PAL.gold)
  },

  blacksmith: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 48, 0x6f6156)
    p.fill(shade(SD, -0.2)).rect(cx - 28, by - 28, 52, 28, 2)
    p.fill(SL).rect(cx - 28, by - 28, 52, 14, 2)
    gable(p, cx - 2, by - 42, 58, 16, 0x5a4a42)
    p.fill(0x201812).rect(cx - 18, by - 20, 20, 20, 1)
    // forge glow
    p.fill(0xff7a2a, 0.9).rect(cx - 16, by - 14, 16, 14, 1)
    p.fill(0xffd24a, 0.9).rect(cx - 13, by - 10, 10, 10, 1)
    // chimney + sparks
    p.fill(SD).rect(cx + 12, by - 50, 10, 24, 1)
    p.fill(shade(SD, 0.2)).rect(cx + 11, by - 52, 12, 4, 1)
    p.fill(0xff9840, 0.8).circle(cx + 17, by - 58, 2.4).circle(cx + 21, by - 65, 1.8)
    // anvil
    p.fill(0x3a4048).poly([[cx + 20, by - 12], [cx + 36, by - 12], [cx + 33, by - 8], [cx + 23, by - 8]])
    p.fill(0x3a4048).rect(cx + 26, by - 8, 5, 8)
    if (lvl >= 3) { p.fill(0xd8dfe8).rect(cx + 30, by - 26, 2, 14); p.fill(0x6b4a2a).rect(cx + 29, by - 14, 4, 4) }
    if (lvl >= 4) flag(p, cx - 26, by - 42, 14, PAL.gold)
  },

  workshop: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 50)
    p.fill(shade(WL, -0.28)).rect(cx - 30, by - 28, 54, 28, 2)
    p.fill(WL).rect(cx - 30, by - 28, 54, 14, 2)
    p.fill(shade(0x8a8f96, -0.2)).poly([[cx - 34, by - 28], [cx + 28, by - 28], [cx + 24, by - 40], [cx - 30, by - 40]])
    p.fill(0x2a1f14).rect(cx - 20, by - 20, 17, 20, 1)
    // scaffold
    p.fill(WD).rect(cx + 26, by - 40, 3, 40).rect(cx + 40, by - 40, 3, 40)
    p.fill(WD).rect(cx + 26, by - 28, 17, 3).rect(cx + 26, by - 14, 17, 3)
    // gear
    p.fill(0x8a8f96).circle(cx + 8, by - 16, 8)
    p.fill(shade(WL, -0.4)).circle(cx + 8, by - 16, 3)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      p.fill(0x8a8f96).rect(cx + 8 + Math.cos(a) * 9 - 2, by - 16 + Math.sin(a) * 9 - 2, 4, 4, 1)
    }
    if (lvl >= 2) { p.fill(PAL.metal).rect(cx + 30, by - 36, 9, 5, 1) }
    flag(p, cx - 32, by - 40, 14, 0xd0a04a)
  },

  healingTent: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 42)
    p.fill(shade(0xe8e2d2, -0.25)).poly([[cx - 30, by], [cx - 22, by - 34], [cx + 22, by - 34], [cx + 30, by]])
    p.fill(0xe8e2d2).poly([[cx - 30, by], [cx - 22, by - 34], [cx, by - 34], [cx - 4, by]])
    p.fill(0x8a8070).poly([[cx - 8, by], [cx - 6, by - 24], [cx + 6, by - 24], [cx + 8, by]])
    p.fill(0x2a2a2a, 0.45).poly([[cx - 6, by], [cx - 5, by - 22], [cx + 5, by - 22], [cx + 6, by]])
    // cross mark
    p.fill(PAL.good).rect(cx + 10, by - 28, 12, 4, 1).rect(cx + 14, by - 32, 4, 12, 1)
    p.fill(0x6b4a2a).rect(cx - 24, by - 38, 2.5, 8).rect(cx + 21, by - 38, 2.5, 8)
    if (lvl >= 2) { p.fill(0xe8e2d2).circle(cx - 34, by - 8, 7); p.fill(PAL.good).rect(cx - 37, by - 9, 6, 2).rect(cx - 35, by - 11, 2, 6) }
    if (lvl >= 3) { p.fill(PAL.good, 0.3).circle(cx, by - 20, 26) }
  },

  watchtower: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 34, lvl >= 3 ? 0x6f7680 : 0x6a5236)
    const h = 40 + lvl * 7
    const stone = lvl >= 3
    const wc = stone ? SL : WL
    const wd = stone ? SD : WD
    // legs
    p.fill(wd).poly([[cx - 15, by], [cx - 10, by - h], [cx - 5, by - h], [cx - 9, by]])
    p.fill(wd).poly([[cx + 15, by], [cx + 10, by - h], [cx + 5, by - h], [cx + 9, by]])
    p.fill(shade(wd, 0.1)).rect(cx - 13, by - h * 0.45, 26, 3)
    // platform
    p.fill(wd).rect(cx - 17, by - h - 12, 34, 12, 2)
    p.fill(wc).rect(cx - 17, by - h - 12, 34, 6, 2)
    // crenellations
    for (let i = 0; i < 4; i++) p.fill(wc).rect(cx - 17 + i * 9, by - h - 18, 6, 7, 1)
    if (lvl >= 2) { p.fill(0x2a1f14).rect(cx - 6, by - h - 10, 12, 8, 1) }
    // conical roof from lvl 3
    if (lvl >= 3) {
      p.fill(shade(PAL.roofB, -0.2)).poly([[cx - 20, by - h - 18], [cx, by - h - 38], [cx + 20, by - h - 18]])
      p.fill(PAL.roofB).poly([[cx - 20, by - h - 18], [cx, by - h - 38], [cx - 2, by - h - 18]])
      flag(p, cx, by - h - 38, 14, PAL.banner)
    }
    // archer silhouette on top
    p.fill(PAL.allyAlt).rect(cx - 3, by - h - 24, 6, 8, 2)
    p.fill(PAL.heroSkin).circle(cx, by - h - 26, 3.2)
    if (lvl >= 4) { p.line(2, 0x8a5f33).ring(cx + 8, by - h - 22, 5) }
    if (lvl >= 5) { p.fill(PAL.crystal, 0.85).circle(cx, by - h - 44, 4) }
  },

  cannonTower: (p, lvl, _W, _H, cx, by) => {
    plinth(p, cx, by, 38, 0x6f7680)
    const h = 34 + lvl * 6
    p.fill(shade(SD, -0.15)).rect(cx - 20, by - h, 40, h, 3)
    p.fill(SL).rect(cx - 20, by - h, 40, h * 0.5, 3)
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < 3; i++)
        p.fill(shade(SL, -0.14)).rect(cx - 17 + i * 12 + (r % 2) * 5, by - h + 6 + r * 10, 9, 6, 1)
    for (let i = 0; i < 5; i++) p.fill(SL).rect(cx - 22 + i * 9, by - h - 8, 6, 9, 1)
    p.fill(shade(SD, -0.3)).rect(cx - 22, by - h - 1, 44, 4, 1)
    // barrel
    p.fill(0x3a4048).rect(cx - 2, by - h - 16, 26, 10, 3)
    p.fill(0x596272).rect(cx - 2, by - h - 16, 26, 4, 2)
    p.fill(0x1b2029).circle(cx + 24, by - h - 11, 4.6)
    p.fill(0x2a2f36).circle(cx - 2, by - h - 11, 6)
    if (lvl >= 2) { p.fill(0x2a2f36).circle(cx - 20, by - 8, 5); p.fill(0x1b2029).circle(cx - 20, by - 8, 2) }
    if (lvl >= 3) { p.fill(PAL.gold, 0.9).circle(cx + 14, by - h - 11, 2.4); flag(p, cx - 20, by - h - 8, 14, PAL.gold) }
  },

  wall: (p, lvl, _W, _H, cx, by) => {
    const stone = lvl >= 2
    const wc = stone ? SL : WL
    const wd = stone ? SD : WD
    const h = 24 + lvl * 4
    p.fill(shade(wd, -0.3), 0.5).ellipse(cx, by + 1, 62, 10)
    p.fill(wd).rect(cx - 30, by - h, 60, h, 2)
    p.fill(wc).rect(cx - 30, by - h, 60, h * 0.45, 2)
    if (stone) {
      for (let r = 0; r < 3; r++)
        for (let i = 0; i < 4; i++)
          p.fill(shade(wc, -0.13)).rect(cx - 27 + i * 14 + (r % 2) * 6, by - h + 4 + r * 8, 11, 5, 1)
    } else {
      for (let i = 0; i < 6; i++) p.fill(shade(wd, -0.08)).rect(cx - 29 + i * 10, by - h, 2, h)
    }
    for (let i = 0; i < 4; i++) p.fill(wc).rect(cx - 30 + i * 16, by - h - 7, 10, 8, 1)
    if (lvl >= 3) { p.fill(PAL.metal).rect(cx - 30, by - h - 9, 60, 2.5) }
  },

  gate: (p, lvl, _W, _H, cx, by) => {
    const stone = lvl >= 2
    const wc = stone ? SL : WL
    const wd = stone ? SD : WD
    const h = 30 + lvl * 5
    p.fill(shade(wd, -0.3), 0.5).ellipse(cx, by + 1, 70, 11)
    p.fill(wd).rect(cx - 34, by - h, 14, h, 2).rect(cx + 20, by - h, 14, h, 2)
    p.fill(wc).rect(cx - 34, by - h, 14, h * 0.45, 2).rect(cx + 20, by - h, 14, h * 0.45, 2)
    p.fill(shade(WD, -0.2)).rect(cx - 20, by - h + 8, 40, h - 8, 2)
    p.fill(WD).rect(cx - 20, by - h + 8, 40, (h - 8) * 0.45, 2)
    for (let i = 0; i < 4; i++) p.fill(shade(WD, -0.35)).rect(cx - 18 + i * 10, by - h + 8, 2.5, h - 8)
    p.fill(0x8a8f96).circle(cx - 6, by - h * 0.45, 2.6).circle(cx + 6, by - h * 0.45, 2.6)
    for (let i = 0; i < 5; i++) p.fill(wc).rect(cx - 34 + i * 16, by - h - 8, 10, 9, 1)
    if (lvl >= 2) { flag(p, cx - 27, by - h - 8, 14, PAL.banner); flag(p, cx + 27, by - h - 8, 14, PAL.banner) }
  },
}

/** Texture canvas size per building. Generous headroom for roofs and flags. */
function texSize(key: BuildingKey, lvl: number) {
  const d = BUILDINGS[key]
  const extra = key === 'watchtower' ? 60 + lvl * 8 : key === 'cannonTower' ? 44 + lvl * 7
    : key === 'townHall' ? 60 + lvl * 8 : 44
  return { w: d.w + 64, h: d.h + extra + 24 }
}

export function buildingTextureKey(key: BuildingKey, lvl: number) { return `bld_${key}_${lvl}` }

export function buildBuildingTextures(p: Pen) {
  for (const def of Object.values(BUILDINGS)) {
    for (let lvl = 1; lvl <= def.levels.length; lvl++) {
      const { w, h } = texSize(def.key, lvl)
      const cx = w / 2
      const by = h - 16
      DRAW[def.key](p, lvl, w, h, cx, by)
      p.bake(buildingTextureKey(def.key, lvl), w, h)
    }
    // blueprint / construction site ghost
    const { w, h } = texSize(def.key, 1)
    const cx = w / 2, by = h - 16
    plinth(p, cx, by, Math.max(30, def.w * 0.55), 0x4a5a6a)
    p.line(2, PAL.heroTrim, 0.85).outline(cx - def.w / 2, by - def.h * 0.9, def.w, def.h * 0.9, 4)
    p.fill(PAL.heroTrim, 0.10).rect(cx - def.w / 2, by - def.h * 0.9, def.w, def.h * 0.9, 4)
    for (let i = 0; i < 4; i++) {
      p.fill(PAL.heroTrim, 0.5)
        .rect(cx - def.w / 2 - 2, by - def.h * 0.9 - 2 + i * (def.h * 0.3), 6, 2)
        .rect(cx + def.w / 2 - 4, by - def.h * 0.9 - 2 + i * (def.h * 0.3), 6, 2)
    }
    p.bake(`blueprint_${def.key}`, w, h)

    // half-built frame used mid-construction
    const { w: w2, h: h2 } = texSize(def.key, 1)
    const cx2 = w2 / 2, by2 = h2 - 16
    plinth(p, cx2, by2, Math.max(30, def.w * 0.55))
    p.fill(shade(WD, -0.1)).rect(cx2 - def.w / 2, by2 - 8, def.w, 8, 2)
    for (let i = 0; i < 5; i++) p.fill(WD).rect(cx2 - def.w / 2 + i * (def.w / 5), by2 - def.h * 0.55, 4, def.h * 0.55)
    p.fill(WD).rect(cx2 - def.w / 2, by2 - def.h * 0.55, def.w, 4)
    p.fill(WL, 0.5).rect(cx2 - def.w / 2, by2 - def.h * 0.3, def.w, def.h * 0.3, 2)
    p.bake(`frame_${def.key}`, w2, h2)
  }
}
