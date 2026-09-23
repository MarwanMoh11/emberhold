import type Phaser from 'phaser'
import { WORLD, HALL, REGIONS, PADS, FUTURE_PADS, CAMPS, NODE_CLUSTERS, POIS, MAWS, THRONE, CROSSINGS, raster, type Biome } from '../config/world'
import { T, blockedWithin, segProj } from './raster'
import { hash32, Mulberry } from './noise'
import type { Culler } from '../systems/Culler'

/**
 * Scatter props (S07): pines on the highland, reeds in the marsh, dead trees
 * on the moor, bones and standards in the ash, fence lines in the farmland,
 * and a little something for every other biome. Static sprites, not nodes.
 *
 * Dealt per 1024 px chunk from a seed of the chunk alone, so the layout never
 * changes; kept clear of pads, node fields, roads, crossings, camps, points
 * of interest and claim stones; at most PROP_BUDGET world-wide. Pure apart
 * from `addScatter`, so node tests read the layout.
 */

export interface PropSpot { key: string; x: number; y: number; flip: boolean; scale: number }

export const PROP_BUDGET = 1500
/** How far (px) a prop keeps from each kind of thing. */
export const PROP_CLEAR = { pad: 100, node: 60, camp: 240, poi: 90, claim: 90, road: 40, crossing: 96, blocked: 40, hall: 480, throne: 520, spacing: 44 }

const CHUNK = 1024
const TRIES = 80

/** Per biome: props per chunk of that ground, and which. 'fence' lays a run of fence segments. */
const SCATTER: Record<Biome, { n: number; props: [string, number][] }> = {
  // snow-dusted, so they never pass for the choppable pines of Frostmere's fields
  highland:  { n: 44, props: [['sc_pineSnow', 5], ['sc_scree', 1]] },
  marsh:     { n: 44, props: [['sc_reeds', 1]] },
  moor:      { n: 28, props: [['sc_deadTree', 3], ['sc_heath', 4]] },
  ash:       { n: 26, props: [['sc_bones', 4], ['sc_standard', 2], ['sc_charred', 1]] },
  farmland:  { n: 9, props: [['fence', 4], ['sc_hay', 1]] },
  meadow:    { n: 12, props: [['sc_bush', 3], ['sc_bushFlower', 2]] },
  rise:      { n: 4, props: [['sc_bush', 1]] },
  forest:    { n: 17, props: [['sc_fern', 3], ['sc_bush', 2]] },
  oldgrowth: { n: 24, props: [['sc_fern', 3], ['sc_mushroom', 2]] },
  village:   { n: 8, props: [['fence', 2], ['sc_bush', 1]] },
  scarp:     { n: 14, props: [['sc_scree', 1]] },
  rust:      { n: 18, props: [['sc_rustRock', 3], ['sc_deadTree', 1]] },
  sulphur:   { n: 20, props: [['sc_vent', 3], ['sc_scree', 1]] },
  badlands:  { n: 18, props: [['sc_shrub', 3], ['sc_bones', 1]] },
  deeprock:  { n: 17, props: [['sc_stalagmite', 1]] },
  obsidian:  { n: 17, props: [['sc_shard', 1]] },
  slag:      { n: 20, props: [['sc_slagHeap', 1]] },
}

const FENCE_STEP = 58

let memo: PropSpot[] | null = null

export function scatterProps(): PropSpot[] {
  if (memo) return memo
  const r = raster()
  const C = PROP_CLEAR
  const pads = [...PADS, ...FUTURE_PADS]
  const points: [number, number, number][] = [
    ...pads.map(p => [p.x, p.y, C.pad] as [number, number, number]),
    ...NODE_CLUSTERS.map(n => [n.x, n.y, n.radius + C.node] as [number, number, number]),
    ...CAMPS.map(c => [c.x, c.y, C.camp] as [number, number, number]),
    ...POIS.map(p => [p.x, p.y, C.poi] as [number, number, number]),
    ...MAWS.map(m => [m.x, m.y, C.poi] as [number, number, number]),
    ...REGIONS.map(g => [g.claim.x, g.claim.y, C.claim] as [number, number, number]),
    [THRONE.x, THRONE.y, C.throne], [HALL.x, HALL.y, C.hall],
  ]
  const taken = new Map<number, [number, number][]>()
  const gk = (gx: number, gy: number) => gy * 4096 + gx
  const crowded = (x: number, y: number) => {
    const gx = Math.floor(x / C.spacing), gy = Math.floor(y / C.spacing)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const [px, py] of taken.get(gk(gx + dx, gy + dy)) ?? []) if (Math.hypot(px - x, py - y) < C.spacing) return true
    }
    return false
  }
  const clear = (x: number, y: number) => {
    if (x < 40 || y < 40 || x > WORLD.width - 40 || y > WORLD.height - 40) return false
    const i = r.cell(x, y)
    if (i < 0 || r.terrain[i] !== T.LAND || r.crossing[i] >= 0) return false
    if (blockedWithin(r, x, y, C.blocked) < C.blocked) return false
    const k = Math.ceil(C.road / r.C) + 1
    for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
      const j = r.cell(x + dx * r.C, y + dy * r.C)
      if (j >= 0 && r.road[j]) {
        const [cx, cy] = r.xy(j)
        if (Math.hypot(cx - x, cy - y) < C.road + r.C / 2) return false
      }
    }
    for (const c of CROSSINGS) {
      const p = segProj(x, y, c.a[0], c.a[1], c.b[0], c.b[1])
      if (p.d < c.width / 2 + C.crossing) return false
    }
    for (const [px, py, d] of points) if (Math.abs(px - x) < d && Math.abs(py - y) < d && Math.hypot(px - x, py - y) < d) return false
    return !crowded(x, y)
  }
  const out: PropSpot[] = []
  const put = (key: string, x: number, y: number, flip: boolean, scale: number) => {
    out.push({ key, x: Math.round(x), y: Math.round(y), flip, scale })
    const g = gk(Math.floor(x / C.spacing), Math.floor(y / C.spacing))
    const list = taken.get(g); if (list) list.push([x, y]); else taken.set(g, [[x, y]])
  }
  const cols = Math.ceil(WORLD.width / CHUNK), rows = Math.ceil(WORLD.height / CHUNK)
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const rng = new Mulberry(hash32(cx, cy, 1777))
    for (let t = 0; t < TRIES; t++) {
      const x = (cx + rng.next()) * CHUNK, y = (cy + rng.next()) * CHUNK
      const roll = rng.next(), pick = rng.next(), flip = rng.next() < 0.5, scale = rng.range(0.85, 1.12), run = rng.next()
      if (x >= WORLD.width || y >= WORLD.height) continue
      const reg = r.region[r.cell(x, y)]
      if (reg < 0) continue
      const rec = SCATTER[REGIONS[reg].biome]
      if (roll * TRIES >= rec.n) continue
      let p = pick * rec.props.reduce((s, q) => s + q[1], 0)
      let key = rec.props[0][0]
      for (const [k, w] of rec.props) { if ((p -= w) < 0) { key = k; break } }
      if (key === 'fence') {
        // a run of 3–5 segments along a row; posts where the ground allows
        const n = 3 + Math.floor(run * 3)
        const ok: number[] = []
        for (let s = 0; s < n; s++) if (clear(x + s * FENCE_STEP, y)) ok.push(s)
        if (ok.length >= 2) for (const s of ok) put('sc_fence', x + s * FENCE_STEP, y, false, 1)
      } else if (clear(x, y)) put(key, x, y, flip, scale)
    }
  }
  if (out.length > PROP_BUDGET) {
    // drop the excess by hash, not by position, so no corner of the map goes bare
    const order = out.map((s, i) => [hash32(s.x, s.y, 99), i]).sort((a, b) => a[0] - b[0]).slice(PROP_BUDGET).map(a => a[1])
    const drop = new Set(order)
    return (memo = out.filter((_, i) => !drop.has(i)))
  }
  return (memo = out)
}

/** Stand every prop in the scene: depth by its feet, registered with the culler. */
export function addScatter(scene: Phaser.Scene & { culler: Culler }) {
  for (const s of scatterProps()) {
    const img = scene.add.image(s.x, s.y, s.key)
    img.setOrigin(0.5, 1 - 8 / img.height).setDepth(s.y).setScale(s.scale).setFlipX(s.flip)
    scene.culler.add(img, s.x, s.y - (img.height * s.scale) / 2, Math.max(img.width, img.height) * s.scale)
  }
}
