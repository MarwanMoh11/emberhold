import type Phaser from 'phaser'
import { PAL, CSS } from '../config/palette'
import { DPR } from '../core/device'

/**
 * Typography and text styling, in one place.
 *
 * Three voices. The display face is a hybrid blackletter — the chronicle's
 * hand — and is only ever set in mixed case, where it stays legible. Everything
 * the player has to read quickly is a humanist sans with calligraphic roots,
 * and the small-caps cut of it does the labelling that used to be shouted in
 * all caps.
 */
export const FONT = {
  display: '"Grenze Gotisch", "Palatino Linotype", Palatino, Georgia, serif',
  ui: '"Alegreya Sans", "Gill Sans", "Trebuchet MS", sans-serif',
  caps: '"Alegreya Sans SC", "Alegreya Sans", "Gill Sans", sans-serif',
}

/** Every face and weight the game draws with, for the preload at boot. */
export const FONT_FACES = [
  '600 32px "Grenze Gotisch"',
  '800 32px "Grenze Gotisch"',
  '500 16px "Alegreya Sans"',
  'italic 500 16px "Alegreya Sans"',
  '700 16px "Alegreya Sans"',
  '800 16px "Alegreya Sans"',
  '700 16px "Alegreya Sans SC"',
  '800 16px "Alegreya Sans SC"',
]

/** Ink used to stroke text that sits straight on the world. */
export const TEXT_INK = '#1a100a'

export type Voice = 'display' | 'ui' | 'caps'

export interface TextOpts {
  voice?: Voice
  size: number
  colour?: number
  /** '500' | '700' | '800' | 'italic 500' … */
  weight?: string
  stroke?: number
  align?: 'left' | 'center' | 'right'
  wrap?: number
  shadow?: boolean
}

export function textStyle(o: TextOpts): Phaser.Types.GameObjects.Text.TextStyle {
  const voice = o.voice ?? 'ui'
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: FONT[voice],
    fontSize: `${o.size}px`,
    color: CSS(o.colour ?? PAL.uiText),
    fontStyle: o.weight ?? (voice === 'display' ? '800' : '700'),
    align: o.align ?? 'left',
    // rasterised at the device's resolution, or the letters are the one soft
    // thing left on a sharp screen
    resolution: DPR,
  }
  if (o.stroke) {
    style.stroke = TEXT_INK
    style.strokeThickness = o.stroke
  }
  if (o.wrap) style.wordWrap = { width: o.wrap, useAdvancedWrap: true }
  if (o.shadow) {
    style.shadow = { offsetX: 0, offsetY: 2, color: 'rgba(10,6,3,0.75)', blur: 3, fill: true, stroke: true }
  }
  return style
}

/**
 * The display face is set in title case. Callers pass whatever the old
 * all-caps copy was; this keeps short connecting words lower.
 */
export function titleCase(s: string) {
  const small = new Set(['of', 'the', 'a', 'an', 'to', 'in', 'on', 'and', 'or', 'at', 'for', 'by'])
  return s.split(' ').map((raw, i) => {
    // numbers, levels and multipliers keep their own shape: x25, LV.3, 4/21
    if (/\d/.test(raw)) return raw
    const w = raw.toLowerCase()
    return i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
  }).join(' ')
}

/**
 * Recolour a text only when the colour actually changes. Phaser re-renders a
 * Text's whole canvas on every `setColor`, even to the colour it already has,
 * and the HUD sets colours every frame.
 */
export function setColour(t: Phaser.GameObjects.Text, c: number) {
  const s = CSS(c)
  if (t.style.color !== s) t.setColor(s)
  return t
}

const fitted = new WeakMap<Phaser.GameObjects.Text, string>()

/**
 * Shrink a line until it fits `maxW`, starting from `size`. Remembered per
 * text, so calling it every frame costs nothing until the words change —
 * every step of the shrink is a full measure and re-render in Phaser.
 */
export function fitWidth(t: Phaser.GameObjects.Text, size: number, maxW: number, min = 9) {
  const sig = `${t.text}|${size}|${Math.round(maxW)}`
  if (fitted.get(t) === sig) return t
  fitted.set(t, sig)
  t.setFontSize(size)
  while (t.width > maxW && size > min) { size--; t.setFontSize(size) }
  return t
}

/**
 * The screen in CSS pixels. The canvas is DPR times larger; every layout in
 * the interface is done in these units and the camera does the rest.
 */
export function screen(scene: Phaser.Scene) {
  return { w: scene.scale.width / DPR, h: scene.scale.height / DPR }
}

/** Point a screen-space scene's camera at CSS pixels: see DPR. */
export function cssCamera(scene: Phaser.Scene) {
  scene.cameras.main.setOrigin(0, 0).setZoom(DPR)
}
