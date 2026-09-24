import type Phaser from 'phaser'
import { PAL } from '../config/palette'
import type { PoiBP, PoiKind } from '../config/world/blueprint'
import { mix } from '../art/ink'
import type { GameScene } from '../scenes/GameScene'
import type { ChartMemory } from './chart'

/** The charts' inks: a surveyor's map on the same paper as the world's fog. */
export const CHART = {
  wild: mix(PAL.grassA, PAL.parchment, 0.5),
  held: mix(PAL.grassB, PAL.parchment, 0.38),
  uncharted: PAL.vellum,
  ink: 0x3a2616,
  wax: PAL.wax,
  lapis: 0x24508f,
  gilt: 0x94580e,
  moss: 0x3d6a24,
  enemy: 0xc0301c,
}

type G = Phaser.GameObjects.Graphics

/** A camp: a wax diamond, or an inked cross once burned. `s` is the half-size in screen px. */
export function drawCamp(g: G, x: number, y: number, s: number, burned: boolean, stronghold = false) {
  if (burned) {
    g.lineStyle(Math.max(1.2, s * 0.3), CHART.ink, 0.75)
    g.lineBetween(x - s, y - s, x + s, y + s)
    g.lineBetween(x - s, y + s, x + s, y - s)
    return
  }
  g.fillStyle(CHART.ink, 0.9)
  g.fillPoints([{ x, y: y - s - 1 }, { x: x + s + 1, y }, { x, y: y + s + 1 }, { x: x - s - 1, y }], true)
  g.fillStyle(stronghold ? PAL.ember : CHART.wax, 1)
  g.fillPoints([{ x, y: y - s }, { x: x + s, y }, { x, y: y + s }, { x: x - s, y }], true)
}

/** A waystone: an upright slab, lapis when lit, ink when dark; ringed when it is the stone the hero stands on. */
export function drawStone(g: G, x: number, y: number, s: number, lit: boolean, here = false, focus = false) {
  if (focus || here) {
    g.lineStyle(2, focus ? PAL.gold : CHART.gilt, 1)
    g.strokeCircle(x, y, s * 2.1)
  }
  g.fillStyle(CHART.ink, 0.95)
  g.fillRect(x - s * 0.62 - 1, y - s - 1, s * 1.24 + 2, s * 2 + 2)
  g.fillStyle(lit ? PAL.heroTrim : 0x8a8272, 1)
  g.fillRect(x - s * 0.62, y - s, s * 1.24, s * 2)
}

/** An outpost: a small ink blockhouse with a lantern. */
export function drawOutpost(g: G, x: number, y: number, s: number) {
  g.fillStyle(CHART.ink, 0.95)
  g.fillRect(x - s - 1, y - s * 0.6 - 1, s * 2 + 2, s * 1.4 + 2)
  g.fillStyle(CHART.moss, 1)
  g.fillRect(x - s, y - s * 0.6, s * 2, s * 1.4)
  g.fillStyle(PAL.gold, 1)
  g.fillRect(x - 1.2, y - s * 0.6 - 3, 2.4, 2.4)
}

/**
 * POI markers by kind. **S14 hook:** replace an entry to give a kind its own
 * icon; until then every kind is a generic ring in its own ink, and a done POI
 * is drawn dimmed. `s` is the half-size in screen px.
 */
export const POI_GLYPH: Record<PoiKind, (g: G, x: number, y: number, s: number) => void> = {
  waystone: (g, x, y, s) => drawStone(g, x, y, s * 0.8, false),
  shrine: ring(PAL.heroTrim),
  cache: ring(PAL.gold),
  lore: ring(CHART.lapis),
  barrow: ring(0x6a5a7a),
  survivors: ring(CHART.moss),
  landmark: ring(CHART.gilt),
  relic: ring(PAL.ember),
}

function ring(colour: number) {
  return (g: G, x: number, y: number, s: number) => {
    g.fillStyle(CHART.ink, 0.9)
    g.fillCircle(x, y, s + 1.2)
    g.fillStyle(colour, 1)
    g.fillCircle(x, y, s)
    g.fillStyle(CHART.ink, 0.9)
    g.fillCircle(x, y, s * 0.35)
  }
}

export type PoiChartState = 'unseen' | 'seen' | 'done'

/**
 * What the charts know of a POI. **S14 hook:** once `PoiManager` lands, answer
 * with `gs.pois.state(poi.id)`; until then a POI is seen once its ground is.
 */
export function poiState(gs: GameScene, memory: ChartMemory, poi: PoiBP): PoiChartState {
  const pois = (gs as unknown as { pois?: { state(id: string): PoiChartState } }).pois
  if (pois) return pois.state(poi.id)
  return memory.seenAt(poi.x, poi.y) ? 'seen' : 'unseen'
}
