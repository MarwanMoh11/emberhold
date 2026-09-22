import type Phaser from 'phaser'
import { PAL, CSS } from '../config/palette'

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
