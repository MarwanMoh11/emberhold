import type Phaser from 'phaser'
import { PAL } from '../config/palette'
import type { AbilityKey } from '../config/abilities'
import type { UpgradeId } from '../config/upgrades'
import { bake, fill, form, line, P, type Ctx } from './ink'

/**
 * Glyphs for the interface: abilities, boons, and the HUD's own marks.
 *
 * They replace unicode symbols (✳ ◎ ✚ ⇊ ★ ➜) whose look depended on which
 * font the phone happened to have, and which could not be inked to match the
 * world. Every glyph is bone on a transparent 48px canvas with the same ink
 * line as everything else, so it can sit on a wax seal, a parchment card or
 * the walnut HUD and still read.
 */

const S = 48
const C = S / 2
const BONE = PAL.bone
const INKED = { rim: 1.2, core: 2.4 }

type Glyph = (x: Ctx) => void

const g = (path: (x: Ctx) => void, c = BONE, o = INKED) => (x: Ctx) => form(x, path, c, o)

const GLYPHS: Record<string, Glyph> = {
  // ---- abilities --------------------------------------------------------
  whirlwind: x => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      form(x, xx => {
        xx.save(); xx.translate(C, C); xx.rotate(a)
        xx.moveTo(2, -3)
        xx.quadraticCurveTo(16, -12, 18, 4)
        xx.quadraticCurveTo(12, -4, 2, 3)
        xx.closePath()
        xx.restore()
      }, BONE, INKED)
    }
    fill(x, P.circle(C, C, 4), PAL.ember)
  },
  shockwave: x => {
    for (const [r, w] of [[19, 3.2], [12.5, 3.6]]) {
      for (let i = 0; i < 4; i++) {
        const a0 = (i / 4) * Math.PI * 2 + 0.25, a1 = a0 + Math.PI / 2 - 0.5
        form(x, xx => {
          xx.arc(C, C, r + w / 2, a0, a1)
          xx.arc(C, C, r - w / 2, a1, a0, true)
          xx.closePath()
        }, BONE, { rim: 0.6, core: 1 })
      }
    }
    form(x, P.circle(C, C, 5), BONE, INKED)
  },
  mend: x => {
    form(x, xx => {
      xx.moveTo(C, C + 15)
      xx.bezierCurveTo(C - 20, C + 1, C - 13, C - 15, C, C - 6)
      xx.bezierCurveTo(C + 13, C - 15, C + 20, C + 1, C, C + 15)
      xx.closePath()
    }, BONE, INKED)
    form(x, P.ellipse(C + 1, C - 1, 3.6, 7, 0.6), 0x6aa04a, { rim: 0.6, core: 1 })
    line(x, xx => { xx.moveTo(C - 3, C + 5); xx.quadraticCurveTo(C, C, C + 4, C - 5) }, 1, 0x3a5a2a, 0.9)
  },
  arrowRain: x => {
    for (const [ox, oy] of [[-10, -6], [2, -12], [12, -2]]) {
      const bx = C + ox, byy = C + oy
      line(x, xx => { xx.moveTo(bx - 5, byy - 10); xx.lineTo(bx + 4, byy + 10) }, 2.6, BONE, 1)
      form(x, P.poly([[bx + 1, byy + 8], [bx + 7, byy + 15], [bx + 7, byy + 6]]), BONE, { rim: 0.4, core: 0.8 })
      fill(x, P.poly([[bx - 7, byy - 13], [bx - 3, byy - 8], [bx - 8, byy - 7]]), BONE)
    }
  },
  firebomb: x => {
    form(x, P.circle(C - 2, C + 4, 12), 0x3a3e44, { rim: 1.6, core: 4, light: 0x9aa4ad })
    line(x, xx => { xx.moveTo(C + 5, C - 5); xx.quadraticCurveTo(C + 10, C - 12, C + 14, C - 11) }, 2.2, 0x8a5a32, 1)
    form(x, P.blob([[C + 10, C - 10], [C + 13, C - 20], [C + 15, C - 14], [C + 19, C - 19], [C + 19, C - 9]], 0.8), 0xffa040, { rim: 0.8, core: 1.2, light: 0xfff0b0 })
  },
  rally: x => {
    form(x, P.round(C - 11, C - 18, 3, 36, 1.4), 0x8a5a32, { rim: 0.5, core: 1 })
    form(x, P.poly([[C - 8, C - 17], [C + 16, C - 13], [C + 10, C - 5], [C + 16, C + 3], [C - 8, C + 1]]), BONE, INKED)
    fill(x, P.poly([[C + 3, C - 12], [C + 5, C - 7.5], [C + 9.5, C - 7.5], [C + 6, C - 4.5], [C + 7.5, C], [C + 3, C - 2.8], [C - 1.5, C], [C, C - 4.5], [C - 3.5, C - 7.5], [C + 1, C - 7.5]]), PAL.gilt)
  },
  dodge: x => {
    for (const [oy, len] of [[-8, 14], [0, 18], [8, 12]]) line(x, xx => { xx.moveTo(C - 18, C + oy); xx.lineTo(C - 18 + len, C + oy) }, 2.4, BONE, 0.85)
    form(x, P.poly([[C - 2, C - 13], [C + 17, C], [C - 2, C + 13], [C + 4, C]]), BONE, INKED)
  },

  // ---- boons --------------------------------------------------------------
  blade: g(P.poly([[C - 2, C + 18], [C + 2, C + 18], [C + 3, C - 12], [C, C - 19], [C - 3, C - 12]])),
  arrowsFast: x => {
    for (const oy of [-7, 7]) {
      line(x, xx => { xx.moveTo(C - 16, C + oy); xx.lineTo(C + 10, C + oy) }, 2.6, BONE, 1)
      form(x, P.poly([[C + 8, C + oy - 5], [C + 17, C + oy], [C + 8, C + oy + 5]]), BONE, { rim: 0.5, core: 0.8 })
    }
    for (const oy of [-7, 7]) line(x, xx => { xx.moveTo(C - 18, C + oy - 4); xx.lineTo(C - 13, C + oy); xx.lineTo(C - 18, C + oy + 4) }, 1.6, BONE, 1)
  },
  magnet: x => {
    form(x, xx => {
      xx.moveTo(C - 14, C - 14); xx.lineTo(C - 14, C + 2)
      xx.arc(C, C + 2, 14, Math.PI, 0, true)
      xx.lineTo(C + 14, C - 14); xx.lineTo(C + 6, C - 14); xx.lineTo(C + 6, C + 2)
      xx.arc(C, C + 2, 6, 0, Math.PI)
      xx.lineTo(C - 6, C - 14); xx.closePath()
    }, 0xc8403a, INKED)
    fill(x, P.rect(C - 14, C - 14, 8, 5), BONE)
    fill(x, P.rect(C + 6, C - 14, 8, 5), BONE)
  },
  boot: g(P.poly([[C - 9, C - 17], [C + 3, C - 17], [C + 3, C + 4], [C + 16, C + 8], [C + 16, C + 16], [C - 11, C + 16], [C - 9, C + 2]])),
  heart: g(xx => {
    xx.moveTo(C, C + 16)
    xx.bezierCurveTo(C - 22, C, C - 14, C - 17, C, C - 7)
    xx.bezierCurveTo(C + 14, C - 17, C + 22, C, C, C + 16)
    xx.closePath()
  }, 0xe06a6a),
  eye: x => {
    form(x, xx => { xx.moveTo(C - 19, C); xx.quadraticCurveTo(C, C - 17, C + 19, C); xx.quadraticCurveTo(C, C + 17, C - 19, C); xx.closePath() }, BONE, INKED)
    fill(x, P.circle(C, C, 6.5), PAL.lapis)
    fill(x, P.circle(C, C, 3), 0x121014)
    fill(x, P.circle(C - 2, C - 2, 1.3), 0xffffff)
  },
  drop: g(xx => { xx.moveTo(C, C - 18); xx.quadraticCurveTo(C + 15, C + 2, C, C + 16); xx.quadraticCurveTo(C - 15, C + 2, C, C - 18); xx.closePath() }, 0xd84a3a),
  fan: x => {
    for (const a of [-0.45, 0, 0.45]) {
      x.save(); x.translate(C, C + 14); x.rotate(a)
      line(x, xx => { xx.moveTo(0, 0); xx.lineTo(0, -24) }, 2.4, BONE, 1)
      form(x, P.poly([[-4, -22], [0, -31], [4, -22]]), BONE, { rim: 0.5, core: 0.8 })
      x.restore()
    }
  },
  pierce: x => {
    line(x, xx => { xx.moveTo(C - 18, C + 6); xx.lineTo(C + 12, C - 4) }, 2.6, BONE, 1)
    form(x, P.poly([[C + 9, C - 9], [C + 19, C - 7], [C + 12, C + 1]]), BONE, { rim: 0.5, core: 0.8 })
    for (const ox of [-6, 4]) form(x, P.round(C + ox - 2.5, C - 13, 5, 26, 2), 0x6a4a36, { rim: 0.6, core: 1.2 })
  },
  fang: g(xx => { xx.moveTo(C - 12, C - 14); xx.quadraticCurveTo(C, C - 18, C + 12, C - 14); xx.quadraticCurveTo(C + 4, C + 2, C, C + 18); xx.quadraticCurveTo(C - 4, C + 2, C - 12, C - 14); xx.closePath() }),
  bow: x => {
    line(x, xx => { xx.arc(C - 8, C, 19, -1.1, 1.1) }, 3.4, 0x9a6a3a, 1)
    line(x, xx => { xx.moveTo(C - 8 + Math.cos(-1.1) * 19, C + Math.sin(-1.1) * 19); xx.lineTo(C - 8 + Math.cos(1.1) * 19, C + Math.sin(1.1) * 19) }, 1.2, BONE, 1)
    line(x, xx => { xx.moveTo(C - 2, C); xx.lineTo(C + 16, C) }, 2.4, BONE, 1)
    form(x, P.poly([[C + 14, C - 4], [C + 21, C], [C + 14, C + 4]]), BONE, { rim: 0.4, core: 0.8 })
  },
  pack: x => {
    form(x, P.round(C - 14, C - 10, 28, 26, 7), 0xa8743e, INKED)
    form(x, P.round(C - 14, C - 10, 28, 11, 5), 0xc8905a, { rim: 0.8, core: 1.4 })
    fill(x, P.round(C - 3, C - 3, 6, 6, 1), PAL.gilt)
    line(x, xx => { xx.moveTo(C - 8, C - 10); xx.quadraticCurveTo(C, C - 21, C + 8, C - 10) }, 2.4, 0x6e4a2e, 1)
  },
  leaf: g(xx => { xx.moveTo(C - 14, C + 14); xx.quadraticCurveTo(C - 16, C - 12, C + 14, C - 14); xx.quadraticCurveTo(C + 14, C + 14, C - 14, C + 14); xx.closePath() }, 0x7ab05a),
  shield: x => {
    const pts = [[C - 14, C - 16], [C + 14, C - 16], [C + 14, C], [C, C + 17], [C - 14, C]]
    form(x, P.blob(pts, 0.25), PAL.lapis, INKED)
    fill(x, P.rect(C - 2.5, C - 16, 5, 30), BONE)
    fill(x, P.rect(C - 14, C - 6, 28, 5), BONE)
  },
  fist: x => {
    form(x, P.round(C - 10, C - 16, 14, 10, 2), 0x8a8f96, INKED)
    form(x, P.round(C - 1, C - 11, 3, 28, 1.4), 0x8a5a32, { rim: 0.4, core: 0.8 })
    for (const r of [22, 16]) line(x, xx => { xx.arc(C + 2, C - 11, r, -0.3, 0.6) }, 1.8, BONE, 0.8)
  },
  banner: x => {
    form(x, P.round(C - 12, C - 19, 3, 38, 1.4), 0x8a5a32, { rim: 0.5, core: 1 })
    form(x, P.poly([[C - 9, C - 17], [C + 14, C - 17], [C + 14, C + 8], [C + 2.5, C + 2], [C - 9, C + 8]]), PAL.lapis, INKED)
    fill(x, P.rect(C - 1, C - 17, 7, 20), BONE)
    fill(x, P.poly([[C + 2.5, C - 12], [C + 5, C - 8], [C + 2.5, C - 4], [C, C - 8]]), PAL.ember)
  },
  coin: x => {
    form(x, P.circle(C, C, 15), PAL.coins, { rim: 1.6, core: 3.4, light: 0xfff4c0 })
    line(x, P.circle(C, C, 10), 1.2, 0x8a6a2a, 0.9)
    fill(x, P.poly([[C, C - 7], [C + 4.5, C], [C, C + 7], [C - 4.5, C]]), 0x8a6a2a)
  },
  burst: x => {
    const pts: number[][] = []
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const r = i % 2 ? 8 : 19
      pts.push([C + Math.cos(a) * r, C + Math.sin(a) * r])
    }
    form(x, P.poly(pts), 0xffa040, { rim: 1, core: 2.4, light: 0xfff0b0 })
    fill(x, P.circle(C, C, 5), 0xfff4d8)
  },
  feather: x => {
    form(x, xx => { xx.moveTo(C - 14, C + 16); xx.quadraticCurveTo(C - 12, C - 10, C + 14, C - 17); xx.quadraticCurveTo(C + 6, C + 6, C - 14, C + 16); xx.closePath() }, BONE, INKED)
    line(x, xx => { xx.moveTo(C - 16, C + 18); xx.quadraticCurveTo(C - 2, C - 2, C + 12, C - 15) }, 1.2, 0x6a4a36, 0.9)
  },
  tower: x => {
    form(x, P.rect(C - 10, C - 10, 20, 27), 0xcfc8b3, INKED)
    for (let i = 0; i < 3; i++) form(x, P.rect(C - 12 + i * 9, C - 17, 6, 8), 0xcfc8b3, { rim: 0.6, core: 1 })
    fill(x, P.round(C - 3, C, 6, 9, 2), 0x1c120c)
  },
  crown: x => {
    form(x, P.poly([[C - 17, C + 12], [C - 17, C - 8], [C - 8, C + 1], [C, C - 15], [C + 8, C + 1], [C + 17, C - 8], [C + 17, C + 12]]), PAL.gilt, { rim: 1.4, core: 3, light: 0xfff0b0 })
    for (const ox of [-9, 0, 9]) fill(x, P.circle(C + ox, C + 6, 2.4), ox === 0 ? PAL.wax : PAL.lapis)
  },

  // ---- the HUD's own marks ---------------------------------------------------
  sun: x => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      form(x, P.poly([[C + Math.cos(a - 0.14) * 11, C + Math.sin(a - 0.14) * 11], [C + Math.cos(a) * 20, C + Math.sin(a) * 20], [C + Math.cos(a + 0.14) * 11, C + Math.sin(a + 0.14) * 11]]), PAL.gold, { rim: 0, core: 0 })
    }
    form(x, P.circle(C, C, 10.5), PAL.gold, { rim: 1.6, core: 3, light: 0xfff4c8 })
  },
  moon: x => {
    form(x, xx => {
      xx.arc(C, C, 15, 0, Math.PI * 2)
      xx.moveTo(C + 20, C - 6)
      xx.arc(C + 7, C - 6, 13, 0, Math.PI * 2, true)
    }, 0xdde4f4, { rim: 1.4, core: 3, light: 0xffffff })
  },
  pause: x => {
    form(x, P.round(C - 11, C - 13, 7, 26, 2), BONE, INKED)
    form(x, P.round(C + 4, C - 13, 7, 26, 2), BONE, INKED)
  },
  map: x => {
    form(x, P.poly([[C - 17, C - 12], [C - 6, C - 16], [C + 6, C - 12], [C + 17, C - 16], [C + 17, C + 12], [C + 6, C + 16], [C - 6, C + 12], [C - 17, C + 16]]), 0xe8d8b0, INKED)
    line(x, xx => { xx.moveTo(C - 6, C - 16); xx.lineTo(C - 6, C + 12); xx.moveTo(C + 6, C - 12); xx.lineTo(C + 6, C + 16) }, 1, 0x6a4a36, 0.7)
    line(x, xx => { xx.moveTo(C - 12, C + 6); xx.quadraticCurveTo(C - 2, C - 8, C + 11, C - 4) }, 1.4, PAL.wax, 0.9)
    fill(x, P.circle(C + 11, C - 4, 2), PAL.wax)
  },
  follow: x => {
    for (const ox of [-10, 0, 10]) {
      form(x, P.circle(C + ox, C - 7 + Math.abs(ox) * 0.3, 4.5), BONE, { rim: 0.6, core: 1 })
      form(x, P.round(C + ox - 5, C - 2 + Math.abs(ox) * 0.3, 10, 12, 4), PAL.lapis, { rim: 0.6, core: 1.2 })
    }
    form(x, P.poly([[C - 6, C + 13], [C + 6, C + 13], [C, C + 19]]), BONE, { rim: 0.4, core: 0.6 })
  },
  hold: x => {
    const pts = [[C - 13, C - 14], [C + 13, C - 14], [C + 13, C + 1], [C, C + 16], [C - 13, C + 1]]
    form(x, P.blob(pts, 0.25), PAL.lapis, INKED)
    fill(x, P.rect(C - 2.5, C - 14, 5, 27), BONE)
    fill(x, P.rect(C - 13, C - 5, 26, 5), BONE)
  },
  pop: x => {
    form(x, P.circle(C, C - 9, 7), BONE, INKED)
    form(x, xx => { xx.moveTo(C - 13, C + 16); xx.quadraticCurveTo(C - 13, C, C, C); xx.quadraticCurveTo(C + 13, C, C + 13, C + 16); xx.closePath() }, BONE, INKED)
  },
}

export const ABILITY_ICON: Record<AbilityKey, string> = {
  whirlwind: 'ico_whirlwind', shockwave: 'ico_shockwave', mend: 'ico_mend',
  arrowRain: 'ico_arrowRain', firebomb: 'ico_firebomb', rally: 'ico_rally',
}

export const UPGRADE_ICON: Record<UpgradeId, string> = {
  rapidFire: 'ico_arrowsFast', heavyShots: 'ico_blade', magnet: 'ico_magnet', swiftBoots: 'ico_boot',
  vitality: 'ico_heart', keenEdge: 'ico_eye', deepCuts: 'ico_drop', multishot: 'ico_fan',
  pierce: 'ico_pierce', lifesteal: 'ico_fang', longbow: 'ico_bow', packMule: 'ico_pack',
  regen: 'ico_leaf', armor: 'ico_shield', knockback: 'ico_fist', warlordAura: 'ico_banner',
  scavenger: 'ico_coin', splashShots: 'ico_burst', quickHands: 'ico_feather', bulwark: 'ico_tower',
  masteryArms: 'ico_crown', masteryVigor: 'ico_heart', masteryCommand: 'ico_banner',
}

/**
 * Glyphs are only ever shown by the interface, always at a set display size,
 * and on a screen that may be two or three device pixels to the CSS pixel. So
 * they are painted at twice their nominal 48px and scaled down, not up.
 */
const U = 2

export function buildIconTextures(scene: Phaser.Scene) {
  for (const [name, draw] of Object.entries(GLYPHS)) {
    bake(scene, `ico_${name}`, S * U, S * U, {
      body: x => { x.save(); x.scale(U, U); draw(x); x.restore() },
      outline: 2 * U, grain: 0.05,
    })
  }
}
