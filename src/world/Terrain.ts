import Phaser from 'phaser'
import { WORLD } from '../config/balance'
import { ZONES, WALL_RING, PADS, SPAWN_GATES, CAMPS, type ZoneId } from '../config/map'
import { PAL } from '../config/palette'
import { applyGrain, css, fill, form, glow, line, makeCanvas, mix, P, Rng, register, shade, INK, type Ctx } from '../art/ink'

/**
 * The ground, painted a piece at a time.
 *
 * The old ground was 64px tiles stamped into a grid, and every biome edge and
 * the hold's dirt clearing gave the grid away in hard squares. This paints it
 * instead: a colour field sampled from noise-warped biomes, laid down at
 * quarter resolution so the upscale blends it like a wash, and then brushed
 * over in ink — tufts, flowers, slabs, rubble, embers, roads and a cobbled
 * plaza around the hall.
 *
 * `paintTerrainRect` paints any rectangle of the world, and every stroke in it
 * is a function of world position alone. The wash samples noise on a grid
 * pinned to the world's origin; the scattered brushwork is dealt per 128 px
 * cell, each stroke seeded from its cell and its index; the set pieces (roads,
 * the plaza, camps, gates) are laid out once and drawn wherever they overlap.
 * So two pieces that meet paint the same pixels along the join, and
 * TerrainChunks can bake the world in any order without a seam.
 */

/** The texture scale the brushwork was drawn for: its sizes are texels at this scale. */
const S = 0.5
const FIELD = 0.25       // the colour field underneath is quarter world resolution
const CELL = 128         // brushwork is dealt per cell of this many world px
const DABS_EXTRA = 0.47  // a cell gets 4 mottling dabs, or 5 this often (2,600 over the old world)
const MARKS = 24         // detail marks per cell (14,000 over the old world)
const MARK_REACH = 48    // world px a detail mark can stray from where it is dealt

type Biome = ZoneId | 'wild' | 'plaza'

// ---- noise -----------------------------------------------------------------

function hash32(ix: number, iy: number, seed: number) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

function hash(ix: number, iy: number, seed: number) {
  return hash32(ix, iy, seed) / 4294967296
}

function vnoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed)
  const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

function fbm(x: number, y: number, seed: number, oct = 4) {
  let v = 0, amp = 0.5, f = 1, norm = 0
  for (let o = 0; o < oct; o++) {
    v += vnoise(x * f, y * f, seed + o * 17) * amp
    norm += amp
    amp *= 0.5
    f *= 2.03
  }
  return v / norm
}

/** The generator for stroke `k` of cell (cx, cy): the same stroke wherever it is painted from. */
function strokeRng(cx: number, cy: number, k: number, seed: number) {
  return new Rng(hash32(cx * 64 + k, cy, seed))
}

// ---- biomes ------------------------------------------------------------------
//
// Per-biome colour lives here: `biomeAt` says which biome a point is in, TONES
// holds each biome's palette, and `toneAt` mixes the wash colour from it. The
// brushwork in `paintMarks` switches on the biome for its marks.

const CX = WORLD.centerX, CY = WORLD.centerY

/** Which biome a world point belongs to, with the borders warped by noise. */
function biomeAt(wx: number, wy: number): Biome {
  const wxp = wx + (fbm(wx * 0.004, wy * 0.004, 11, 3) - 0.5) * 220
  const wyp = wy + (fbm(wx * 0.004, wy * 0.004, 29, 3) - 0.5) * 220
  // the hold's trodden clearing around the hall
  const d = Math.hypot(wx - CX, (wy - CY) * 1.15)
  if (d < 205 + (fbm(wx * 0.012, wy * 0.012, 5, 3) - 0.5) * 110) return 'plaza'
  for (const z of ZONES) {
    if (z.id === 'hold') continue
    if (wxp > z.x && wxp < z.x + z.w && wyp > z.y && wyp < z.y + z.h) return z.id
  }
  const hold = ZONES[0]
  if (wxp > hold.x && wxp < hold.x + hold.w && wyp > hold.y && wyp < hold.y + hold.h) return 'hold'
  return 'wild'
}

interface Tones { lo: number; mid: number; hi: number; accent?: number }

const TONES: Record<Biome, Tones> = {
  hold: { lo: 0x66743e, mid: 0x7f8c4c, hi: 0x9ba85e, accent: 0xa89a5a },
  wild: { lo: 0x62703c, mid: 0x7a8749, hi: 0x949f58, accent: 0xa0925a },
  whisperwood: { lo: 0x44583a, mid: 0x566b3e, hi: 0x6d7c44, accent: 0x6e5a36 },
  greyfall: { lo: 0x7a7568, mid: 0x928c7c, hi: 0xa9a28f, accent: 0x7f8a54 },
  hollow: { lo: 0x6a6a50, mid: 0x7e7c5e, hi: 0x949070, accent: 0x7a6a4a },
  deepvein: { lo: 0x564636, mid: 0x6c5a44, hi: 0x806c52, accent: 0x8a4a2e },
  ashgate: { lo: 0x3a3230, mid: 0x4c4240, hi: 0x5e524c, accent: 0x6a3024 },
  plaza: { lo: 0x9a7a52, mid: 0xae8e62, hi: 0xc2a476, accent: 0x8a6a48 },
}

function toneAt(b: Biome, wx: number, wy: number) {
  const t = TONES[b]
  const n = fbm(wx * 0.006, wy * 0.006, 101, 4)
  const m = fbm(wx * 0.02, wy * 0.02, 202, 2)
  let c = n < 0.5 ? mix(t.lo, t.mid, n * 2) : mix(t.mid, t.hi, (n - 0.5) * 2)
  c = mix(c, m > 0.5 ? t.hi : t.lo, Math.abs(m - 0.5) * 0.5)
  // sun-bleached patches of dry grass, and dark hollows
  if (t.accent !== undefined) {
    const a = fbm(wx * 0.0035, wy * 0.0035, 303, 3)
    if (a > 0.62) c = mix(c, t.accent, Math.min(0.55, (a - 0.62) * 3))
  }
  return c
}

// ---- the painting ---------------------------------------------------------------

/** A rectangle in texels at scale S, which is where the brushwork draws. */
interface Box { x0: number; y0: number; x1: number; y1: number }

const meets = (b: Box, x0: number, y0: number, x1: number, y1: number) =>
  x1 >= b.x0 && x0 <= b.x1 && y1 >= b.y0 && y0 <= b.y1

/** Visit, in row-major order, every cell whose strokes could reach the rect. */
function forCells(wx: number, wy: number, size: number, reach: number, visit: (cx: number, cy: number) => void) {
  const last = Math.ceil(WORLD.width / CELL) - 1, lastRow = Math.ceil(WORLD.height / CELL) - 1
  const i0 = Math.max(0, Math.floor((wx - reach) / CELL)), i1 = Math.min(last, Math.floor((wx + size + reach) / CELL))
  const j0 = Math.max(0, Math.floor((wy - reach) / CELL)), j1 = Math.min(lastRow, Math.floor((wy + size + reach) / CELL))
  for (let cy = j0; cy <= j1; cy++) for (let cx = i0; cx <= i1; cx++) visit(cx, cy)
}

let scratch: [HTMLCanvasElement, Ctx] | null = null

/** 1. The colour field, as a wash, sampled on a grid pinned to the world's origin. */
function paintWash(x: Ctx, wx: number, wy: number, size: number, scale: number) {
  const f = Math.min(FIELD, scale / 2)
  const i0 = Math.floor(wx * f) - 2, j0 = Math.floor(wy * f) - 2
  const cols = Math.ceil((wx + size) * f) + 2 - i0, rows = Math.ceil((wy + size) * f) + 2 - j0
  scratch ??= makeCanvas(cols, rows)
  const [field, fx] = scratch
  if (field.width !== cols || field.height !== rows) { field.width = cols; field.height = rows }
  const img = fx.createImageData(cols, rows)
  for (let j = 0; j < rows; j++) {
    const py = (j0 + j + 0.5) / f
    for (let i = 0; i < cols; i++) {
      const px = (i0 + i + 0.5) / f
      const c = toneAt(biomeAt(px, py), px, py)
      const k = (j * cols + i) * 4
      img.data[k] = (c >> 16) & 255
      img.data[k + 1] = (c >> 8) & 255
      img.data[k + 2] = c & 255
      img.data[k + 3] = 255
    }
  }
  fx.putImageData(img, 0, 0)
  x.save()
  x.imageSmoothingEnabled = true
  x.imageSmoothingQuality = 'high'
  x.drawImage(field, i0 / f, j0 / f, cols / f, rows / f)
  x.restore()
}

/** 2. Brush mottling: soft dabs so the wash reads as paint, not a gradient. */
function paintDabs(x: Ctx, b: Box, wx: number, wy: number, size: number) {
  forCells(wx, wy, size, 70, (cx, cy) => {
    const n = hash(cx, cy, 211) < DABS_EXTRA ? 5 : 4
    for (let k = 0; k < n; k++) {
      const r = strokeRng(cx, cy, k, 212)
      const wxd = (cx + r.next()) * CELL, wyd = (cy + r.next()) * CELL
      const rad = r.range(10, 34)
      const px = wxd * S, py = wyd * S
      if (wxd >= WORLD.width || wyd >= WORLD.height || !meets(b, px - rad, py - rad, px + rad, py + rad)) continue
      const t = TONES[biomeAt(wxd, wyd)]
      const c = r.next() < 0.5 ? t.hi : t.lo
      x.save()
      x.translate(px, py); x.rotate(r.range(0, Math.PI)); x.scale(1, r.range(0.35, 0.7))
      const g = x.createRadialGradient(0, 0, 0, 0, 0, rad)
      g.addColorStop(0, css(c, 0.22)); g.addColorStop(1, css(c, 0))
      x.fillStyle = g
      x.beginPath(); x.arc(0, 0, rad, 0, Math.PI * 2); x.fill()
      x.restore()
    }
  })
}

/** 3. Roads: trodden earth with ruts and an inked verge. Laid out once. */
interface Road { pts: [number, number][]; width: number; box: Box }
let roads: Road[] | null = null

function layRoads(): Road[] {
  if (roads) return roads
  const out: Road[] = []
  const road = (ax: number, ay: number, bx: number, by: number, width: number) => {
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 40))
    const pts: [number, number][] = []
    const nx = -(by - ay), ny = bx - ax
    const nl = Math.hypot(nx, ny) || 1
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const wob = i === 0 || i === n ? 0 : (fbm(t * 3, ax * 0.01, 77, 2) - 0.5) * 70
      pts.push([(ax + (bx - ax) * t + (nx / nl) * wob) * S, (ay + (by - ay) * t + (ny / nl) * wob) * S])
    }
    const pad = width * S + 6
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    for (const [px, py] of pts) {
      box.x0 = Math.min(box.x0, px - pad); box.y0 = Math.min(box.y0, py - pad)
      box.x1 = Math.max(box.x1, px + pad); box.y1 = Math.max(box.y1, py + pad)
    }
    out.push({ pts, width, box })
  }
  for (const gate of WALL_RING.gates) road(CX, CY, gate.x, gate.y, 58)
  for (const gate of SPAWN_GATES) {
    const nearest = WALL_RING.gates.reduce((a, b) =>
      Math.hypot(b.x - gate.x, b.y - gate.y) < Math.hypot(a.x - gate.x, a.y - gate.y) ? b : a)
    road(nearest.x, nearest.y, gate.x, gate.y, 44)
  }
  // footpaths out to the nearer sites; the towers on the rampart are reached
  // across the grass, which keeps the hold from reading as a starburst
  for (const pad of PADS) {
    if (pad.zone !== 'hold' || pad.key === 'wall' || pad.key === 'gate') continue
    if (pad.key === 'watchtower' || pad.key === 'cannonTower') continue
    const dx = pad.x - CX, dy = pad.y - CY
    const d = Math.hypot(dx, dy) || 1
    if (d > 420) continue
    road(CX + (dx / d) * 170, CY + (dy / d) * 150, pad.x, pad.y + 10, 20)
  }
  return (roads = out)
}

function paintRoads(x: Ctx, b: Box) {
  for (const { pts, width, box } of layRoads()) {
    if (!meets(b, box.x0, box.y0, box.x1, box.y1)) continue
    const trace = (xx: Ctx) => {
      xx.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2
        xx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my)
      }
      xx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
    }
    x.save()
    x.lineCap = 'round'; x.lineJoin = 'round'
    x.beginPath(); trace(x)
    x.strokeStyle = css(0x5a4a30, 0.22); x.lineWidth = width * S + 5; x.stroke()
    x.strokeStyle = css(0xa8875a, 0.75); x.lineWidth = width * S; x.stroke()
    x.strokeStyle = css(PAL.path, 0.55); x.lineWidth = width * S * 0.62; x.stroke()
    if (width > 30) {
      x.setLineDash([6, 5])
      x.strokeStyle = css(0x7a5e3c, 0.35); x.lineWidth = 1.2
      x.save(); x.translate(-width * S * 0.18, 0); x.beginPath(); trace(x); x.stroke(); x.restore()
      x.save(); x.translate(width * S * 0.18, 0); x.beginPath(); trace(x); x.stroke(); x.restore()
    }
    x.restore()
  }
}

/** 4. The plaza: laid cobbles around the hall, feathering out at the edge. */
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

function tuft(x: Ctx, px: number, py: number, c: number, s = 1) {
  x.save()
  x.lineCap = 'round'
  x.strokeStyle = css(shade(c, -0.45), 0.7)
  x.lineWidth = 0.9
  x.beginPath()
  for (const [dx, h] of [[-2.2, 4], [0, 5.5], [2.2, 4.2], [-1, 4.8], [1.2, 5]]) {
    x.moveTo(px + dx * 0.4 * s, py)
    x.quadraticCurveTo(px + dx * 0.8 * s, py - h * 0.5 * s, px + dx * 1.3 * s, py - h * s)
  }
  x.stroke()
  x.strokeStyle = css(mix(c, 0xfff0c0, 0.3), 0.55)
  x.beginPath()
  x.moveTo(px - 0.4 * s, py); x.quadraticCurveTo(px - 0.6 * s, py - 2.4 * s, px - 1.4 * s, py - 4.2 * s)
  x.stroke()
  x.restore()
}

/** 5. Biome detail: the per-biome brushwork. */
function paintMarks(x: Ctx, b: Box, wx: number, wy: number, size: number) {
  const reach = MARK_REACH * S
  forCells(wx, wy, size, MARK_REACH, (cx, cy) => {
    for (let k = 0; k < MARKS; k++) {
      const r = strokeRng(cx, cy, k, 404)
      const wxm = (cx + r.next()) * CELL, wym = (cy + r.next()) * CELL
      const px = wxm * S, py = wym * S
      if (wxm >= WORLD.width || wym >= WORLD.height || !meets(b, px - reach, py - reach, px + reach, py + reach)) continue
      markAt(x, r, biomeAt(wxm, wym), wxm, wym, px, py)
    }
  })
}

function markAt(x: Ctx, r: Rng, b: Biome, wx: number, wy: number, px: number, py: number) {
  const cluster = fbm(wx * 0.01, wy * 0.01, 404, 2)
  const t = TONES[b]
  switch (b) {
    case 'hold':
    case 'wild': {
      if (cluster > 0.52) tuft(x, px, py, t.mid, r.range(0.8, 1.3))
      else if (r.next() < 0.08) fill(x, P.circle(px, py, r.range(0.7, 1.2)), r.pick([0xf1e4c3, 0xf2c24e, 0xe8a0b8, 0xc8d8f0]), 0.9)
      else if (r.next() < 0.03) {
        fill(x, P.ellipse(px, py, r.range(1.2, 2.4), r.range(0.8, 1.5)), 0x9a9480)
        line(x, P.ellipse(px, py, r.range(1.2, 2.4), r.range(0.8, 1.5)), 0.5, INK, 0.5)
      }
      break
    }
    case 'whisperwood': {
      if (cluster > 0.45) tuft(x, px, py, t.mid, r.range(1, 1.5))
      else if (r.next() < 0.3) {
        // fallen leaves and needles
        fill(x, P.ellipse(px, py, r.range(1, 2), r.range(0.5, 1), r.range(0, Math.PI)), r.pick([0x8a6a36, 0x6e5a36, 0x9a7a3a]), 0.7)
      } else if (r.next() < 0.05) {
        line(x, xx => { xx.moveTo(px - 4, py); xx.lineTo(px + 4, py - 1.5) }, 1, 0x4a3420, 0.7)
      }
      break
    }
    case 'greyfall': {
      if (r.next() < 0.06) {
        const s = r.range(3, 7)
        const pts: number[][] = []
        for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + r.range(-0.3, 0.3); pts.push([px + Math.cos(a) * s * r.range(0.7, 1.2), py + Math.sin(a) * s * 0.55 * r.range(0.7, 1.2)]) }
        form(x, P.blob(pts, 0.3), mix(t.hi, 0xffffff, r.range(0, 0.12)), { rim: 0.6, core: s * 0.4 })
        line(x, P.blob(pts, 0.3), 0.7, INK, 0.55)
      } else if (r.next() < 0.1) {
        line(x, xx => { xx.moveTo(px, py); xx.lineTo(px + r.range(-6, 6), py + r.range(-3, 3)); xx.lineTo(px + r.range(-10, 10), py + r.range(-4, 4)) }, 0.6, INK, 0.35)
      } else if (cluster > 0.64) tuft(x, px, py, 0x7f8a54, 0.9)
      break
    }
    case 'hollow': {
      if (r.next() < 0.035) {
        // broken flagstones from what was a village square
        const s = r.range(3, 6)
        const a = r.range(-0.4, 0.4)
        x.save(); x.translate(px, py); x.rotate(a)
        form(x, P.rect(-s, -s * 0.6, s * 2, s * 1.2), mix(0xa8a08a, 0x000000, r.range(0, 0.15)), { rim: 0.5, core: 1 })
        line(x, P.rect(-s, -s * 0.6, s * 2, s * 1.2), 0.6, INK, 0.5)
        x.restore()
      } else if (cluster > 0.55) tuft(x, px, py, t.mid, 1.1)
      else if (r.next() < 0.03) fill(x, P.circle(px, py, r.range(0.8, 1.6)), 0x6a6050, 0.8)
      break
    }
    case 'deepvein': {
      if (r.next() < 0.06) {
        line(x, xx => { xx.moveTo(px, py); xx.lineTo(px + r.range(-7, 7), py + r.range(-3, 3)); xx.lineTo(px + r.range(-12, 12), py + r.range(-5, 5)) }, 0.8, 0x2a1e16, 0.6)
      } else if (r.next() < 0.05) {
        fill(x, P.ellipse(px, py, r.range(2, 6), r.range(1, 2.5)), 0x8a4a2e, 0.35)
      } else if (r.next() < 0.02) {
        fill(x, P.circle(px, py, 0.9), 0xd8e0ea, 0.9)
      }
      break
    }
    case 'ashgate': {
      if (r.next() < 0.05) {
        // cracks that still glow
        const pts: number[][] = [[px, py]]
        for (let k = 0; k < 3; k++) pts.push([pts[k][0] + r.range(-6, 6), pts[k][1] + r.range(-3, 3)])
        x.save()
        x.globalCompositeOperation = 'lighter'
        line(x, xx => { xx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) xx.lineTo(p[0], p[1]) }, 2.4, 0xff5a1a, 0.18)
        x.restore()
        line(x, xx => { xx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) xx.lineTo(p[0], p[1]) }, 0.8, 0xff8a3a, 0.8)
      } else if (r.next() < 0.08) {
        fill(x, P.circle(px, py, r.range(0.6, 1.2)), 0xffa050, 0.7)
      } else if (r.next() < 0.1) {
        fill(x, P.ellipse(px, py, r.range(3, 8), r.range(1, 2.4)), 0x8a8078, 0.25)
      }
      break
    }
    case 'plaza': {
      if (r.next() < 0.12) fill(x, P.ellipse(px, py, r.range(1, 2.5), r.range(0.6, 1.4)), r.next() < 0.5 ? 0x8a6a48 : 0xc8ae84, 0.6)
      else if (r.next() < 0.03) tuft(x, px, py, 0x7f8c4c, 0.7)
      break
    }
  }
}

/** 6. Scorched earth around every warcamp. */
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

/** 7. The spawn gates: burned-out waymarks where the horde comes through. */
function paintSpawnGates(x: Ctx, b: Box) {
  for (const gate of SPAWN_GATES) {
    const gx = gate.x * S, gy = gate.y * S
    if (!meets(b, gx - 30, gy - 30, gx + 30, gy + 30)) continue
    glow(x, gx, gy, 30, 0x2a1810, 0.6)
    for (const s of [-1, 1]) {
      const post = P.poly([[gx + s * 12 - 2.5, gy + 4], [gx + s * 12 - 2, gy - 14], [gx + s * 12, gy - 18], [gx + s * 12 + 2, gy - 14], [gx + s * 12 + 2.5, gy + 4]])
      form(x, post, 0x3a2e28, { rim: 0.5, core: 1.4 })
      line(x, post, 0.8, INK, 0.8)
    }
  }
}

/**
 * Paint world rect [wx, wx+size) × [wy, wy+size). `x` arrives with a
 * transform from world px to canvas px (scaled by `scale`), usually clipped to
 * the part the caller keeps; strokes may land past the rect. The same world
 * pixel always comes out the same, whichever rect it was painted as part of.
 */
export function paintTerrainRect(x: Ctx, wx: number, wy: number, size: number, scale: number) {
  x.save()
  paintWash(x, wx, wy, size, scale)
  // the brushwork is drawn in texels at S, the resolution it was designed at
  x.scale(1 / S, 1 / S)
  const b: Box = { x0: wx * S, y0: wy * S, x1: (wx + size) * S, y1: (wy + size) * S }
  paintDabs(x, b, wx, wy, size)
  paintRoads(x, b)
  paintPlaza(x, b)
  paintMarks(x, b, wx, wy, size)
  paintCamps(x, b)
  paintSpawnGates(x, b)
  // 8. paper tooth over everything, pinned to the world's origin
  const W = WORLD.width * S, H = WORLD.height * S
  applyGrain(x, W, H, 0.07)
  // a whisper of warm vignette toward the world's edge, as if the page ends
  const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75)
  g.addColorStop(0, css(0x000000, 0)); g.addColorStop(1, css(0x3a2414, 0.35))
  x.fillStyle = g; x.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0)
  x.restore()
}

// ---- the unexplored: blank vellum with a cartographer's sketch -------------------------

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

  // the page
  const img = x.createImageData(W, H)
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const n = fbm(i * 0.02 * s, j * 0.02 * s, 900, 4)
      const m = fbm(i * 0.08 * s, j * 0.08 * s, 901, 2)
      const col = mix(mix(0xd8c49a, 0xefe0bc, n), 0xc8b088, Math.max(0, m - 0.6) * 1.2)
      const q = (j * W + i) * 4
      img.data[q] = (col >> 16) & 255
      img.data[q + 1] = (col >> 8) & 255
      img.data[q + 2] = col & 255
      img.data[q + 3] = 255
    }
  }
  x.putImageData(img, 0, 0)

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

  const zoneSym: Record<string, ((px: number, py: number) => void)[]> = {
    whisperwood: [sym.tree, sym.pine, sym.pine],
    greyfall: [sym.peak, sym.peak, sym.grass],
    hollow: [sym.ruin, sym.tree, sym.grass],
    deepvein: [sym.pick, sym.peak, sym.grass],
    ashgate: [sym.flame, sym.flame, sym.ruin],
  }
  for (const z of ZONES) {
    const list = zoneSym[z.id]
    if (!list) continue
    const n = Math.round((z.w * z.h) / 26000 * sparse)
    for (let i = 0; i < n; i++) {
      const px = (z.x + r.range(0.05, 0.95) * z.w) * k
      const py = (z.y + r.range(0.05, 0.95) * z.h) * k
      r.pick(list)(px, py)
    }
    // the surveyor's name for it, in a small italic hand
    x.save()
    x.font = `italic 600 ${Math.max(10, Math.round(48 * k))}px "Alegreya Sans", Georgia, serif`
    x.fillStyle = css(sepia, 0.55)
    x.textAlign = 'center'
    x.fillText(z.name, (z.x + z.w / 2) * k, (z.y + z.h / 2) * k)
    x.restore()
  }
  // loose grass marks across the unclaimed wild
  for (let i = 0; i < Math.round(700 * sparse); i++) {
    const wx = r.range(0, WORLD.width), wy = r.range(0, WORLD.height)
    if (ZONES.some(z => z.id !== 'hold' && wx > z.x && wx < z.x + z.w && wy > z.y && wy < z.y + z.h)) continue
    sym.grass(wx * k, wy * k)
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
