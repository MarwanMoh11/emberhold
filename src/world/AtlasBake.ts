import type Phaser from 'phaser'
import { WORLD } from '../config/world'
import { PAL } from '../config/palette'
import { css } from '../art/ink'
import { ATLAS_STEP, paintAtlasRect } from './Terrain'

/** World px per atlas texel: the world bakes to 640 × 576. */
export const ATLAS_SCALE = ATLAS_STEP
export const ATLAS_W = Math.ceil(WORLD.width / ATLAS_SCALE)
export const ATLAS_H = Math.ceil(WORLD.height / ATLAS_SCALE)
export const ATLAS_KEY = 'atlas_bake'
/** World px per bake block: a chunk's size, so a claim re-bakes what the chunks do. */
export const ATLAS_BLOCK = 1024

export interface AtlasRect { x: number; y: number; width: number; height: number }

/** Blocks (top-left world px) that touch `rect`, row by row; every block when `rect` is absent. */
export function atlasBlocks(rect?: AtlasRect, world: { width: number; height: number } = WORLD): [number, number][] {
  const out: [number, number][] = []
  for (let y = 0; y < world.height; y += ATLAS_BLOCK) {
    for (let x = 0; x < world.width; x += ATLAS_BLOCK) {
      if (rect && (x >= rect.x + rect.width || x + ATLAS_BLOCK <= rect.x || y >= rect.y + rect.height || y + ATLAS_BLOCK <= rect.y)) continue
      out.push([x, y])
    }
  }
  return out
}

export interface AtlasBakeStats {
  /** the first full bake has finished */
  done: boolean
  /** blocks still to paint */
  queued: number
  /** ms spent painting the first full bake, summed over its slices */
  bakeMs: number
  /** ms of wall clock from the first slice to the last of the first bake */
  wallMs: number
  /** the most one frame's slice took */
  worstFrameMs: number
}

/**
 * The atlas's base (S12): the whole world painted once at 1/16 scale into the
 * canvas texture `atlas_bake`, through the painter's low-detail pass. It waits
 * for the chunk streamer to finish what is on screen, then paints a block or
 * more a frame within `budgetMs`. A claim re-queues the blocks under the
 * region's box so the tint follows. The minimap crops the same texture.
 */
export class AtlasBake {
  private tex: Phaser.Textures.CanvasTexture
  private queue: [number, number][] = []
  private queued = new Set<string>()
  private started = false
  private wait = 0
  private sinceRefresh = 0
  private firstDone = false
  private t0 = 0
  private s: AtlasBakeStats = { done: false, queued: 0, bakeMs: 0, wallMs: 0, worstFrameMs: 0 }
  /** bumps whenever the texture is re-uploaded */
  version = 0

  constructor(private scene: Phaser.Scene & { terrain?: { stats(): { queued: number } } }, private budgetMs = 2.5) {
    const tm = scene.textures
    const old = tm.exists(ATLAS_KEY) ? tm.get(ATLAS_KEY) as Phaser.Textures.CanvasTexture : null
    this.tex = old ?? tm.createCanvas(ATLAS_KEY, ATLAS_W, ATLAS_H)!
    if (!old) {
      const x = this.tex.getContext()
      x.fillStyle = css(PAL.vellum, 1)
      x.fillRect(0, 0, ATLAS_W, ATLAS_H)
      this.tex.refresh()
    }
    this.tex.setFilter(0) // linear: the minimap and the zoomed-out atlas both scale it down
    this.invalidate()
  }

  /** Re-paint the blocks under `rect` (all of them when absent). */
  invalidate(rect?: AtlasRect) {
    for (const b of atlasBlocks(rect)) {
      const k = `${b[0]},${b[1]}`
      if (this.queued.has(k)) continue
      this.queued.add(k)
      this.queue.push(b)
    }
  }

  /** Paint within the frame's budget; one block always runs once started. */
  update(dt = 1 / 60) {
    if (!this.queue.length) return
    if (!this.started) {
      // after the visible chunks: the first frames belong to what is on screen
      this.wait += dt
      if ((this.scene.terrain?.stats().queued ?? 0) > 0 && this.wait < 3) return
      this.started = true
      this.t0 = performance.now()
    }
    const x = this.tex.getContext()
    const t0 = performance.now()
    do {
      const [bx, by] = this.queue.shift()!
      this.queued.delete(`${bx},${by}`)
      x.save()
      x.setTransform(1 / ATLAS_SCALE, 0, 0, 1 / ATLAS_SCALE, 0, 0)
      x.beginPath()
      x.rect(bx, by, ATLAS_BLOCK, ATLAS_BLOCK)
      x.clip()
      paintAtlasRect(x, bx, by, ATLAS_BLOCK)
      x.restore()
      this.sinceRefresh++
    } while (this.queue.length && performance.now() - t0 < this.budgetMs)
    const ms = performance.now() - t0
    this.s.worstFrameMs = Math.max(this.s.worstFrameMs, ms)
    if (!this.firstDone) this.s.bakeMs += ms
    if (!this.queue.length || this.sinceRefresh >= 12) {
      this.tex.refresh()
      this.sinceRefresh = 0
      this.version++
    }
    if (!this.queue.length && !this.firstDone) {
      this.firstDone = true
      this.s.done = true
      this.s.wallMs = performance.now() - this.t0
    }
  }

  /** Finish every queued block now (harness and tests). */
  flush() {
    this.started = true
    while (this.queue.length) this.update()
  }

  get done() { return this.firstDone }

  stats(): AtlasBakeStats {
    return { ...this.s, queued: this.queue.length, bakeMs: Math.round(this.s.bakeMs * 10) / 10, wallMs: Math.round(this.s.wallMs), worstFrameMs: Math.round(this.s.worstFrameMs * 10) / 10 }
  }
}
