import { REGIONS, REGION_BY_ID, WORLD } from '../config/world'
import type { Rect } from './TerrainFeatures'

/**
 * Claimed ground looks claimed (S08). The painter drains a little colour and
 * light out of every region the hold has not claimed, and inks the borders of
 * that ground as a dotted surveyor's line. Claimed ground is left as painted.
 *
 * The state lives here, not on the scene, because the painter is a plain
 * function of world position: RegionManager pushes the flags with `setClaimed`
 * and invalidates the chunks it changed, and the next bake reads them.
 */

/** How much colour unclaimed ground loses, and how much darker it is. */
export const CLAIM_DESAT = 0.35
export const CLAIM_DARK = 0.15
/** The border's dots: diameter and spacing in world px. */
const DOT = 4.5
const DOT_GAP = 13
const BORDER_A = 0.55
/** How far past a region's polygon a claim can change pixels (the dots straddle the line). */
export const CLAIM_BLEED = 8

type Ctx = CanvasRenderingContext2D
interface Box { x0: number; y0: number; x1: number; y1: number }

const boxes: Box[] = REGIONS.map(r => {
  const xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
})

const claimed = new Uint8Array(REGIONS.length)
const HOLD = REGION_BY_ID.get('hold')?.index ?? 0
claimed[HOLD] = 1

let shade: Path2D | null = null
let border: Path2D | null = null
let open: number[] = []

/** The painter's copy of the claim flags, by `REGIONS` index. Chunks painted after this read the new state. */
export function setClaimed(flags: ArrayLike<number>) {
  for (let k = 0; k < claimed.length; k++) claimed[k] = flags[k] ? 1 : 0
  shade = border = null
}

/** The world rect a claim of region `k` can repaint, for `TerrainChunks.invalidate`. */
export function claimRect(k: number) {
  const b = boxes[k]
  return { x: b.x0 - CLAIM_BLEED, y: b.y0 - CLAIM_BLEED, width: b.x1 - b.x0 + CLAIM_BLEED * 2, height: b.y1 - b.y0 + CLAIM_BLEED * 2 }
}

const onWorldEdge = (a: readonly number[], b: readonly number[]) =>
  (a[0] <= 0 && b[0] <= 0) || (a[1] <= 0 && b[1] <= 0)
  || (a[0] >= WORLD.width && b[0] >= WORLD.width) || (a[1] >= WORLD.height && b[1] >= WORLD.height)

/** One path for all unclaimed ground (one fill, so shared edges leave no seam) and one for its borders, each edge once. */
function build() {
  shade = new Path2D()
  border = new Path2D()
  open = []
  const seen = new Set<string>()
  REGIONS.forEach((r, k) => {
    if (claimed[k]) return
    open.push(k)
    const poly = r.poly
    shade!.moveTo(poly[0][0], poly[0][1])
    for (let i = 1; i < poly.length; i++) shade!.lineTo(poly[i][0], poly[i][1])
    shade!.closePath()
    for (let i = 0; i < poly.length; i++) {
      let a = poly[i], b = poly[(i + 1) % poly.length]
      if (onWorldEdge(a, b)) continue
      // walk every edge the same way round, so a shared edge dots in phase and is drawn once
      if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) [a, b] = [b, a]
      const key = `${Math.round(a[0])},${Math.round(a[1])},${Math.round(b[0])},${Math.round(b[1])}`
      if (seen.has(key)) continue
      seen.add(key)
      border!.moveTo(a[0], a[1])
      border!.lineTo(b[0], b[1])
    }
  })
}

/** Tint the unclaimed ground in `rect` and ink its borders. Runs after the crossings, before the set pieces. */
export function paintClaimTint(x: Ctx, rect: Rect) {
  if (!shade) build()
  const meets = open.some(k => {
    const b = boxes[k]
    return b.x0 - CLAIM_BLEED < rect.x1 && b.x1 + CLAIM_BLEED > rect.x0 && b.y0 - CLAIM_BLEED < rect.y1 && b.y1 + CLAIM_BLEED > rect.y0
  })
  if (!meets) return
  x.save()
  // a grey laid on with the saturation blend keeps hue and lightness and takes that share of the colour
  x.globalCompositeOperation = 'saturation'
  x.fillStyle = `rgba(128,128,128,${CLAIM_DESAT})`
  x.fill(shade!)
  x.globalCompositeOperation = 'source-over'
  x.fillStyle = `rgba(0,0,0,${CLAIM_DARK})`
  x.fill(shade!)
  x.strokeStyle = `rgba(34,22,14,${BORDER_A})`
  x.lineWidth = DOT
  x.lineCap = 'round'
  x.setLineDash([0, DOT_GAP])
  x.stroke(border!)
  x.restore()
}
