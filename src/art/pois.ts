import type Phaser from 'phaser'
import { POIS } from '../config/world'
import { bake, fill, form, glow, line, P, shade, INK, type Ctx } from './ink'
import { groundShadow } from './props'
import { RELICS } from '../systems/Relics'

/**
 * Points of interest (S14): shrines (one base, six emblems, and the ruin they
 * start as), lore stones, the survivors' shelter and the six landmarks.
 *
 * Every texture stands its foot `POI_FOOT` px above the canvas bottom, so the
 * PoiManager sets origin `(0.5, 1 - POI_FOOT / h)` and depth by y.
 */
export const POI_FOOT = 12

const STONE = 0xa49e90
const STONE_D = 0x7d7768

/** The shrine's accent and emblem, by POI id. */
const EMBLEM: Record<string, { c: number; paint: (x: Ctx, cx: number, cy: number) => void }> = {
  shrineHarvest: { c: 0xd8a83a, paint: (x, cx, cy) => {
    for (const dx of [-5, 0, 5]) {
      line(x, x2 => { x2.moveTo(cx + dx * 0.4, cy + 9); x2.lineTo(cx + dx, cy - 7) }, 1.4, 0x9a7a2a, 1)
      fill(x, P.ellipse(cx + dx, cy - 8, 2.4, 4.6, dx * 0.05), 0xf0c850)
    }
    fill(x, P.rect(cx - 5, cy + 2, 10, 2.4), 0xa3301c)
  } },
  shrineMason: { c: 0x8a96a8, paint: (x, cx, cy) => {
    form(x, P.rect(cx - 7, cy - 8, 14, 7), 0x9aa2ae, { rim: 0.8, core: 1.5 })
    fill(x, P.rect(cx - 1.3, cy - 1, 2.6, 11), 0x7a5a38)
  } },
  shrineFlame: { c: 0xff9a34, paint: (x, cx, cy) => {
    fill(x, P.blob([[cx - 7, cy + 8], [cx - 4, cy - 2], [cx, cy - 12], [cx + 4, cy - 2], [cx + 7, cy + 8]], 0.8), 0xff9a34)
    fill(x, P.blob([[cx - 3.5, cy + 8], [cx, cy - 3], [cx + 3.5, cy + 8]], 0.8), 0xfff0b0)
  } },
  shrineFallen: { c: 0xa3301c, paint: (x, cx, cy) => {
    fill(x, P.poly([[cx - 1.8, cy - 11], [cx + 1.8, cy - 11], [cx + 1.8, cy + 6], [cx, cy + 10], [cx - 1.8, cy + 6]]), 0xd0d4dc)
    fill(x, P.rect(cx - 6, cy - 6, 12, 2.4), 0x8a6a3a)
    fill(x, P.circle(cx, cy - 12.5, 1.8), 0xd8a83a)
  } },
  shrineSpring: { c: 0x4aa0d0, paint: (x, cx, cy) => {
    fill(x, P.blob([[cx, cy - 11], [cx + 6, cy + 1], [cx + 5, cy + 7], [cx, cy + 9], [cx - 5, cy + 7], [cx - 6, cy + 1]], 0.9), 0x5ab0d8)
    fill(x, P.ellipse(cx - 2, cy + 2, 1.5, 3), 0xd8f0ff)
  } },
  shrineTide: { c: 0xffc860, paint: (x, cx, cy) => {
    form(x, P.round(cx - 5, cy - 8, 10, 14, 2), 0x3a3028, { rim: 0.6, core: 1 })
    fill(x, P.round(cx - 3.2, cy - 6, 6.4, 10, 1.5), 0xffd070)
    fill(x, P.poly([[cx - 6, cy - 8], [cx, cy - 13], [cx + 6, cy - 8]]), 0x3a3028)
  } },
}

/** The shrine's plinth and steps, shared by the ruin and every restored one. */
function plinth(x: Ctx, cx: number, by: number) {
  form(x, P.rect(cx - 30, by - 8, 60, 8), STONE_D, { rim: 1, core: 2, hatch: 0.12 })
  form(x, P.rect(cx - 24, by - 16, 48, 9), STONE, { rim: 1.2, core: 2 })
}

function shrine(x: Ctx, cx: number, by: number, accent: number) {
  plinth(x, cx, by)
  for (const sx of [cx - 19, cx + 13]) form(x, P.rect(sx, by - 60, 6, 45), STONE, { rim: 1, core: 2, hatch: 0.1 })
  form(x, P.poly([[cx - 26, by - 60], [cx, by - 76], [cx + 26, by - 60]]), shade(STONE, -0.08), { rim: 1.2, core: 2.5 })
  fill(x, P.rect(cx - 24, by - 62, 48, 4), STONE_D)
  // the altar and its cloth in the shrine's colour
  form(x, P.rect(cx - 10, by - 30, 20, 14), STONE, { rim: 1, core: 2 })
  fill(x, P.poly([[cx - 11, by - 30], [cx + 11, by - 30], [cx + 8, by - 22], [cx - 8, by - 22]]), accent, 0.95)
}

function ruin(x: Ctx, cx: number, by: number) {
  plinth(x, cx, by)
  form(x, P.poly([[cx - 19, by - 16], [cx - 19, by - 40], [cx - 15, by - 46], [cx - 13, by - 38], [cx - 13, by - 16]]), STONE, { rim: 1, core: 2, hatch: 0.14 })
  form(x, P.poly([[cx + 13, by - 16], [cx + 13, by - 26], [cx + 17, by - 30], [cx + 19, by - 24], [cx + 19, by - 16]]), STONE, { rim: 1, core: 2 })
  // the fallen lintel, and rubble
  form(x, P.poly([[cx - 4, by - 18], [cx + 30, by - 10], [cx + 29, by - 5], [cx - 6, by - 13]]), shade(STONE, -0.1), { rim: 1, core: 2 })
  for (const [dx, s] of [[-28, 4], [-22, 3], [24, 3.5], [31, 2.6]]) form(x, P.circle(cx + dx, by - s, s), STONE_D, { rim: 0.6, core: 1 })
  form(x, P.rect(cx - 10, by - 26, 20, 10), shade(STONE, -0.05), { rim: 1, core: 2 })
}

function loreStone(x: Ctx, cx: number, by: number) {
  const body = P.blob([[cx - 9, by], [cx - 10, by - 18], [cx - 7, by - 30], [cx + 2, by - 33], [cx + 8, by - 26], [cx + 10, by]], 0.9)
  form(x, body, 0x948e80, { rim: 1.2, core: 2.5, hatch: 0.12 })
  for (let i = 0; i < 4; i++) fill(x, P.rect(cx - 5, by - 25 + i * 5, i % 2 ? 8 : 10, 1.3), 0xe8dcc0, 0.8)
  fill(x, P.ellipse(cx - 6, by + 1, 4, 1.6), 0x7a8a5a, 0.8)
}

function shelter(x: Ctx, cx: number, by: number) {
  // a lean-to over a cellar door, a lantern on its post
  form(x, P.poly([[cx - 24, by], [cx - 16, by - 26], [cx + 16, by - 26], [cx + 20, by]]), 0x7a5a38, { rim: 1, core: 3, hatch: 0.15 })
  form(x, P.poly([[cx - 26, by - 22], [cx + 20, by - 30], [cx + 22, by - 24], [cx - 24, by - 16]]), 0x8e7048, { rim: 1, core: 2 })
  form(x, P.rect(cx - 9, by - 12, 18, 12), 0x4e3a26, { rim: 0.6, core: 1 })
  fill(x, P.rect(cx - 0.6, by - 12, 1.2, 12), INK, 0.6)
  fill(x, P.rect(cx + 22, by - 30, 2, 30), 0x5a4028)
  form(x, P.round(cx + 19, by - 34, 8, 8, 1.5), 0x3a3028, { rim: 0.5, core: 1 })
}

// ---- barrows and relics (S15) ----------------------------------------------------

const TURF = 0x6f8a4a

/** A turf mound over a stone door: sealed by its slab, or broken open on the dark. */
function barrow(x: Ctx, cx: number, by: number, open: boolean) {
  form(x, P.blob([[cx - 56, by], [cx - 44, by - 24], [cx - 16, by - 42], [cx + 16, by - 42], [cx + 44, by - 24], [cx + 56, by]], 0.9),
    TURF, { rim: 1.4, core: 3, hatch: 0.14 })
  for (const [dx, dy] of [[-34, -16], [-22, -30], [26, -28], [38, -12], [4, -40]]) line(x, x2 => { x2.moveTo(cx + dx, by + dy); x2.lineTo(cx + dx + 2, by + dy - 5) }, 1, 0x4a6a2a, 0.8)
  if (open) fill(x, P.rect(cx - 11, by - 30, 22, 30), 0x150d08)
  for (const sx of [cx - 17, cx + 11]) form(x, P.rect(sx, by - 31, 6, 31), STONE, { rim: 1, core: 2, hatch: 0.1 })
  form(x, P.rect(cx - 21, by - 38, 42, 8), STONE_D, { rim: 1.1, core: 2 })
  if (!open) {
    form(x, P.rect(cx - 11, by - 30, 22, 30), 0x8a8474, { rim: 1, core: 2, hatch: 0.14 })
    line(x, x2 => { x2.moveTo(cx - 4, by - 24); x2.lineTo(cx + 1, by - 17); x2.lineTo(cx - 2, by - 10) }, 1, INK, 0.6)
  } else {
    // the slab, fallen outward, and the rubble of the door
    form(x, P.poly([[cx - 14, by + 2], [cx + 16, by - 2], [cx + 18, by + 5], [cx - 12, by + 9]]), 0x8a8474, { rim: 1, core: 2 })
    for (const [dx, r] of [[-26, 3.2], [24, 2.6], [30, 2]]) form(x, P.circle(cx + dx, by - r, r), STONE_D, { rim: 0.6, core: 1 })
  }
}

/** A reliquary plinth: an empty cradle until its relic is won, then a gilt casket. */
function reliquary(x: Ctx, cx: number, by: number, lit: boolean) {
  form(x, P.rect(cx - 17, by - 7, 34, 7), STONE_D, { rim: 1, core: 2, hatch: 0.12 })
  form(x, P.rect(cx - 11, by - 28, 22, 21), STONE, { rim: 1, core: 2, hatch: 0.1 })
  form(x, P.rect(cx - 15, by - 33, 30, 6), STONE_D, { rim: 1, core: 1.5 })
  if (lit) {
    form(x, P.round(cx - 9, by - 46, 18, 13, 2.5), 0xd8a83a, { rim: 1, core: 2 })
    fill(x, P.rect(cx - 9, by - 41, 18, 1.6), 0x8a5a1a)
    fill(x, P.circle(cx, by - 40, 1.8), 0xa3301c)
  } else fill(x, P.ellipse(cx, by - 33, 9, 2.2), 0x2a2018, 0.8)
}

/** Each relic's mark, pressed into its seal (ink on wax, centred on cx, cy, about ±10 px). */
const SEAL_MARK: Record<string, (x: Ctx, cx: number, cy: number, c: number) => void> = {
  barrowCrown: (x, cx, cy, c) => fill(x, P.poly([[cx - 10, cy + 6], [cx - 10, cy - 6], [cx - 5, cy - 1], [cx, cy - 9], [cx + 5, cy - 1], [cx + 10, cy - 6], [cx + 10, cy + 6]]), c),
  captainsHorn: (x, cx, cy, c) => {
    line(x, x2 => { x2.moveTo(cx - 10, cy - 6); x2.quadraticCurveTo(cx - 6, cy + 9, cx + 9, cy + 2) }, 4.2, c, 1)
    fill(x, P.ellipse(cx + 9, cy + 1, 2.4, 4.2, -0.4), c)
  },
  gallowsBell: (x, cx, cy, c) => {
    fill(x, P.blob([[cx - 9, cy + 7], [cx - 6, cy - 2], [cx - 4, cy - 8], [cx + 4, cy - 8], [cx + 6, cy - 2], [cx + 9, cy + 7]], 0.7), c)
    fill(x, P.circle(cx, cy + 9, 2.2), c)
  },
  thornCrown: (x, cx, cy, c) => {
    line(x, P.ellipse(cx, cy + 1, 9, 5), 2.4, c, 1)
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + (i / 5) * Math.PI
      const px = cx + Math.cos(a) * 9, py = cy + 1 + Math.sin(a) * 5
      fill(x, P.poly([[px - 1.6, py], [px + 1.6, py], [px + Math.cos(a) * 5, py + Math.sin(a) * 6 - 1]]), c)
    }
  },
  heartOakSeed: (x, cx, cy, c) => {
    fill(x, P.blob([[cx, cy + 10], [cx - 7, cy + 2], [cx - 6, cy - 3], [cx + 6, cy - 3], [cx + 7, cy + 2]], 0.9), c)
    fill(x, P.round(cx - 8, cy - 7, 16, 5, 2), c)
    fill(x, P.rect(cx - 0.8, cy - 11, 1.6, 4), c)
  },
  overseersLash: (x, cx, cy, c) => {
    fill(x, P.rect(cx - 10, cy + 3, 7, 3), c)
    line(x, x2 => { x2.moveTo(cx - 3, cy + 4); x2.bezierCurveTo(cx + 12, cy + 4, cx + 10, cy - 10, cx - 2, cy - 6); x2.quadraticCurveTo(cx - 8, cy - 3, cx - 4, cy - 1) }, 1.8, c, 1)
  },
  wardensAegis: (x, cx, cy, c) => {
    fill(x, P.poly([[cx - 8, cy - 8], [cx + 8, cy - 8], [cx + 8, cy], [cx, cy + 10], [cx - 8, cy]]), c)
    fill(x, P.rect(cx - 0.9, cy - 6, 1.8, 13), shade(c, 0.5))
    fill(x, P.rect(cx - 6, cy - 3, 12, 1.8), shade(c, 0.5))
  },
}

export const relicSealKey = (id: string) => `relic_seal_${id}`
/** Seal textures are baked at this size and shown smaller, so they stay crisp on the pause page. */
export const SEAL_PX = 64

/** A lump of wax with a pressed rim and its relic's mark; `null` is the faded blank of one not yet won. */
function seal(x: Ctx, cx: number, cy: number, r: number, c: number | null, mark?: (x: Ctx, cx: number, cy: number, c: number) => void) {
  const pts: number[][] = []
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2
    const rr = r * (i % 2 ? 1.04 : 0.95) + (i % 3 === 0 ? r * 0.04 : 0)
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
  }
  if (c === null) {
    fill(x, P.blob(pts, 0.9), 0x8a7a64, 0.28)
    line(x, P.circle(cx, cy, r * 0.68), 1.6, 0x5a4a38, 0.45)
    fill(x, P.circle(cx, cy, r * 0.12), 0x5a4a38, 0.4)
    return
  }
  form(x, P.blob(pts, 0.9), c, { rim: 2.2, core: 4 })
  line(x, P.circle(cx, cy, r * 0.7), 2, shade(c, -0.4), 0.85)
  x.save(); x.translate(cx, cy); x.scale(r / 26, r / 26)
  mark?.(x, 0, 0, shade(c, -0.5))
  x.restore()
}

// ---- landmarks ------------------------------------------------------------------

type Painter = { w: number; h: number; body: (x: Ctx, cx: number, by: number) => void; over?: (x: Ctx, cx: number, by: number) => void }

const LANDMARKS: Record<string, Painter> = {
  lmHeartOak: { w: 260, h: 300, body: (x, cx, by) => {
    form(x, P.poly([[cx - 30, by], [cx - 18, by - 90], [cx - 14, by - 150], [cx + 14, by - 150], [cx + 18, by - 90], [cx + 32, by]]), 0x6e4a2c, { rim: 2, core: 6, hatch: 0.2 })
    for (const [dx, len] of [[-1, 60], [1, 55]]) line(x, x2 => { x2.moveTo(cx + dx * 20, by - 4); x2.lineTo(cx + dx * len, by + 2) }, 6, 0x5a3a22, 1)
    form(x, P.cluster([[cx, by - 190, 70], [cx - 70, by - 160, 50], [cx + 70, by - 165, 52], [cx - 40, by - 230, 48], [cx + 45, by - 228, 46], [cx, by - 250, 40]]),
      0x3e6a32, { rim: 3, core: 10, hatch: 0.2 })
    for (const [dx, dy] of [[-30, -200], [25, -175], [55, -215], [-60, -150]]) fill(x, P.circle(cx + dx, by + dy, 5), 0xd8a83a, 0.9)
  } },
  lmIrontooth: { w: 190, h: 320, body: (x, cx, by) => {
    form(x, P.poly([[cx - 80, by], [cx - 50, by - 110], [cx - 30, by - 180], [cx - 8, by - 300], [cx + 12, by - 210], [cx + 40, by - 150], [cx + 58, by - 70], [cx + 85, by]]),
      0x5c5660, { rim: 3, core: 10, hatch: 0.25 })
    form(x, P.poly([[cx + 30, by], [cx + 50, by - 90], [cx + 62, by - 120], [cx + 72, by - 60], [cx + 90, by]]), 0x4c4650, { rim: 2, core: 5 })
    for (const [x0, y0, x1, y1] of [[-20, -240, -32, -150], [5, -200, 14, -120], [-40, -90, -24, -30]]) {
      line(x, x2 => { x2.moveTo(cx + x0, by + y0); x2.lineTo(cx + x1, by + y1) }, 2.4, 0xa0582e, 0.9)
    }
  } },
  lmBell: { w: 170, h: 280, body: (x, cx, by) => {
    fill(x, P.ellipse(cx, by - 4, 80, 14), 0x3c6a8a, 0.85)
    // the tower leans, half drowned
    const lean = (y: number) => (by - y) * 0.12
    form(x, P.poly([[cx - 28, by - 6], [cx - 26 + lean(by - 200), by - 200], [cx + 26 + lean(by - 200), by - 200], [cx + 30, by - 6]]), 0x9a9486, { rim: 2, core: 6, hatch: 0.18 })
    form(x, P.poly([[cx - 32 + lean(by - 200), by - 200], [cx + lean(by - 250), by - 250], [cx + 32 + lean(by - 200), by - 200]]), 0x5a4a44, { rim: 2, core: 4 })
    const ax = cx + lean(by - 170)
    fill(x, P.round(ax - 14, by - 186, 28, 36, 12), 0x2a2420)
    form(x, P.blob([[ax - 10, by - 154], [ax - 8, by - 172], [ax, by - 180], [ax + 8, by - 172], [ax + 10, by - 154]], 0.9), 0xb88a3a, { rim: 1, core: 2 })
    for (const wy of [by - 90, by - 50]) fill(x, P.round(cx - 6 + lean(wy), wy - 14, 12, 18, 5), 0x2a2420)
    fill(x, P.ellipse(cx, by - 8, 40, 5), 0xc8e0e8, 0.5)
  } },
  lmVents: { w: 230, h: 260, body: (x, cx, by) => {
    for (const [dx, hh, w] of [[-55, 110, 26], [0, 150, 32], [55, 95, 24]]) {
      form(x, P.poly([[cx + dx - w, by], [cx + dx - w * 0.5, by - hh], [cx + dx + w * 0.5, by - hh], [cx + dx + w, by]]), 0x6a5448, { rim: 2, core: 6, hatch: 0.2 })
      fill(x, P.ellipse(cx + dx, by - hh, w * 0.5, 4), 0xff7a2a, 0.9)
    }
  }, over: (x, cx, by) => {
    for (const [dx, top] of [[-55, 110], [0, 150], [55, 95]]) {
      for (let i = 0; i < 4; i++) fill(x, P.circle(cx + dx + i * 6, by - top - 16 - i * 22, 12 + i * 5), 0xd8d0c8, 0.32 - i * 0.05)
    }
  } },
  lmGallows: { w: 180, h: 220, body: (x, cx, by) => {
    form(x, P.ellipse(cx, by - 6, 80, 14), 0x6a6a4a, { rim: 1.5, core: 4 })
    form(x, P.rect(cx - 50, by - 170, 10, 166), 0x5a4028, { rim: 1, core: 3, hatch: 0.15 })
    form(x, P.rect(cx - 56, by - 176, 120, 10), 0x5a4028, { rim: 1, core: 3 })
    line(x, x2 => { x2.moveTo(cx - 40, by - 130); x2.lineTo(cx - 6, by - 168) }, 5, 0x5a4028, 1)
    line(x, x2 => { x2.moveTo(cx + 44, by - 166); x2.lineTo(cx + 44, by - 120) }, 1.6, 0x8a7a5a, 1)
    line(x, P.ellipse(cx + 44, by - 112, 6, 8), 1.6, 0x8a7a5a, 1)
    fill(x, P.rect(cx + 24, by - 40, 40, 34), 0x4e3a26)
  } },
  lmThrone: { w: 260, h: 290, body: (x, cx, by) => {
    form(x, P.rect(cx - 110, by - 30, 220, 30), 0x4a3a36, { rim: 2, core: 5, hatch: 0.2 })
    form(x, P.poly([[cx - 70, by - 30], [cx - 72, by - 220], [cx - 40, by - 262], [cx, by - 240], [cx + 40, by - 262], [cx + 72, by - 220], [cx + 70, by - 30]]), 0x3a2c2a, { rim: 3, core: 8, hatch: 0.22 })
    form(x, P.rect(cx - 96, by - 110, 34, 80), 0x4a3a36, { rim: 2, core: 4 })
    form(x, P.rect(cx + 62, by - 110, 34, 80), 0x4a3a36, { rim: 2, core: 4 })
    form(x, P.rect(cx - 52, by - 90, 104, 30), 0x2a2020, { rim: 1, core: 3 })
    for (const [dx, dy] of [[-40, -250], [40, -250], [0, -232]]) fill(x, P.circle(cx + dx, by + dy, 5), 0xff7a2a)
  }, over: (x, cx, by) => {
    glow(x, cx, by - 150, 90, 0xff5a1a, 0.35)
    for (const [dx, dy] of [[-40, -250], [40, -250], [0, -232]]) glow(x, cx + dx, by + dy, 16, 0xffb050, 0.8)
  } },
}

export const landmarkKey = (id: string) => `lm_${id}`
export const shrineKey = (id: string) => `poi_shrine_${id}`

export function buildPoiTextures(scene: Phaser.Scene) {
  const by = (h: number) => h - POI_FOOT
  {
    const w = 80, h = 96
    bake(scene, 'poi_shrine_ruin', w, h, { under: x => groundShadow(x, w / 2, by(h), 34, 6), body: x => ruin(x, w / 2, by(h)), outline: 1.5 })
    for (const [id, e] of Object.entries(EMBLEM)) {
      bake(scene, shrineKey(id), w, h, {
        under: x => { groundShadow(x, w / 2, by(h), 34, 6); glow(x, w / 2, by(h) - 40, 40, e.c, 0.35) },
        body: x => { shrine(x, w / 2, by(h), e.c); e.paint(x, w / 2, by(h) - 44) },
        over: x => glow(x, w / 2, by(h) - 44, 14, e.c, 0.6),
        outline: 1.5,
      })
    }
  }
  bake(scene, 'poi_lore', 30, 50, { under: x => groundShadow(x, 15, by(50), 12, 3), body: x => loreStone(x, 15, by(50)), outline: 1.3 })
  bake(scene, 'poi_survivors', 64, 56, {
    under: x => groundShadow(x, 32, by(56), 28, 5),
    body: x => shelter(x, 30, by(56)),
    over: x => glow(x, 53, by(56) - 30, 8, 0xffc060, 0.9),
    outline: 1.4,
  })
  for (const open of [false, true]) {
    const w = 124, h = 70
    bake(scene, open ? 'poi_barrow_open' : 'poi_barrow', w, h, {
      under: x => groundShadow(x, w / 2, by(h), 54, 8),
      body: x => barrow(x, w / 2, by(h), open),
      outline: 1.5,
    })
  }
  for (const lit of [false, true]) {
    const w = 44, h = 64
    bake(scene, lit ? 'poi_relic_lit' : 'poi_relic', w, h, {
      under: x => groundShadow(x, w / 2, by(h), 18, 4),
      body: x => reliquary(x, w / 2, by(h), lit),
      over: lit ? x => glow(x, w / 2, by(h) - 40, 20, 0xffc860, 0.55) : undefined,
      outline: 1.3,
    })
  }
  const S = SEAL_PX
  bake(scene, relicSealKey('empty'), S, S, { body: x => seal(x, S / 2, S / 2, S * 0.4, null), outline: 0, grain: 0 })
  for (const r of RELICS) {
    bake(scene, relicSealKey(r.id), S, S, {
      under: x => glow(x, S / 2, S / 2 + 2, S * 0.5, 0x2a1a0e, 0.25),
      body: x => seal(x, S / 2, S / 2, S * 0.4, r.colour, SEAL_MARK[r.id]),
      outline: 2,
      grain: 0.1,
    })
  }
  for (const poi of POIS) {
    const lm = LANDMARKS[poi.id]
    if (poi.kind !== 'landmark' || !lm) continue
    bake(scene, landmarkKey(poi.id), lm.w, lm.h, {
      under: x => groundShadow(x, lm.w / 2, by(lm.h), lm.w * 0.42, 12),
      body: x => lm.body(x, lm.w / 2, by(lm.h)),
      over: lm.over ? x => lm.over!(x, lm.w / 2, by(lm.h)) : undefined,
      outline: 2,
      grain: 0.12,
    })
  }
}
