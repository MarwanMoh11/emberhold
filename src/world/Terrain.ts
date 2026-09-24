import Phaser from 'phaser'
import { WORLD, HALL, REGIONS, CAMPS, raster, type Biome } from '../config/world'
import { T, inPoly, polyArea, polyCentroid } from './raster'
import { applyGrain, css, fill, form, line, makeCanvas, mix, P, Rng, register, INK, type Ctx } from '../art/ink'
import { fbm, hash32, Mulberry, smooth, vnoise } from './noise'
import { boxBlur, cellValue, sample, terrainFields, type TerrainFields } from './terrainField'
import { Batch, paintCrossings, paintFeatureLines, paintRoads, warmFeatures, type Rect } from './TerrainFeatures'
import { paintClaimTint } from './claimTint'

/**
 * The ground, painted a piece at a time (S07).
 *
 * `paintTerrainRect` paints any rectangle of the world, and every stroke in it
 * is a function of world position alone, so TerrainChunks can bake slices in
 * any order without a seam. Layers, bottom up:
 *
 * 1. The wash (here): each biome's base and two noise-driven tints, blended
 *    across region borders over ~96 px, then the features read from the
 *    raster's signed distances: sand and mud banks, shelf and deep water, ice
 *    on Frostmere, cliff crest, face and cast shadow, lava core, crust,
 *    scorch and glow. Sampled every 8 px and smoothed up.
 * 2. Decals (here): per-biome ground marks dealt per 128 px cell and drawn in
 *    batches, one path per colour.
 * 3. Feature lines (TerrainFeatures): shore ink, foam, river flow, cliff
 *    hatching and rubble, lava cracks and edges.
 * 4. Roads, then crossings (TerrainFeatures), then the claim tint: unclaimed
 *    ground drained and darkened, its borders dotted (claimTint, S08).
 * 5. Set pieces (here): the hall's plaza, scorched camps, the spawn gates.
 * 6. Paper grain and the page's vignette.
 *
 * Props standing on the ground (pines, reeds, bones...) are sprites: see scatter.ts.
 */

/** The texture scale the old brushwork (plaza, camps, gates) was drawn for: its sizes are texels at this scale. */
const S = 0.5
/** The wash is sampled once per this many world px. */
const WASH_STEP = 8
const CELL = 128         // decals are dealt per cell of this many world px
const DECAL_REACH = 20   // world px a decal can stray from where it is dealt

// ---- biomes ------------------------------------------------------------------

type Decal = 'tuft' | 'flowers' | 'pebbles' | 'crack' | 'drift' | 'rust' | 'crust' | 'frost' | 'leaves'
  | 'moss' | 'heather' | 'furrow' | 'puddle' | 'flag' | 'glint' | 'slag' | 'ember'

/** A biome's paint: a base, two tints the noise pulls toward, the grass colour, and its decals. */
interface Recipe {
  base: number
  /** the broad tint (large patches) */
  a: number
  /** the fine tint (small patches) */
  b: number
  grass: number
  /** decals per 128 px cell */
  n: number
  decals: [Decal, number][]
}

const BIOME: Record<Biome, Recipe> = {
  rise:      { base: 0x8c8a58, a: 0xa29664, b: 0x757f4c, grass: 0x55602e, n: 12, decals: [['tuft', 5], ['flowers', 1], ['pebbles', 1]] },
  meadow:    { base: 0x86955a, a: 0x9ca45e, b: 0x6c8248, grass: 0x4e6428, n: 14, decals: [['tuft', 5], ['flowers', 4]] },
  forest:    { base: 0x5f7a46, a: 0x6f8a4c, b: 0x4b603a, grass: 0x39502a, n: 14, decals: [['leaves', 4], ['tuft', 3], ['moss', 1]] },
  oldgrowth: { base: 0x4a663f, a: 0x3a5436, b: 0x5f7a46, grass: 0x2c4424, n: 14, decals: [['moss', 4], ['leaves', 3], ['tuft', 2]] },
  village:   { base: 0x8d8a62, a: 0xa0906a, b: 0x747a50, grass: 0x566030, n: 10, decals: [['tuft', 4], ['flag', 2], ['pebbles', 1]] },
  marsh:     { base: 0x6d8062, a: 0x5a7058, b: 0x8a8d64, grass: 0x44562e, n: 14, decals: [['puddle', 3], ['tuft', 5]] },
  scarp:     { base: 0x8c876f, a: 0x9e9a87, b: 0x767a58, grass: 0x55602e, n: 12, decals: [['pebbles', 5], ['crack', 2], ['tuft', 2]] },
  highland:  { base: 0x84928a, a: 0xb0bcb8, b: 0x6a7a64, grass: 0x4a5a44, n: 14, decals: [['frost', 5], ['tuft', 3], ['pebbles', 1]] },
  farmland:  { base: 0x9a9358, a: 0xb0a05c, b: 0x7c8a4c, grass: 0x6a6428, n: 12, decals: [['furrow', 5], ['tuft', 2], ['flowers', 1]] },
  rust:      { base: 0x93735a, a: 0xa6684a, b: 0x7c7462, grass: 0x5a5a34, n: 12, decals: [['rust', 5], ['pebbles', 2], ['tuft', 1]] },
  moor:      { base: 0x78765a, a: 0x6c5e5a, b: 0x888a62, grass: 0x4c5030, n: 13, decals: [['heather', 5], ['tuft', 3], ['pebbles', 1]] },
  sulphur:   { base: 0x98905e, a: 0xb2a652, b: 0x847a62, grass: 0x5e5a30, n: 12, decals: [['crust', 5], ['crack', 2], ['pebbles', 1]] },
  badlands:  { base: 0x8d7560, a: 0xa08468, b: 0x6c584a, grass: 0x5a4a30, n: 12, decals: [['crack', 5], ['pebbles', 2]] },
  deeprock:  { base: 0x6f6a66, a: 0x827b72, b: 0x585452, grass: 0x444a38, n: 11, decals: [['pebbles', 4], ['crack', 3], ['glint', 1]] },
  ash:       { base: 0x69615d, a: 0x7f7773, b: 0x4c4442, grass: 0x3a3430, n: 13, decals: [['drift', 5], ['ember', 2], ['crack', 2]] },
  obsidian:  { base: 0x4d4347, a: 0x393135, b: 0x61555a, grass: 0x2a2226, n: 12, decals: [['glint', 5], ['crack', 3], ['ember', 1]] },
  slag:      { base: 0x69574f, a: 0x7d6153, b: 0x4b3d39, grass: 0x3a2e28, n: 12, decals: [['slag', 5], ['ember', 2], ['rust', 1]] },
}

/** A biome's middle tone, for the minimap and anything else that wants the ground's colour. */
export const biomeColour = (b: Biome): number => BIOME[b].base

// water, banks, cliff and lava
const DEEP = 0x2d5a70, DEEP_SEA = 0x284e66, SHELF = 0x5e98aa, ICE = 0xc2d6dc
const SAND = 0xc9b489, MUD = 0x6e6446, FROST_BANK = 0xc8d0cc
const CREST = 0xc8c0a8, FACE = 0x80786a, FOOT = 0x3a332c, CAST = 0x1e1a18
const CORE = 0xffc245, MELT = 0xef6420, CRUST = 0x3a2420, CRUST_EDGE = 0x1c1210, SCORCH = 0x2c1e18, HEAT = 0xd8602a
const PLAZA = 0xae8e62

// ---- the blended palette ---------------------------------------------------------

/** Channels per raster cell: base, a, b (rgb each), then how cold (Frostmere's ice). */
const K = 10
let palette: Float32Array | null = null

/** Each cell's recipe colours, box-blurred twice across ~96 px so region borders soften. */
function paletteGrid(): Float32Array {
  if (palette) return palette
  const r = raster()
  const g = new Float32Array(r.N * K)
  for (let i = 0; i < r.N; i++) {
    const reg = r.region[i]
    const biome: Biome = reg >= 0 ? REGIONS[reg].biome : 'rise'
    const rc = BIOME[biome]
    const o = i * K
    for (const [k, c] of [[0, rc.base], [3, rc.a], [6, rc.b]] as const) {
      g[o + k] = (c >> 16) & 255; g[o + k + 1] = (c >> 8) & 255; g[o + k + 2] = c & 255
    }
    g[o + 9] = biome === 'highland' ? 1 : 0
  }
  boxBlur(g, r.GW, r.GH, K, 1)
  boxBlur(g, r.GW, r.GH, K, 1)
  return (palette = g)
}

/** Build the fields, palette and feature layouts now, not in the first chunk's bake. */
export function warmTerrain() {
  terrainFields()
  paletteGrid()
  warmFeatures()
}

/** How far a point's palette lookup is warped, so the soft borders wander instead of following the polygons. */
const warpX = (x: number, y: number) => x + (vnoise(x * 0.005, y * 0.005, 41) - 0.5) * 110
const warpY = (x: number, y: number) => y + (vnoise(x * 0.005, y * 0.005, 43) - 0.5) * 110

/** The biome whose recipe a decal at (x, y) uses: the region under the warped point. */
function biomeAt(x: number, y: number): Biome {
  const r = raster()
  const i = r.cell(Math.min(WORLD.width - 1, Math.max(0, warpX(x, y))), Math.min(WORLD.height - 1, Math.max(0, warpY(x, y))))
  const g = i >= 0 ? r.region[i] : -1
  return g >= 0 ? REGIONS[g].biome : 'rise'
}

// ---- the wash ------------------------------------------------------------------------

let R = 0, G = 0, B = 0
const acc = new Float32Array(K)

const tint = (c: number, t: number) => {
  if (t <= 0) return
  R += (((c >> 16) & 255) - R) * t; G += (((c >> 8) & 255) - G) * t; B += ((c & 255) - B) * t
}

/** The wash colour at a world point, into R, G, B. */
function washAt(F: TerrainFields, px: number, py: number) {
  // open water far from any shore: no ground under it to work out
  if (cellValue(F, F.wet, px, py) < -150) {
    // exactly what the shore path below gives at full depth, so no seam where it hands over
    const deep = smooth(0.04, 0.34, sample(F, F.sea, px, py)) > 0.5 ? DEEP_SEA : DEEP
    R = (deep >> 16) & 255; G = (deep >> 8) & 255; B = deep & 255
    tint(0x8ec2cc, Math.max(0, fbm(px * 0.016, py * 0.016, 202, 2) - 0.62) * 0.6)
    return
  }
  // the blended recipe, looked up at a warped point
  const pal = paletteGrid()
  const { GW, GH, C } = F.r
  let u = warpX(px, py) / C - 0.5, v = warpY(px, py) / C - 0.5
  u = u < 0 ? 0 : u > GW - 1.001 ? GW - 1.001 : u
  v = v < 0 ? 0 : v > GH - 1.001 ? GH - 1.001 : v
  const i = u | 0, j = v | 0, fu = u - i, fv = v - j
  const k0 = (j * GW + i) * K, k1 = k0 + K, k2 = k0 + GW * K, k3 = k2 + K
  const w0 = (1 - fu) * (1 - fv), w1 = fu * (1 - fv), w2 = (1 - fu) * fv, w3 = fu * fv
  for (let c = 0; c < K; c++) acc[c] = pal[k0 + c] * w0 + pal[k1 + c] * w1 + pal[k2 + c] * w2 + pal[k3 + c] * w3
  const n1 = fbm(px * 0.0042, py * 0.0042, 101, 3)
  const n2 = fbm(px * 0.016, py * 0.016, 202, 2)
  const ta = smooth(0.4, 0.7, n1) * 0.9, tb = smooth(0.48, 0.76, n2) * 0.75
  R = acc[0] + (acc[3] - acc[0]) * ta; G = acc[1] + (acc[4] - acc[1]) * ta; B = acc[2] + (acc[5] - acc[2]) * ta
  R += (acc[6] - R) * tb; G += (acc[7] - G) * tb; B += (acc[8] - B) * tb
  const lum = 0.94 + 0.12 * vnoise(px * 0.045, py * 0.045, 303)
  R *= lum; G *= lum; B *= lum
  const cold = acc[9]

  // the hold's trodden clearing around the hall
  const dh = Math.hypot(px - HALL.x, (py - HALL.y) * 1.15)
  if (dh < 320) tint(PLAZA, 1 - smooth(150, 205 + (n1 - 0.5) * 120, dh))

  // cliffs: crest, face darkening to the foot, and the shadow cast downhill
  if (cellValue(F, F.cliff, px, py) < 120) {
    const sd = sample(F, F.cliff, px, py)
    const s = sample(F, F.cliffS, px, py)
    if (sd < 0) {
      const t = Math.max(0, Math.min(1, (s + 1) / 2))
      const ground = (R + G + B) / 3
      R = G = B = ground
      tint(t < 0.16 ? CREST : FACE, 0.82)
      if (t >= 0.16) tint(FOOT, smooth(0.12, 0.95, t) * 0.9)
      tint(CREST, (vnoise(px * 0.06, py * 0.02, 606) - 0.55) * 0.5)
    } else if (s > 0) tint(CAST, 0.5 * (1 - smooth(0, 80, sd)))
    else tint(CREST, 0.16 * (1 - smooth(0, 20, sd)))
  }

  // water: the bank, the shelf, the deep
  if (cellValue(F, F.wet, px, py) < 150) {
    const sd = sample(F, F.wet, px, py) + (n2 - 0.5) * 10
    const sea = smooth(0.04, 0.34, sample(F, F.sea, px, py))
    if (sd < 0) {
      const deep = smooth(4, 120, -sd)
      const shelf = mix(SHELF, ICE, Math.min(1, cold * 1.2) * (1 - smooth(0, 40, -sd)))
      R = (shelf >> 16) & 255; G = (shelf >> 8) & 255; B = shelf & 255
      tint(sea > 0.5 ? DEEP_SEA : DEEP, deep)
      tint(0x8ec2cc, Math.max(0, n2 - 0.62) * 1.2 * (1 - deep * 0.5))
    } else {
      const w = 14 + 8 * n1 + (46 + 30 * n1) * sea
      if (sd < w) {
        tint(cold > 0.5 ? FROST_BANK : mix(MUD, SAND, sea), (1 - smooth(w * 0.45, w, sd)) * 0.9)
        tint(0x3a3a2c, (1 - smooth(0, 6, sd)) * 0.45)
      }
    }
  }

  // lava: core, crust plates, a dark rim, and the scorch and glow around it
  if (cellValue(F, F.lava, px, py) < 150) {
    const sd = sample(F, F.lava, px, py)
    if (sd < 0) {
      const d = -sd
      R = (MELT >> 16) & 255; G = (MELT >> 8) & 255; B = MELT & 255
      tint(CORE, smooth(18, 110, d) * 0.9)
      tint(CRUST, smooth(0.56, 0.64, fbm(px * 0.028, py * 0.028, 505, 2)) * 0.8)
      tint(CRUST_EDGE, (1 - smooth(0, 12, d)) * 0.9)
    } else {
      tint(SCORCH, 0.75 * (1 - smooth(0, 28, sd)))
      const h = 1 - smooth(0, 130, sd)
      tint(HEAT, 0.3 * h * h)
    }
  }
}

let scratch: [HTMLCanvasElement, Ctx] | null = null

/** 1. The wash, sampled on a grid pinned to the world's origin and smoothed up. */
function paintWash(x: Ctx, wx: number, wy: number, size: number) {
  const F = terrainFields()
  const f = 1 / WASH_STEP
  const i0 = Math.floor(wx * f) - 1, j0 = Math.floor(wy * f) - 1
  const cols = Math.ceil((wx + size) * f) + 2 - i0, rows = Math.ceil((wy + size) * f) + 2 - j0
  scratch ??= makeCanvas(cols, rows)
  const [field, fx] = scratch
  if (field.width !== cols || field.height !== rows) { field.width = cols; field.height = rows }
  const img = fx.createImageData(cols, rows)
  const d = img.data
  for (let j = 0; j < rows; j++) {
    const py = (j0 + j + 0.5) / f
    for (let i = 0; i < cols; i++) {
      washAt(F, (i0 + i + 0.5) / f, py)
      const k = (j * cols + i) * 4
      d[k] = R; d[k + 1] = G; d[k + 2] = B; d[k + 3] = 255
    }
  }
  fx.putImageData(img, 0, 0)
  x.save()
  x.imageSmoothingEnabled = true
  x.imageSmoothingQuality = 'high'
  x.drawImage(field, i0 / f, j0 / f, cols / f, rows / f)
  x.restore()
}

// ---- decals ---------------------------------------------------------------------------


const FLOWERS = [0xf1e4c3, 0xf2c24e, 0xe8a0b8, 0xc8d8f0]

function dot(p: Path2D, x: number, y: number, rx: number, ry = rx, rot = 0) {
  p.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx)
  p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
}

function zigzag(p: Path2D, rng: Mulberry, x: number, y: number, n: number, step: number) {
  let a = rng.range(0, Math.PI * 2)
  p.moveTo(x, y)
  for (let k = 0; k < n; k++) {
    a += rng.range(-0.9, 0.9)
    x += Math.cos(a) * step * rng.range(0.6, 1.2); y += Math.sin(a) * step * 0.6 * rng.range(0.6, 1.2)
    p.lineTo(x, y)
  }
}

function decal(bt: Batch, rng: Mulberry, kind: Decal, rc: Recipe, x: number, y: number) {
  switch (kind) {
    case 'tuft': {
      const s = rng.range(0.8, 1.3)
      const p = bt.stroke(rc.grass, 0.6, 1.8)
      for (const [dx, h] of [[-2.2, 8], [0, 11], [2.2, 8.4], [-1, 9.6]]) {
        p.moveTo(x + dx * 0.8 * s, y)
        p.quadraticCurveTo(x + dx * 1.6 * s, y - h * 0.5 * s, x + dx * 2.6 * s, y - h * s)
      }
      const q = bt.stroke(mix(rc.grass, 0xfff0c0, 0.45), 0.45, 1.4)
      q.moveTo(x - 0.8 * s, y); q.quadraticCurveTo(x - 1.2 * s, y - 5 * s, x - 2.8 * s, y - 8.4 * s)
      break
    }
    case 'flowers': {
      const p = bt.fill(FLOWERS[(rng.next() * FLOWERS.length) | 0], 0.9)
      for (let k = 0, n = 3 + ((rng.next() * 4) | 0); k < n; k++) dot(p, x + rng.range(-9, 9), y + rng.range(-5, 5), rng.range(1.3, 2.1))
      break
    }
    case 'pebbles': {
      const f = bt.fill(mix(rc.a, 0x9a9480, 0.5), 0.9), l = bt.stroke(INK, 0.35, 1)
      for (let k = 0, n = 1 + ((rng.next() * 3) | 0); k < n; k++) {
        const px = x + rng.range(-8, 8), py = y + rng.range(-4, 4), rx = rng.range(2, 4.5), ry = rx * rng.range(0.55, 0.8)
        dot(f, px, py, rx, ry); dot(l, px, py, rx, ry)
      }
      break
    }
    case 'crack': zigzag(bt.stroke(0x241a14, 0.45, 1.5), rng, x, y, 3 + ((rng.next() * 2) | 0), 11); break
    case 'drift': dot(bt.fill(0xa8a09a, 0.22), x, y, rng.range(10, 22), rng.range(3, 6), rng.range(-0.3, 0.3)); break
    case 'rust': {
      const p = bt.stroke(0x9a4a28, 0.32, rng.range(2.5, 4.5))
      const a = fbm(x * 0.002, y * 0.002, 707, 2) * Math.PI, L = rng.range(10, 24)
      p.moveTo(x, y); p.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L * 0.6)
      break
    }
    case 'crust': {
      dot(bt.fill(0xd8c040, 0.5), x, y, rng.range(5, 11), rng.range(3, 6), rng.range(0, Math.PI))
      const w = bt.fill(0xf4f0c8, 0.8)
      for (let k = 0; k < 3; k++) dot(w, x + rng.range(-6, 6), y + rng.range(-3, 3), 1.1)
      break
    }
    case 'frost': {
      const p = bt.stroke(0xeef4f4, 0.55, 1.2)
      const s = rng.range(3, 5)
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI
        p.moveTo(x - Math.cos(a) * s, y - Math.sin(a) * s); p.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s)
      }
      dot(bt.fill(0xe4eef0, 0.3), x + rng.range(-12, 12), y + rng.range(-6, 6), rng.range(6, 12), rng.range(2, 4))
      break
    }
    case 'leaves': {
      const p = bt.fill([0x8a6a36, 0x6e5a36, 0x9a7a3a][(rng.next() * 3) | 0], 0.7)
      for (let k = 0; k < 3; k++) dot(p, x + rng.range(-8, 8), y + rng.range(-5, 5), rng.range(2, 3.6), rng.range(1, 1.8), rng.range(0, Math.PI))
      break
    }
    case 'moss': dot(bt.fill(0x2e4a26, 0.3), x, y, rng.range(8, 16), rng.range(4, 8), rng.range(0, Math.PI)); break
    case 'heather': {
      const p = bt.fill(rng.next() < 0.6 ? 0x8a5a7a : 0x6e4a66, 0.75)
      for (let k = 0; k < 5; k++) dot(p, x + rng.range(-7, 7), y + rng.range(-4, 4), rng.range(1.2, 2))
      break
    }
    case 'furrow': {
      // rows keep one direction across a field; fields change it
      const a = Math.floor(fbm(x * 0.0015, y * 0.0015, 808, 2) * 4) * (Math.PI / 4) + 0.1
      const p = bt.stroke(0x6a5a30, 0.3, 1.6)
      const cx = Math.cos(a), cy = Math.sin(a) * 0.6
      for (let k = -1; k <= 1; k++) {
        const ox = -cy * k * 6, oy = cx * k * 6
        p.moveTo(x + ox - cx * 14, y + oy - cy * 14); p.lineTo(x + ox + cx * 14, y + oy + cy * 14)
      }
      break
    }
    case 'puddle': {
      const rx = rng.range(6, 14), ry = rx * 0.45
      dot(bt.fill(0x4a6a6a, 0.55), x, y, rx, ry)
      dot(bt.stroke(0xb8d0cc, 0.4, 1.2), x - 1, y - 1, rx * 0.8, ry * 0.7)
      break
    }
    case 'flag': {
      const s = rng.range(5, 9), a = rng.range(-0.4, 0.4)
      const pts = [[-s, -s * 0.6], [s, -s * 0.6], [s, s * 0.6], [-s, s * 0.6]].map(([u, v]) => [x + u * Math.cos(a) - v * Math.sin(a), y + u * Math.sin(a) + v * Math.cos(a)])
      for (const p of [bt.fill(0xa8a08a, 0.8), bt.stroke(INK, 0.4, 1.1)]) {
        p.moveTo(pts[0][0], pts[0][1]); for (const q of pts) p.lineTo(q[0], q[1]); p.closePath()
      }
      break
    }
    case 'glint': {
      const p = bt.stroke(0xc8b8e8, 0.7, 1.2)
      const L = rng.range(3, 6)
      p.moveTo(x - L, y + L * 0.4); p.lineTo(x + L, y - L * 0.4)
      dot(bt.fill(0x1a1418, 0.6), x, y + 2, L * 1.4, L * 0.5)
      break
    }
    case 'slag': {
      dot(bt.fill(0x3a2e2a, 0.8), x, y, rng.range(4, 8), rng.range(2.5, 4.5))
      dot(bt.fill(0x8a6a58, 0.5), x - 1.5, y - 1.5, 2, 1.2)
      break
    }
    case 'ember': {
      const pts = [x, y]
      let a = rng.range(0, Math.PI * 2), px = x, py = y
      for (let k = 0; k < 3; k++) { a += rng.range(-0.9, 0.9); px += Math.cos(a) * 10; py += Math.sin(a) * 6; pts.push(px, py) }
      for (const p of [bt.stroke(0xff5a1a, 0.18, 5, 'lighter'), bt.stroke(0xff8a3a, 0.8, 1.6)]) {
        p.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) p.lineTo(pts[k], pts[k + 1])
      }
      break
    }
  }
}

/** 2. Per-biome decals, dealt per 128 px cell and drawn in batches. */
function paintDecals(x: Ctx, rect: Rect) {
  const F = terrainFields()
  const r = F.r
  const bt = new Batch()
  const lastX = Math.ceil(WORLD.width / CELL) - 1, lastY = Math.ceil(WORLD.height / CELL) - 1
  const i0 = Math.max(0, Math.floor((rect.x0 - DECAL_REACH) / CELL)), i1 = Math.min(lastX, Math.floor((rect.x1 + DECAL_REACH) / CELL))
  const j0 = Math.max(0, Math.floor((rect.y0 - DECAL_REACH) / CELL)), j1 = Math.min(lastY, Math.floor((rect.y1 + DECAL_REACH) / CELL))
  for (let cy = j0; cy <= j1; cy++) for (let cx = i0; cx <= i1; cx++) {
    const rc0 = BIOME[biomeAt((cx + 0.5) * CELL, (cy + 0.5) * CELL)]
    const n = rc0.n + 4
    for (let k = 0; k < n; k++) {
      const rng = new Mulberry(hash32(cx * 64 + k, cy, 404))
      const wx = (cx + rng.next()) * CELL, wy = (cy + rng.next()) * CELL
      if (wx < rect.x0 - DECAL_REACH || wx > rect.x1 + DECAL_REACH || wy < rect.y0 - DECAL_REACH || wy > rect.y1 + DECAL_REACH) continue
      if (wx >= WORLD.width || wy >= WORLD.height) continue
      const rc = BIOME[biomeAt(wx, wy)]
      if (k >= rc.n) continue
      const i = r.cell(wx, wy)
      if (r.terrain[i] !== T.LAND || r.crossing[i] >= 0 || (r.road[i] && rng.next() < 0.8)) continue
      if (cellValue(F, F.wet, wx, wy) < 24 || cellValue(F, F.lava, wx, wy) < 40 || cellValue(F, F.cliff, wx, wy) < 16) continue
      if (Math.hypot(wx - HALL.x, (wy - HALL.y) * 1.15) < 190) continue
      // clustered: most decals gather where the noise says so, a few stray
      if (fbm(wx * 0.01, wy * 0.01, 405, 2) < 0.42 && rng.next() < 0.6) continue
      let pick = rng.next() * rc.decals.reduce((s, d) => s + d[1], 0)
      let kind = rc.decals[0][0]
      for (const [d, w] of rc.decals) { if ((pick -= w) < 0) { kind = d; break } }
      decal(bt, rng, kind, rc, wx, wy)
    }
  }
  bt.flush(x)
}

// ---- set pieces, in texels at S ---------------------------------------------------------

/** A rectangle in texels at scale S, which is where the old brushwork draws. */
interface Box { x0: number; y0: number; x1: number; y1: number }

const meets = (b: Box, x0: number, y0: number, x1: number, y1: number) =>
  x1 >= b.x0 && x0 <= b.x1 && y1 >= b.y0 && y0 <= b.y1

const CX = HALL.x, CY = HALL.y

/** The plaza: laid cobbles around the hall, feathering out at the edge. */
function paintPlaza(x: Ctx, b: Box) {
  const pcx = CX * S, pcy = (CY + 30) * S
  const reach = (70 + 8 * 11) * S + 4
  if (!meets(b, pcx - reach, pcy - reach, pcx + reach, pcy + reach)) return
  const r = new Rng(31337)
  for (let ring = 0; ring < 9; ring++) {
    const rad = (70 + ring * 11) * S
    const n = Math.round((rad * Math.PI * 2) / 6.4)
    const skip = ring < 5 ? 0.02 : 0.2 + (ring - 5) * 0.2
    for (let i = 0; i < n; i++) {
      if (r.next() < skip) continue
      const a = (i / n) * Math.PI * 2 + ring * 0.37
      const px = pcx + Math.cos(a) * rad, py = pcy + Math.sin(a) * rad * 0.8
      const s2 = r.range(2.4, 3.2)
      const tone = mix(0xbcb098, r.next() < 0.5 ? 0xfff4e0 : 0x5a4a3a, r.range(0.04, 0.22))
      if (!meets(b, px - 4, py - 4, px + 4, py + 4)) continue
      const stone = P.blob([[px - s2, py - s2 * 0.62], [px + s2, py - s2 * 0.7], [px + s2 * 1.05, py + s2 * 0.62], [px - s2 * 0.95, py + s2 * 0.7]], 0.9)
      form(x, stone, tone, { rim: 0.5, core: 1.1 })
      line(x, stone, 0.55, INK, 0.45)
    }
  }
  // a kerb of larger dressed stones at the inner edge
  const kn = 34
  for (let i = 0; i < kn; i++) {
    const a = (i / kn) * Math.PI * 2
    const px = pcx + Math.cos(a) * 64 * S, py = pcy + Math.sin(a) * 64 * S * 0.8
    if (!meets(b, px - 4, py - 3, px + 4, py + 3)) continue
    const stone = P.round(px - 3.2, py - 2, 6.4, 4, 1.4)
    form(x, stone, 0xc8bea6, { rim: 0.6, core: 1.2 })
    line(x, stone, 0.6, INK, 0.55)
  }
}

/** Scorched earth around every warcamp. */
function paintCamps(x: Ctx, b: Box) {
  CAMPS.forEach((c, ci) => {
    const cx = c.x * S, cy = (c.y - 10) * S
    if (!meets(b, cx - 70, cy - 70, cx + 70, cy + 70)) return
    const g = x.createRadialGradient(cx, cy, 4, cx, cy, 70)
    g.addColorStop(0, css(0x2a1e18, 0.75)); g.addColorStop(0.6, css(0x3a2a22, 0.35)); g.addColorStop(1, css(0x3a2a22, 0))
    x.fillStyle = g
    x.beginPath(); x.ellipse(cx, cy, 70, 42, 0, 0, Math.PI * 2); x.fill()
    const r = new Rng(hash32(ci, 0, 606))
    for (let i = 0; i < 18; i++) {
      const a = r.range(0, Math.PI * 2), d = r.range(10, 50)
      fill(x, P.circle(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6, r.range(0.5, 1.2)), 0xff8a3a, 0.7)
    }
  })
}

/**
 * Paint world rect [wx, wx+size) × [wy, wy+size). `x` arrives with a
 * transform from world px to canvas px, usually clipped to the part the
 * caller keeps; strokes may land past the rect. The same world pixel always
 * comes out the same, whichever rect it was painted as part of.
 */
export function paintTerrainRect(x: Ctx, wx: number, wy: number, size: number, _scale: number) {
  const rect: Rect = { x0: wx, y0: wy, x1: wx + size, y1: wy + size }
  x.save()
  paintWash(x, wx, wy, size)
  paintDecals(x, rect)
  paintFeatureLines(x, rect)
  paintRoads(x, rect)
  paintCrossings(x, rect)
  paintClaimTint(x, rect)
  // the set pieces are drawn in texels at S, the resolution they were designed at
  x.scale(1 / S, 1 / S)
  const b: Box = { x0: wx * S, y0: wy * S, x1: (wx + size) * S, y1: (wy + size) * S }
  paintPlaza(x, b)
  paintCamps(x, b)
  // paper tooth over everything, pinned to the world's origin
  const W = WORLD.width * S, H = WORLD.height * S
  applyGrain(x, W, H, 0.07)
  // a whisper of warm vignette toward the world's edge, as if the page ends
  const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75)
  g.addColorStop(0, css(0x000000, 0)); g.addColorStop(1, css(0x3a2414, 0.35))
  x.fillStyle = g; x.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0)
  x.restore()
}

// ---- the unexplored: blank vellum with a cartographer's sketch -------------------------

/** Which of the surveyor's symbol sets sketches each biome on the vellum. */
type MarkSet = 'hold' | 'whisperwood' | 'greyfall' | 'hollow' | 'deepvein' | 'ashgate' | 'plaza' | 'none'
const MARK: Record<Biome, MarkSet> = {
  rise: 'hold', meadow: 'hold', farmland: 'hold', highland: 'greyfall',
  forest: 'whisperwood', oldgrowth: 'whisperwood', marsh: 'whisperwood',
  scarp: 'greyfall', village: 'hollow', moor: 'hollow', badlands: 'hollow',
  rust: 'deepvein', sulphur: 'deepvein', deeprock: 'deepvein',
  ash: 'ashgate', obsidian: 'ashgate', slag: 'ashgate',
}

/**
 * What the fog of war is painted with. Unwalked ground is not black; it is
 * the page before the chronicle reaches it — vellum, with the surveyor's
 * guesses inked on in thin line: little trees over the forest, carets over the
 * scarp, broken walls for the village, a skull at Ashgate. Walking there
 * erases the sketch and leaves the painting underneath.
 */
export function buildVellumTexture(scene: Phaser.Scene, fogScale: number) {
  const W = Math.ceil(WORLD.width / fogScale)
  const H = Math.ceil(WORLD.height / fogScale)
  const k = 1 / fogScale
  // The page was drawn at 4 world px per texel. Noise keeps its world size;
  // the ink marks keep their texel size (a coarser sheet draws bolder marks),
  // so they are dealt more sparsely to leave the page as open as it was.
  const s = fogScale / 4
  const sparse = 1 / (s * s)
  const [c, x] = makeCanvas(W, H)
  const r = new Rng(4242)

  // the page, sampled at no finer than 4 texels to the old sheet's 1 and
  // smoothed up: it is low-frequency paper, and the frontier's sheet is 10x
  // the old one's texels
  {
    const d = Math.max(1, Math.round(s))
    const pw = Math.ceil(W / d), ph = Math.ceil(H / d)
    const [pc, px] = makeCanvas(pw, ph)
    const img = px.createImageData(pw, ph)
    for (let j = 0; j < ph; j++) {
      for (let i = 0; i < pw; i++) {
        const n = fbm(i * d * 0.02 * s, j * d * 0.02 * s, 900, 4)
        const m = fbm(i * d * 0.08 * s, j * d * 0.08 * s, 901, 2)
        const col = mix(mix(0xd8c49a, 0xefe0bc, n), 0xc8b088, Math.max(0, m - 0.6) * 1.2)
        const q = (j * pw + i) * 4
        img.data[q] = (col >> 16) & 255
        img.data[q + 1] = (col >> 8) & 255
        img.data[q + 2] = col & 255
        img.data[q + 3] = 255
      }
    }
    px.putImageData(img, 0, 0)
    x.imageSmoothingEnabled = true
    x.drawImage(pc, 0, 0, pw * d, ph * d)
  }

  // foxing: age spots
  for (let i = 0; i < Math.round(90 * sparse); i++) {
    const px = r.range(0, W), py = r.range(0, H), rad = r.range(3, 14)
    const g = x.createRadialGradient(px, py, 0, px, py, rad)
    g.addColorStop(0, css(0x9a7a4a, 0.22)); g.addColorStop(1, css(0x9a7a4a, 0))
    x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fill()
  }

  const inkA = 0.55
  const sepia = 0x5a3e26

  // contour lines, the way old maps drew the lie of the land
  {
    const step = 3
    const gw = Math.ceil(W / step) + 1, gh = Math.ceil(H / step) + 1
    const hgt = new Float32Array(gw * gh)
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) hgt[j * gw + i] = fbm(i * step * 0.012 * s, j * step * 0.012 * s, 950, 3)
    x.fillStyle = css(sepia, 0.15)
    for (let level = 0.3; level < 0.8; level += 0.08) {
      for (let j = 0; j < gh - 1; j++) {
        for (let i = 0; i < gw - 1; i++) {
          const a = hgt[j * gw + i]
          if ((a - level) * (hgt[j * gw + i + 1] - level) < 0 || (a - level) * (hgt[(j + 1) * gw + i] - level) < 0) {
            x.fillRect(i * step, j * step, 1.3, 1.3)
          }
        }
      }
    }
  }

  const sym = {
    tree: (px: number, py: number) => {
      line(x, xx => { xx.moveTo(px, py + 3); xx.lineTo(px, py) }, 0.7, sepia, inkA)
      line(x, xx => { xx.arc(px, py - 2, 2.4, 0, Math.PI * 2) }, 0.7, sepia, inkA)
    },
    pine: (px: number, py: number) => {
      line(x, xx => { xx.moveTo(px - 2.4, py + 2); xx.lineTo(px, py - 4); xx.lineTo(px + 2.4, py + 2); xx.closePath(); xx.moveTo(px, py + 2); xx.lineTo(px, py + 3.5) }, 0.7, sepia, inkA)
    },
    peak: (px: number, py: number) => {
      line(x, xx => { xx.moveTo(px - 5, py + 2); xx.lineTo(px - 1, py - 4); xx.lineTo(px + 1, py - 1); xx.lineTo(px + 2.5, py - 3); xx.lineTo(px + 6, py + 2) }, 0.8, sepia, inkA)
      line(x, xx => { xx.moveTo(px - 1, py - 4); xx.lineTo(px + 0.2, py + 2) }, 0.5, sepia, inkA * 0.6)
    },
    ruin: (px: number, py: number) => {
      line(x, xx => { xx.moveTo(px - 4, py + 2); xx.lineTo(px - 4, py - 3); xx.lineTo(px - 1, py - 3); xx.lineTo(px - 1, py - 1); xx.lineTo(px + 2, py - 1); xx.lineTo(px + 2, py - 4); xx.lineTo(px + 4, py - 2); xx.lineTo(px + 4, py + 2) }, 0.7, sepia, inkA)
    },
    pick: (px: number, py: number) => {
      line(x, xx => { xx.moveTo(px - 3, py + 3); xx.lineTo(px + 3, py - 3); xx.moveTo(px - 1, py - 4); xx.quadraticCurveTo(px + 3, py - 4, px + 4, py) }, 0.8, sepia, inkA)
    },
    flame: (px: number, py: number) => {
      line(x, xx => { xx.moveTo(px, py + 3); xx.quadraticCurveTo(px - 3, py, px - 0.5, py - 4); xx.quadraticCurveTo(px + 0.5, py - 1, px + 1.5, py - 2); xx.quadraticCurveTo(px + 3, py + 1, px, py + 3) }, 0.7, 0x8a2a18, inkA)
    },
    grass: (px: number, py: number) => {
      line(x, xx => { xx.moveTo(px - 1.5, py); xx.lineTo(px - 2.2, py - 2.4); xx.moveTo(px, py); xx.lineTo(px, py - 3); xx.moveTo(px + 1.5, py); xx.lineTo(px + 2.2, py - 2.4) }, 0.6, sepia, inkA * 0.7)
    },
  }

  // the surveyor's guess at each region, by its biome
  const markSym: Record<MarkSet, ((px: number, py: number) => void)[]> = {
    hold: [sym.grass, sym.grass, sym.tree],
    whisperwood: [sym.tree, sym.pine, sym.pine],
    greyfall: [sym.peak, sym.peak, sym.grass],
    hollow: [sym.ruin, sym.tree, sym.grass],
    deepvein: [sym.pick, sym.peak, sym.grass],
    ashgate: [sym.flame, sym.flame, sym.ruin],
    plaza: [], none: [],
  }
  const rs = raster()
  for (const z of REGIONS) {
    if (z.id === 'hold') continue
    const list = markSym[MARK[z.biome]]
    const xs = z.poly.map(p => p[0]), ys = z.poly.map(p => p[1])
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const n = Math.round(polyArea(z.poly) / 26000 * sparse)
    for (let i = 0, tries = 0; i < n && tries < n * 4; tries++) {
      const wx = r.range(x0, x1), wy = r.range(y0, y1)
      // only on dry land inside the region: the sketch does not know the rivers yet
      if (!inPoly(wx, wy, z.poly) || rs.terrain[rs.cell(wx, wy)] !== T.LAND) continue
      r.pick(list)(wx * k, wy * k)
      i++
    }
    // the surveyor's name for it, in a small italic hand
    const [lx, ly] = polyCentroid(z.poly)
    x.save()
    x.font = `italic 600 ${Math.max(10, Math.round(48 * k))}px "Alegreya Sans", Georgia, serif`
    x.fillStyle = css(sepia, 0.55)
    x.textAlign = 'center'
    x.fillText(z.name.replace(/^The /, ''), lx * k, ly * k)
    x.restore()
  }
  // a skull over the fortress, because the map-maker knew
  {
    const camp = CAMPS.find(cc => cc.id === 'campAshgate')
    if (camp) {
      const px = camp.x * k, py = camp.y * k
      line(x, xx => { xx.arc(px, py - 1, 4, 0, Math.PI * 2) }, 0.9, 0x8a2a18, 0.7)
      fill(x, P.circle(px - 1.5, py - 1.5, 0.9), 0x8a2a18, 0.7)
      fill(x, P.circle(px + 1.5, py - 1.5, 0.9), 0x8a2a18, 0.7)
      line(x, xx => { xx.moveTo(px - 5, py + 5); xx.lineTo(px + 5, py + 9); xx.moveTo(px + 5, py + 5); xx.lineTo(px - 5, py + 9) }, 0.9, 0x8a2a18, 0.7)
    }
  }
  // a compass rose in the corner, and a ruled border
  {
    const px = W - 44, py = H - 44
    line(x, xx => { xx.arc(px, py, 22, 0, Math.PI * 2); xx.moveTo(px + 16, py); xx.arc(px, py, 16, 0, Math.PI * 2) }, 0.7, sepia, 0.5)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 - Math.PI / 2
      fill(x, P.poly([[px + Math.cos(a) * 26, py + Math.sin(a) * 26], [px + Math.cos(a + 1.3) * 5, py + Math.sin(a + 1.3) * 5], [px, py], [px + Math.cos(a - 1.3) * 5, py + Math.sin(a - 1.3) * 5]]), i === 0 ? 0x8a2a18 : sepia, 0.55)
    }
    x.save()
    x.font = `700 9px "Alegreya Sans SC", Georgia, serif`
    x.fillStyle = css(0x8a2a18, 0.6); x.textAlign = 'center'
    x.fillText('N', px, py - 30)
    x.restore()
    line(x, P.rect(6, 6, W - 12, H - 12), 1, sepia, 0.35)
    line(x, P.rect(10, 10, W - 20, H - 20), 0.5, sepia, 0.3)
  }

  register(scene, 'fog_vellum', c)
}
