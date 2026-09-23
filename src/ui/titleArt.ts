import type Phaser from 'phaser'
import { DPR } from '../core/device'
import { applyGrain, css, glow, makeCanvas, mix, register, Rng, shade, type Ctx } from '../art/ink'

/**
 * The title's backdrop: the frontier at dusk, painted once at the size of the
 * window.
 *
 * The same gouache as the world — flat washes, an inked top edge on every
 * ridge, paper tooth over all of it — so the first screen promises the game's
 * look instead of a navy rectangle with a tinted sprite in it. The sky runs
 * from night overhead to an ember horizon, and the ground falls away in three
 * ridges, each hazier and warmer than the one in front.
 */

export const TITLE_BACKDROP = 'title_backdrop'

/** Colours of the scene, shared with the title's live pieces. */
export const DUSK = {
  zenith: 0x0d1222,
  high: 0x1f1d38,
  mid: 0x4a2a3c,
  low: 0x9a4630,
  horizon: 0xe08a44,
  far: 0x5b3440,
  mid2: 0x33212c,
  near: 0x17100f,
  ink: 0x0a0605,
}

function ridge(x: Ctx, w: number, base: number, amp: number, seed: number, colour: number, trees: number, r: Rng) {
  const pts: [number, number][] = []
  const step = 6
  for (let px = -step; px <= w + step; px += step) {
    const t = px / w
    const y = base
      - Math.sin(t * 5.1 + seed) * amp * 0.5
      - Math.sin(t * 11.7 + seed * 2.3) * amp * 0.22
      - Math.sin(t * 23.9 + seed * 0.7) * amp * 0.08
    pts.push([px, y])
  }
  const path = (xx: Ctx) => {
    xx.moveTo(-10, x.canvas.height + 10)
    for (const [px, py] of pts) xx.lineTo(px, py)
    xx.lineTo(w + 10, x.canvas.height + 10)
    xx.closePath()
  }
  x.beginPath(); path(x)
  x.fillStyle = css(colour)
  x.fill()
  // pines along the crest, each an inked spike
  if (trees > 0) {
    x.fillStyle = css(colour)
    for (let i = 0; i < trees; i++) {
      const k = Math.floor(r.range(0, pts.length))
      const [px, py] = pts[k]
      const th = r.range(amp * 0.25, amp * 0.6)
      const tw = th * r.range(0.28, 0.4)
      x.beginPath()
      x.moveTo(px - tw, py + 2); x.lineTo(px, py - th); x.lineTo(px + tw, py + 2); x.closePath()
      x.fill()
    }
  }
  // the ink line along the crest
  x.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = pts[i]
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py)
  }
  x.strokeStyle = css(DUSK.ink, 0.55)
  x.lineWidth = 1.6
  x.stroke()
}

/** Paint the dusk and register it as a texture the size of the window. */
export function paintTitleBackdrop(scene: Phaser.Scene, W: number, H: number) {
  // Painted at the device's resolution, but capped: a 4K window would cost
  // 30MB for a painting that is mostly soft gradients. Past the cap the image
  // is scaled up to fill instead.
  const k = Math.min(DPR, 2400 / Math.max(W, H))
  const w = Math.max(64, Math.round(W * k))
  const h = Math.max(64, Math.round(H * k))
  const [c, x] = makeCanvas(w, h)
  const r = new Rng(4242)

  // ---- sky ------------------------------------------------------------------
  const sky = x.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, css(DUSK.zenith))
  sky.addColorStop(0.38, css(DUSK.high))
  sky.addColorStop(0.6, css(DUSK.mid))
  sky.addColorStop(0.74, css(DUSK.low))
  sky.addColorStop(0.82, css(DUSK.horizon))
  sky.addColorStop(1, css(DUSK.horizon))
  x.fillStyle = sky
  x.fillRect(0, 0, w, h)

  // stars, only where the sky is dark enough to hold them
  for (let i = 0; i < (w * h) / 2600; i++) {
    const sx = r.range(0, w), sy = r.range(0, h * 0.5)
    const fade = 1 - sy / (h * 0.5)
    const a = r.range(0.25, 0.9) * fade
    const s = r.next() < 0.08 ? 1.8 : r.range(0.6, 1.3)
    x.fillStyle = css(0xfff4dc, a)
    x.fillRect(sx, sy, s, s)
    if (s > 1.5) glow(x, sx + 0.9, sy + 0.9, 6, 0xfff4dc, a * 0.35)
  }

  // a low moon, veiled
  const mx = w * 0.87, my = h * 0.11, mr = Math.min(w, h) * 0.035
  glow(x, mx, my, mr * 5, 0xbfc8e8, 0.12)
  x.beginPath(); x.arc(mx, my, mr, 0, Math.PI * 2)
  x.fillStyle = css(0xe6e2d0, 0.85); x.fill()
  x.beginPath(); x.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.92, 0, Math.PI * 2)
  x.fillStyle = css(mix(DUSK.high, DUSK.zenith, 0.4)); x.fill()

  // long cloud streaks lit from below by the last of the sun
  for (let i = 0; i < 5; i++) {
    const cy = h * r.range(0.46, 0.66)
    const cw = w * r.range(0.3, 0.6)
    const cx0 = r.range(-cw * 0.3, w - cw * 0.7)
    const g = x.createLinearGradient(0, cy - 14, 0, cy + 14)
    const lit = mix(DUSK.low, DUSK.horizon, r.range(0.2, 0.7))
    g.addColorStop(0, css(shade(DUSK.mid, -0.2), 0))
    g.addColorStop(0.55, css(shade(DUSK.mid, -0.15), 0.35))
    g.addColorStop(1, css(lit, 0.3))
    x.fillStyle = g
    x.beginPath()
    x.ellipse(cx0 + cw / 2, cy, cw / 2, r.range(7, 16), 0, 0, Math.PI * 2)
    x.fill()
  }

  // the glow of the hold on the horizon
  glow(x, w * 0.5, h * 0.8, Math.max(w, h) * 0.42, DUSK.horizon, 0.35)

  // ---- ground ---------------------------------------------------------------
  ridge(x, w, h * 0.74, h * 0.07, 1.3, DUSK.far, Math.round(w / 30), r)
  // haze between the ridges
  const haze = x.createLinearGradient(0, h * 0.7, 0, h * 0.84)
  haze.addColorStop(0, css(DUSK.horizon, 0))
  haze.addColorStop(1, css(DUSK.low, 0.35))
  x.fillStyle = haze
  x.fillRect(0, h * 0.7, w, h * 0.14)
  ridge(x, w, h * 0.81, h * 0.06, 4.2, DUSK.mid2, Math.round(w / 18), r)

  // the near ground rises into a mound for the hold to stand on
  x.beginPath()
  x.moveTo(-10, h + 10)
  x.lineTo(-10, h * 0.9)
  x.bezierCurveTo(w * 0.22, h * 0.9, w * 0.3, h * 0.845, w * 0.5, h * 0.845)
  x.bezierCurveTo(w * 0.7, h * 0.845, w * 0.78, h * 0.9, w + 10, h * 0.9)
  x.lineTo(w + 10, h + 10)
  x.closePath()
  x.fillStyle = css(DUSK.near)
  x.fill()
  x.strokeStyle = css(DUSK.ink, 0.8); x.lineWidth = 2; x.stroke()
  // firelight catching the crest of the mound
  const crest = x.createRadialGradient(w * 0.5, h * 0.85, 0, w * 0.5, h * 0.85, w * 0.3)
  crest.addColorStop(0, css(DUSK.horizon, 0.28))
  crest.addColorStop(1, css(DUSK.horizon, 0))
  x.save()
  x.beginPath()
  x.moveTo(-10, h * 0.9)
  x.bezierCurveTo(w * 0.22, h * 0.9, w * 0.3, h * 0.845, w * 0.5, h * 0.845)
  x.bezierCurveTo(w * 0.7, h * 0.845, w * 0.78, h * 0.9, w + 10, h * 0.9)
  x.lineTo(w + 10, h + 10); x.lineTo(-10, h + 10); x.closePath()
  x.clip()
  x.fillStyle = crest
  x.fillRect(0, h * 0.8, w, h * 0.2)
  x.restore()

  applyGrain(x, w, h, 0.07)

  // ---- vignette ---------------------------------------------------------------
  const v = x.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.75)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(4,2,1,0.6)')
  x.fillStyle = v
  x.fillRect(0, 0, w, h)

  if (scene.textures.exists(TITLE_BACKDROP)) scene.textures.remove(TITLE_BACKDROP)
  register(scene, TITLE_BACKDROP, c)
  return { key: TITLE_BACKDROP, scale: 1 / k }
}
