import type Phaser from 'phaser'
import { PAL } from '../config/palette'
import { ENEMIES } from '../config/enemies'
import { SOLDIERS, WORKERS } from '../config/units'
import { bake, css, fill, form, glow, line, lightOf, mix, P, rimLight, shade, shadowOf, INK, type Ctx, type PathFn } from './ink'

/**
 * Characters.
 *
 * Two heraldries, and you should never have to squint to tell them apart. The
 * hold is chibi-proportioned and colourful — lapis tabards, bone bands, faces.
 * The horde has no faces: soot bodies, hunched and heavier-shouldered, lit from
 * inside by whatever colour of ember that breed burns with. The eyes and the
 * cracks are left un-inked so they read as light rather than paint.
 *
 * Every sprite is drawn facing right with its feet on a line 8px above the
 * bottom of the canvas; the entities flip and anchor on that.
 */

const FOOT = 8
const STEEL = 0xc9d1da
const IRON = 0x6d6f73
const LEATHER = 0x6e4a2e
const HAFT = 0x7a5232
const SKINS = [0xf0c9a0, 0xe0ae84, 0xc08a60, 0x93613f]

type Helm = 'hair' | 'kettle' | 'nasal' | 'great' | 'hood' | 'straw' | 'miner' | 'cap' | 'winged' | 'crowned'
type Weapon = 'sword' | 'axe' | 'greataxe' | 'spear' | 'bow' | 'crossbow' | 'hammer' | 'pick' | 'scythe' | 'chisel' | 'none'

interface Look {
  h: number
  bulk?: number
  skin?: number
  hair?: number
  body: number
  band?: number
  sigil?: number
  legs?: number
  boots?: number
  helm?: Helm
  helmColour?: number
  weapon?: Weapon
  shield?: 'round' | 'heater' | 'tower'
  shieldColour?: number
  cape?: number
  plume?: number
  gilt?: boolean
  quiver?: boolean
  belt?: number
  apron?: number
}

// ---- small parts ---------------------------------------------------------

function eyes(x: Ctx, hx: number, hy: number, r: number) {
  const er = Math.max(1.05, r * 0.13)
  fill(x, P.ellipse(hx - r * 0.26, hy + r * 0.12, er, er * 1.25), INK)
  fill(x, P.ellipse(hx + r * 0.36, hy + r * 0.12, er, er * 1.25), INK)
  if (r > 8) {
    fill(x, P.circle(hx - r * 0.26 + er * 0.35, hy + r * 0.12 - er * 0.45, er * 0.4), 0xffffff, 0.9)
    fill(x, P.circle(hx + r * 0.36 + er * 0.35, hy + r * 0.12 - er * 0.45, er * 0.4), 0xffffff, 0.9)
  }
  fill(x, P.ellipse(hx - r * 0.5, hy + r * 0.46, r * 0.2, r * 0.11), 0xe0685a, 0.28)
  fill(x, P.ellipse(hx + r * 0.62, hy + r * 0.46, r * 0.18, r * 0.1), 0xe0685a, 0.28)
}

function weaponFor(x: Ctx, kind: Weapon, hx: number, hy: number, H: number, accent: number) {
  const k = H / 32
  switch (kind) {
    case 'sword': {
      form(x, P.poly([[hx - 1.6 * k, hy - 2 * k], [hx + 1.6 * k, hy - 2 * k], [hx + 1.3 * k, hy - 17 * k], [hx, hy - 20 * k], [hx - 1.3 * k, hy - 17 * k]]), STEEL, { rim: 0.8, core: 1.2 })
      form(x, P.round(hx - 4 * k, hy - 2.6 * k, 8 * k, 2.2 * k, 1), accent, { rim: 0.6, core: 0.8 })
      fill(x, P.round(hx - 1 * k, hy - 0.6 * k, 2 * k, 4 * k, 1), LEATHER)
      break
    }
    case 'axe': {
      form(x, P.round(hx - 1.1 * k, hy - 15 * k, 2.2 * k, 19 * k, 1), HAFT, { rim: 0.6, core: 0.8 })
      form(x, P.blob([[hx + 0.6 * k, hy - 15 * k], [hx + 8 * k, hy - 18 * k], [hx + 9 * k, hy - 8 * k], [hx + 0.6 * k, hy - 10 * k]], 0.4), STEEL, { rim: 0.8, core: 1.6 })
      break
    }
    case 'greataxe': {
      form(x, P.round(hx - 1.3 * k, hy - 20 * k, 2.6 * k, 26 * k, 1), HAFT, { rim: 0.6, core: 0.9 })
      const blade = [[hx + 0.8 * k, hy - 20 * k], [hx + 9 * k, hy - 25 * k], [hx + 12 * k, hy - 16 * k], [hx + 9 * k, hy - 7 * k], [hx + 0.8 * k, hy - 12 * k]]
      form(x, P.blob(blade, 0.35), STEEL, { rim: 1, core: 2 })
      const back = [[hx - 0.8 * k, hy - 19 * k], [hx - 6 * k, hy - 21 * k], [hx - 6 * k, hy - 12 * k], [hx - 0.8 * k, hy - 14 * k]]
      form(x, P.blob(back, 0.35), STEEL, { rim: 0.8, core: 1.4 })
      fill(x, P.circle(hx, hy - 16 * k, 1.4 * k), accent)
      break
    }
    case 'spear': {
      form(x, P.round(hx - 1 * k, hy - 30 * k, 2 * k, 38 * k, 1), HAFT, { rim: 0.5, core: 0.8 })
      form(x, P.poly([[hx - 2.6 * k, hy - 29 * k], [hx + 2.6 * k, hy - 29 * k], [hx, hy - 38 * k]]), STEEL, { rim: 0.8, core: 1.1 })
      fill(x, P.poly([[hx - 1.2 * k, hy - 28 * k], [hx + 4 * k, hy - 26 * k], [hx - 1.2 * k, hy - 24 * k]]), accent)
      break
    }
    case 'bow': {
      x.save()
      x.lineCap = 'round'
      x.beginPath()
      x.arc(hx - 3 * k, hy - 4 * k, 11 * k, -1.2, 1.2)
      x.strokeStyle = css(INK); x.lineWidth = 3.6 * k; x.stroke()
      x.strokeStyle = css(0x9a6a3a); x.lineWidth = 2.1 * k; x.stroke()
      x.beginPath()
      x.moveTo(hx - 3 * k + Math.cos(-1.2) * 11 * k, hy - 4 * k + Math.sin(-1.2) * 11 * k)
      x.lineTo(hx - 3 * k + Math.cos(1.2) * 11 * k, hy - 4 * k + Math.sin(1.2) * 11 * k)
      x.strokeStyle = css(0xf1e4c3, 0.9); x.lineWidth = 0.8; x.stroke()
      x.restore()
      break
    }
    case 'crossbow': {
      form(x, P.round(hx - 3 * k, hy - 4 * k, 12 * k, 3 * k, 1), HAFT, { rim: 0.6, core: 0.9 })
      x.beginPath(); x.moveTo(hx + 6 * k, hy - 10 * k); x.quadraticCurveTo(hx + 10 * k, hy - 3 * k, hx + 6 * k, hy + 4 * k)
      x.strokeStyle = css(INK); x.lineWidth = 2.6 * k; x.stroke()
      x.strokeStyle = css(IRON); x.lineWidth = 1.4 * k; x.stroke()
      break
    }
    case 'hammer': {
      form(x, P.round(hx - 1.1 * k, hy - 14 * k, 2.2 * k, 18 * k, 1), HAFT, { rim: 0.5, core: 0.8 })
      form(x, P.round(hx - 5 * k, hy - 18 * k, 10 * k, 6 * k, 1.5 * k), IRON, { rim: 1, core: 1.6 })
      break
    }
    case 'pick': {
      form(x, P.round(hx - 1.1 * k, hy - 15 * k, 2.2 * k, 19 * k, 1), HAFT, { rim: 0.5, core: 0.8 })
      x.beginPath(); x.moveTo(hx - 8 * k, hy - 11 * k); x.quadraticCurveTo(hx, hy - 19 * k, hx + 8 * k, hy - 11 * k)
      x.strokeStyle = css(INK); x.lineWidth = 3.4 * k; x.stroke()
      x.strokeStyle = css(STEEL); x.lineWidth = 1.9 * k; x.stroke()
      break
    }
    case 'scythe': {
      form(x, P.round(hx - 1 * k, hy - 20 * k, 2 * k, 26 * k, 1), HAFT, { rim: 0.5, core: 0.8 })
      form(x, P.blob([[hx, hy - 20 * k], [hx + 12 * k, hy - 22 * k], [hx + 15 * k, hy - 16 * k], [hx + 6 * k, hy - 18 * k]], 0.6), STEEL, { rim: 0.8, core: 1.2 })
      break
    }
    case 'chisel': {
      form(x, P.round(hx - 1 * k, hy - 8 * k, 2 * k, 11 * k, 1), HAFT, { rim: 0.5, core: 0.7 })
      form(x, P.poly([[hx - 1.6 * k, hy - 8 * k], [hx + 1.6 * k, hy - 8 * k], [hx, hy - 13 * k]]), STEEL, { rim: 0.6, core: 0.8 })
      form(x, P.poly([[hx + 5 * k, hy - 8 * k], [hx + 8 * k, hy - 15 * k], [hx + 11 * k, hy - 8 * k], [hx + 8 * k, hy - 4 * k]]), PAL.crystal, { rim: 1, core: 1.2 })
      break
    }
    case 'none': break
  }
}

function shieldFor(x: Ctx, kind: NonNullable<Look['shield']>, sx: number, sy: number, H: number, field: number, gilt: boolean) {
  const k = H / 32
  const rimC = gilt ? PAL.gilt : IRON
  if (kind === 'round') {
    const r = 6.2 * k
    form(x, P.circle(sx, sy, r), rimC, { rim: 0.8, core: 1.2 })
    form(x, P.circle(sx, sy, r * 0.8), field, { rim: 1, core: 2 })
    fill(x, P.round(sx - r * 0.14, sy - r * 0.76, r * 0.28, r * 1.52, 0.5), PAL.bone, 0.9)
    fill(x, P.circle(sx, sy, r * 0.24), rimC)
  } else if (kind === 'heater') {
    const w = 11 * k, h = 13 * k
    const pts = [[sx - w / 2, sy - h / 2], [sx + w / 2, sy - h / 2], [sx + w / 2, sy + h * 0.05], [sx, sy + h / 2], [sx - w / 2, sy + h * 0.05]]
    form(x, P.blob(pts, 0.3), rimC, { rim: 0.8, core: 1.4 })
    const inset = pts.map(([px, py]) => [sx + (px - sx) * 0.8, sy + (py - sy) * 0.8])
    form(x, P.blob(inset, 0.3), field, { rim: 1, core: 2.2 })
    fill(x, P.poly([[sx, sy - h * 0.28], [sx + w * 0.16, sy], [sx, sy + h * 0.2], [sx - w * 0.16, sy]]), PAL.bone, 0.95)
  } else {
    const w = 14 * k, h = 20 * k
    form(x, P.round(sx - w / 2, sy - h / 2, w, h, 2.4 * k), rimC, { rim: 1, core: 2 })
    form(x, P.round(sx - w / 2 + 1.6 * k, sy - h / 2 + 1.6 * k, w - 3.2 * k, h - 3.2 * k, 1.6 * k), field, { rim: 1.2, core: 3 })
    fill(x, P.rect(sx - 0.9 * k, sy - h / 2 + 2 * k, 1.8 * k, h - 4 * k), PAL.bone, 0.9)
    fill(x, P.rect(sx - w / 2 + 2 * k, sy - 2 * k, w - 4 * k, 1.8 * k), PAL.bone, 0.9)
    for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      fill(x, P.circle(sx + ox * (w / 2 - 2.4 * k), sy + oy * (h / 2 - 2.4 * k), 0.9 * k), STEEL)
    }
  }
}

function helmFor(x: Ctx, look: Look, hx: number, hy: number, r: number) {
  const c = look.helmColour ?? STEEL
  const gilt = look.gilt
  switch (look.helm ?? 'hair') {
    case 'hair': {
      const hair = look.hair ?? 0x5a3620
      form(x, x2 => {
        x2.moveTo(hx - r * 1.02, hy + r * 0.05)
        x2.bezierCurveTo(hx - r * 1.1, hy - r * 1.25, hx + r * 1.1, hy - r * 1.35, hx + r * 1.04, hy - r * 0.05)
        x2.bezierCurveTo(hx + r * 0.6, hy - r * 0.55, hx - r * 0.1, hy - r * 0.2, hx - r * 0.4, hy - r * 0.45)
        x2.bezierCurveTo(hx - r * 0.6, hy - r * 0.2, hx - r * 0.8, hy - r * 0.1, hx - r * 1.02, hy + r * 0.05)
        x2.closePath()
      }, hair, { rim: 1, core: 1.6 })
      break
    }
    case 'kettle': {
      form(x, P.ellipse(hx, hy - r * 0.42, r * 1.45, r * 0.34), c, { rim: 0.8, core: 1.2 })
      form(x, x2 => { x2.ellipse(hx, hy - r * 0.42, r * 0.92, r * 0.9, 0, Math.PI, 0); x2.closePath() }, c, { rim: 1.2, core: 2 })
      break
    }
    case 'nasal': {
      form(x, x2 => {
        x2.moveTo(hx - r * 1.04, hy - r * 0.05)
        x2.quadraticCurveTo(hx - r * 0.9, hy - r * 1.2, hx + r * 0.05, hy - r * 1.4)
        x2.quadraticCurveTo(hx + r * 0.9, hy - r * 1.2, hx + r * 1.04, hy - r * 0.05)
        x2.closePath()
      }, c, { rim: 1.2, core: 2 })
      fill(x, P.round(hx + r * 0.02, hy - r * 0.1, r * 0.2, r * 0.6, 0.5), shade(c, -0.25))
      fill(x, P.rect(hx - r * 1.02, hy - r * 0.2, r * 2.04, r * 0.2), shade(c, -0.2))
      break
    }
    case 'great': {
      form(x, P.round(hx - r * 1.08, hy - r * 1.18, r * 2.16, r * 2.1, r * 0.8), c, { rim: 1.4, core: 2.6 })
      fill(x, P.round(hx - r * 0.6, hy + r * 0.02, r * 1.3, r * 0.2, 0.4), INK)
      fill(x, P.rect(hx - r * 0.08, hy - r * 1.1, r * 0.16, r * 0.9), shade(c, -0.2))
      break
    }
    case 'hood': {
      const hc = look.helmColour ?? 0x3f6b3a
      form(x, x2 => {
        x2.moveTo(hx - r * 1.2, hy + r * 0.9)
        x2.bezierCurveTo(hx - r * 1.4, hy - r * 1.1, hx + r * 0.3, hy - r * 1.8, hx + r * 1.2, hy - r * 0.6)
        x2.lineTo(hx + r * 1.2, hy + r * 0.9)
        x2.closePath()
        x2.moveTo(hx + r * 0.85, hy + r * 0.4)
        x2.ellipse(hx + r * 0.1, hy + r * 0.15, r * 0.78, r * 0.72, 0, 0, Math.PI * 2, true)
      }, hc, { rim: 1.2, core: 2 })
      break
    }
    case 'straw': {
      const st = 0xe0c070
      form(x, P.ellipse(hx, hy - r * 0.45, r * 1.7, r * 0.36), st, { rim: 0.8, core: 1.2 })
      form(x, P.ellipse(hx, hy - r * 0.8, r * 0.9, r * 0.55), st, { rim: 1, core: 1.4 })
      fill(x, P.rect(hx - r * 0.9, hy - r * 0.62, r * 1.8, r * 0.18), 0xa8402c)
      break
    }
    case 'miner': {
      form(x, x2 => { x2.ellipse(hx, hy - r * 0.3, r * 1.05, r * 1.0, 0, Math.PI, 0); x2.closePath() }, 0x8a6a3e, { rim: 1, core: 1.6 })
      fill(x, P.rect(hx - r * 1.2, hy - r * 0.36, r * 2.4, r * 0.22), 0x6a4e2c)
      form(x, P.circle(hx + r * 0.2, hy - r * 0.78, r * 0.3), 0xffe08a, { rim: 0.6, core: 0.6 })
      break
    }
    case 'cap': {
      const cc = look.helmColour ?? 0xb04a34
      form(x, x2 => { x2.ellipse(hx, hy - r * 0.3, r * 1.06, r * 0.95, 0, Math.PI, 0); x2.closePath() }, cc, { rim: 1, core: 1.6 })
      fill(x, P.round(hx - r * 1.1, hy - r * 0.42, r * 2.2, r * 0.3, 1), shade(cc, -0.2))
      fill(x, P.circle(hx - r * 0.1, hy - r * 1.18, r * 0.24), lightOf(cc))
      break
    }
    case 'winged':
    case 'crowned': {
      const hc = look.helmColour ?? STEEL
      form(x, x2 => {
        x2.moveTo(hx - r * 1.08, hy + r * 0.1)
        x2.quadraticCurveTo(hx - r * 1.05, hy - r * 1.25, hx, hy - r * 1.3)
        x2.quadraticCurveTo(hx + r * 1.05, hy - r * 1.25, hx + r * 1.08, hy + r * 0.1)
        x2.closePath()
      }, hc, { rim: 1.4, core: 2.4 })
      fill(x, P.rect(hx - r * 1.06, hy - r * 0.18, r * 2.12, r * 0.24), gilt ? PAL.gilt : shade(hc, -0.2))
      fill(x, P.round(hx - r * 0.1, hy - r * 1.24, r * 0.2, r * 1.2, 0.5), gilt ? PAL.gilt : shade(hc, -0.15))
      if (look.helm === 'winged') {
        for (const s of [-1, 1]) {
          form(x, P.blob([[hx + s * r * 0.9, hy - r * 0.5], [hx + s * r * 1.9, hy - r * 1.4], [hx + s * r * 1.6, hy - r * 0.7], [hx + s * r * 1.95, hy - r * 0.55], [hx + s * r * 1.0, hy - r * 0.1]], 0.5), PAL.bone, { rim: 0.8, core: 1.2 })
        }
      } else {
        for (const s of [-1, 1]) {
          form(x, x2 => {
            x2.moveTo(hx + s * r * 0.85, hy - r * 0.7)
            x2.quadraticCurveTo(hx + s * r * 2.0, hy - r * 1.0, hx + s * r * 1.9, hy - r * 2.1)
            x2.quadraticCurveTo(hx + s * r * 1.5, hy - r * 1.2, hx + s * r * 0.8, hy - r * 0.25)
            x2.closePath()
          }, 0xefe2c4, { rim: 0.8, core: 1.4 })
        }
      }
      if (look.plume !== undefined) {
        form(x, P.blob([[hx - r * 0.2, hy - r * 1.2], [hx + r * 0.2, hy - r * 1.3], [hx - r * 0.6, hy - r * 2.3], [hx - r * 1.5, hy - r * 1.9]], 0.9), look.plume, { rim: 1, core: 1.8 })
      }
      break
    }
  }
}

// ---- the figure ------------------------------------------------------------

/** Paint a hold-side humanoid (hero, soldier, worker) standing at cx, by. */
function figure(x: Ctx, cx: number, by: number, look: Look) {
  const H = look.h
  const bulk = look.bulk ?? 1
  const skin = look.skin ?? SKINS[0]
  const r = H * 0.235
  const hipY = by - H * 0.25
  const shY = by - H * 0.57
  const tw = H * 0.44 * bulk
  const bw = H * 0.54 * bulk
  const hx = cx + H * 0.01
  const hy = shY - r * 0.72
  const legs = look.legs ?? shade(look.body, -0.45)
  const boots = look.boots ?? LEATHER
  const legW = H * 0.14 * Math.sqrt(bulk)
  const small = { rim: Math.max(0.8, H * 0.03), core: Math.max(1.2, H * 0.06) }

  // cape, behind everything, swept back
  if (look.cape !== undefined) {
    form(x, x2 => {
      x2.moveTo(cx - tw * 0.5, shY + H * 0.02)
      x2.lineTo(cx + tw * 0.4, shY + H * 0.02)
      x2.quadraticCurveTo(cx + tw * 0.3, by - H * 0.2, cx + tw * 0.1, by - H * 0.03)
      x2.quadraticCurveTo(cx - tw * 0.5, by + H * 0.01, cx - tw * 1.05, by - H * 0.06)
      x2.quadraticCurveTo(cx - tw * 0.8, by - H * 0.3, cx - tw * 0.5, shY + H * 0.02)
      x2.closePath()
    }, look.cape, { rim: 1, core: H * 0.12 })
  }

  // quiver across the back
  if (look.quiver) {
    form(x, P.round(cx - tw * 0.72, shY - H * 0.12, H * 0.13, H * 0.36, 2), LEATHER, small)
    for (let i = 0; i < 3; i++) fill(x, P.poly([[cx - tw * 0.7 + i * 2, shY - H * 0.12], [cx - tw * 0.66 + i * 2, shY - H * 0.24], [cx - tw * 0.62 + i * 2, shY - H * 0.12]]), PAL.bone)
  }

  // legs and boots
  for (const s of [-1, 1]) {
    const lx = cx + s * H * 0.1
    form(x, P.round(lx - legW / 2, hipY - H * 0.02, legW, H * 0.2, legW * 0.35), legs, small)
    form(x, P.round(lx - legW * 0.55, by - H * 0.1, legW * 1.3, H * 0.1, H * 0.035), boots, small)
  }

  // back arm
  form(x, P.round(cx - tw * 0.5 - H * 0.1, shY + H * 0.02, H * 0.12, H * 0.24, H * 0.06), shade(look.body, -0.12), small)
  form(x, P.circle(cx - tw * 0.5 - H * 0.04, shY + H * 0.26, H * 0.06), skin, small)

  // torso
  const torso = P.blob([
    [cx - tw / 2, shY], [cx + tw / 2, shY],
    [cx + bw / 2, hipY + H * 0.05], [cx - bw / 2, hipY + H * 0.05],
  ], 0.55)
  form(x, torso, look.body, { rim: Math.max(1, H * 0.035), core: H * 0.1 })
  if (look.apron !== undefined) {
    x.save(); x.beginPath(); torso(x); x.clip()
    form(x, P.round(cx - bw * 0.36, shY + H * 0.1, bw * 0.72, H * 0.4, 2), look.apron, small)
    x.restore()
  }
  if (look.band !== undefined) {
    x.save(); x.beginPath(); torso(x); x.clip()
    fill(x, P.rect(cx - H * 0.075, shY - 2, H * 0.15, H * 0.4), look.band)
    fill(x, P.rect(cx + H * 0.075, shY - 2, H * 0.03, H * 0.4), shadowOf(look.band), 0.6)
    x.restore()
  }
  if (look.sigil !== undefined) {
    const sy = shY + H * 0.1
    const s = H * 0.055
    fill(x, P.poly([[cx, sy - s * 1.3], [cx + s, sy], [cx, sy + s * 1.3], [cx - s, sy]]), look.sigil)
  }
  // belt
  const beltC = look.belt ?? LEATHER
  x.save(); x.beginPath(); torso(x); x.clip()
  fill(x, P.rect(cx - bw, hipY - H * 0.045, bw * 2, H * 0.06), beltC)
  x.restore()
  fill(x, P.round(cx - H * 0.035, hipY - H * 0.05, H * 0.07, H * 0.07, 1), look.gilt ? PAL.gilt : 0xc9a24a)
  line(x, x2 => { x2.moveTo(cx - bw * 0.3, hipY + H * 0.04); x2.lineTo(cx - bw * 0.3, hipY + H * 0.01) }, 0.8, INK, 0.4)

  if (look.gilt) {
    x.save(); x.beginPath(); torso(x); x.clip()
    line(x, torso, 1.6, PAL.gilt, 0.95)
    x.restore()
  }

  // shoulders: pauldrons for anything armoured
  if (look.shield || look.helm === 'great' || look.helm === 'winged' || look.helm === 'crowned') {
    const pc = look.gilt ? PAL.gilt : look.helmColour ?? STEEL
    for (const s of [-1, 1]) form(x, P.ellipse(cx + s * tw * 0.5, shY + H * 0.03, H * 0.1 * bulk, H * 0.07), pc, small)
  }

  // head
  form(x, P.circle(hx, hy, r), skin, { rim: Math.max(0.8, r * 0.12), core: r * 0.3, dark: shade(skin, -0.2) })
  if (look.helm !== 'great') eyes(x, hx, hy, r)
  helmFor(x, look, hx, hy, r)

  // shield on the near arm
  if (look.shield) {
    const sy = look.shield === 'tower' ? shY + H * 0.22 : shY + H * 0.18
    const sx = cx - tw * 0.52 - (look.shield === 'tower' ? H * 0.02 : 0)
    shieldFor(x, look.shield, sx, sy, H, look.shieldColour ?? PAL.lapis, !!look.gilt)
  }

  // weapon arm, and what it holds
  const handX = cx + tw * 0.5 + H * 0.08
  const handY = shY + H * 0.24
  form(x, P.round(cx + tw * 0.5 - H * 0.04, shY + H * 0.02, H * 0.12, H * 0.22, H * 0.06), shade(look.body, -0.05), small)
  weaponFor(x, look.weapon ?? 'none', handX, handY, H, look.gilt ? PAL.gilt : PAL.ember)
  form(x, P.circle(handX, handY, H * 0.065), skin, small)
}

/** Canvas size for a figure of height H and bulk b. */
function frameFor(H: number, bulk = 1, extraW = 0, extraH = 0) {
  const w = Math.ceil(H * 1.25 * bulk + 26 + extraW)
  const h = Math.ceil(H * 1.35 + FOOT + 10 + extraH)
  return { w, h, cx: w / 2, by: h - FOOT }
}

function bakeFigure(scene: Phaser.Scene, key: string, look: Look, extraH = 0) {
  const { w, h, cx, by } = frameFor(look.h, look.bulk, 8, extraH)
  bake(scene, key, w, h, {
    body: x => figure(x, cx, by, look),
    outline: Math.max(1.4, Math.min(2.4, look.h * 0.055)),
    grain: 0.1,
  })
}

// ---- the outrider rides ------------------------------------------------------

function bakeOutrider(scene: Phaser.Scene, key: string, look: Look) {
  const H = look.h
  const w = Math.ceil(H * 2.1 + 20)
  const h = Math.ceil(H * 1.7 + FOOT + 10)
  const cx = w / 2, by = h - FOOT
  const horse = 0x8a5a36
  bake(scene, key, w, h, {
    body: x => {
      const k = H / 32
      // legs
      for (const [lx, sh] of [[-11, -0.1], [-6, 0.1], [8, -0.1], [13, 0.1]]) {
        form(x, P.round(cx + lx * k - 1.6 * k, by - 12 * k, 3.2 * k, 12 * k, 1.4 * k), sh < 0 ? shade(horse, -0.3) : horse, { rim: 0.6, core: 1 })
        fill(x, P.round(cx + lx * k - 1.9 * k, by - 2.4 * k, 3.8 * k, 2.4 * k, 1), INK, 0.85)
      }
      // tail
      form(x, P.blob([[cx - 15 * k, by - 20 * k], [cx - 22 * k, by - 14 * k], [cx - 20 * k, by - 6 * k], [cx - 16 * k, by - 15 * k]], 0.9), 0x4a2e1a, { rim: 0.6, core: 1 })
      // barrel
      form(x, P.ellipse(cx, by - 17 * k, 16 * k, 7.5 * k), horse, { rim: 1.2, core: 3 })
      // neck and head
      form(x, P.blob([[cx + 9 * k, by - 21 * k], [cx + 15 * k, by - 33 * k], [cx + 20 * k, by - 31 * k], [cx + 17 * k, by - 18 * k]], 0.7), horse, { rim: 1, core: 2 })
      form(x, P.blob([[cx + 14 * k, by - 35 * k], [cx + 25 * k, by - 30 * k], [cx + 24 * k, by - 26 * k], [cx + 16 * k, by - 28 * k]], 0.8), horse, { rim: 1, core: 1.6 })
      form(x, P.blob([[cx + 12 * k, by - 33 * k], [cx + 15 * k, by - 37 * k], [cx + 18 * k, by - 22 * k], [cx + 14 * k, by - 21 * k]], 0.8), 0x4a2e1a, { rim: 0.6, core: 1 })
      fill(x, P.circle(cx + 20.5 * k, by - 31 * k, 0.9 * k), INK)
      // caparison in the hold's colours
      form(x, P.blob([[cx - 11 * k, by - 23 * k], [cx + 9 * k, by - 23 * k], [cx + 11 * k, by - 12 * k], [cx - 13 * k, by - 12 * k]], 0.4), look.body, { rim: 1, core: 2.4 })
      fill(x, P.rect(cx - 2 * k, by - 23 * k, 4 * k, 11 * k), PAL.bone, 0.9)
      // rider, seated
      const rider: Look = { ...look, h: H * 0.82 }
      x.save()
      x.translate(0, -H * 0.42)
      figureUpper(x, cx - 1 * k, by - 6 * k, rider)
      x.restore()
    },
    outline: 2,
    grain: 0.1,
  })
}

/** Rider from the hips up, for mounted units. */
function figureUpper(x: Ctx, cx: number, by: number, look: Look) {
  x.save()
  x.beginPath(); x.rect(0, 0, 9999, by - look.h * 0.22); x.clip()
  figure(x, cx, by, { ...look, cape: undefined })
  x.restore()
  // legs astride
  const H = look.h
  form(x, P.round(cx + H * 0.02, by - H * 0.26, H * 0.16, H * 0.3, H * 0.06), shade(look.body, -0.45), { rim: 0.8, core: 1.2 })
  form(x, P.round(cx + H * 0.0, by + H * 0.0, H * 0.2, H * 0.1, H * 0.04), LEATHER, { rim: 0.6, core: 1 })
}

// ---- the horde -----------------------------------------------------------

interface HordeLook {
  h: number
  glow: number
  bulk?: number
  hunch?: number
  /** second tone for plates, masks, robes */
  kit?: number
  build: 'husk' | 'runner' | 'brute' | 'slinger' | 'bulwark' | 'keg' | 'champion' | 'caller' | 'warlord' | 'regent'
  /** S16: the caller's robe, cape and hood in this cloth instead (the ash priest's ashen robe) */
  robe?: number
  /** S16: what tops the caller's staff (default the war banner and orb) */
  staff?: 'banner' | 'brazier'
  /** S16: bog slime running off the body, in this colour (the wretch) */
  drip?: number
}

const SOOT = 0x382c2e
const sootForm = { light: 0x6e5a52, dark: 0x181013 }

/** A jagged glowing seam, painted into the body so the ink line wraps it. */
function crack(x: Ctx, pts: number[][], c: number, w = 1.2) {
  x.save()
  x.lineCap = 'round'; x.lineJoin = 'round'
  x.beginPath()
  x.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1])
  x.strokeStyle = css(shade(c, -0.3), 0.95); x.lineWidth = w * 2.4; x.stroke()
  x.strokeStyle = css(mix(c, 0xfff0c0, 0.5)); x.lineWidth = w; x.stroke()
  x.restore()
}

function emberEyes(x: Ctx, ex: number, ey: number, gap: number, s: number, c: number) {
  glow(x, ex + gap / 2, ey, s * 5.5, c, 0.6)
  for (const o of [0, gap]) {
    glow(x, ex + o, ey, s * 2.2, c, 0.9)
    fill(x, P.ellipse(ex + o, ey, s * 1.1, s * 0.78, -0.2), mix(c, 0xffffff, 0.2))
    fill(x, P.ellipse(ex + o + s * 0.1, ey - s * 0.05, s * 0.55, s * 0.4, -0.2), 0xfffbe8)
  }
}

interface HordeRig {
  H: number; k: number; bulk: number
  shY: number; hipY: number; tw: number; bw: number
  hx: number; hy: number; r: number
  handX: number; handY: number
  ex: number; ey: number; gap: number; es: number
}

function hordeRig(cx: number, by: number, L: HordeLook): HordeRig {
  const H = L.h
  const bulk = L.bulk ?? 1
  const hunch = L.hunch ?? 0.1
  const heavy = L.build === 'brute' || L.build === 'warlord'
  const r = H * (heavy ? 0.15 : L.build === 'runner' ? 0.19 : L.build === 'regent' || L.build === 'caller' ? 0.18 : 0.2)
  const shY = by - H * (0.62 - hunch * 0.45)
  const hipY = by - H * 0.27
  const tw = H * 0.56 * bulk
  const bw = H * 0.42 * bulk
  // the head sits low and forward, sunk between the shoulders
  const hx = cx + tw * 0.28 + H * hunch * 0.55
  const hy = shY - r * (heavy ? 0.1 : 0.55) + H * hunch * 0.2
  const handX = cx + tw * 0.62 + H * 0.02
  const handY = shY + H * (L.build === 'runner' ? 0.24 : 0.34)
  const es = Math.max(1.5, r * 0.25)
  return { H, k: H / 32, bulk, shY, hipY, tw, bw, hx, hy, r, handX, handY, ex: hx - r * 0.08, ey: hy + r * 0.02, gap: r * 0.62, es }
}

/** The hunched back: a hump over the shoulders, the chest thrust forward. */
function hordeTorso(cx: number, R: HordeRig) {
  const { H, shY, hipY, tw, bw } = R
  return (x: Ctx) => {
    x.moveTo(cx - bw * 0.5, hipY + H * 0.05)
    x.bezierCurveTo(cx - tw * 0.8, hipY - H * 0.06, cx - tw * 0.78, shY - H * 0.06, cx - tw * 0.12, shY - H * 0.13)
    x.bezierCurveTo(cx + tw * 0.34, shY - H * 0.17, cx + tw * 0.66, shY - H * 0.04, cx + tw * 0.58, shY + H * 0.12)
    x.bezierCurveTo(cx + tw * 0.52, shY + H * 0.26, cx + bw * 0.66, hipY - H * 0.06, cx + bw * 0.46, hipY + H * 0.05)
    x.closePath()
  }
}

function paintHorde(x: Ctx, cx: number, by: number, L: HordeLook, R: HordeRig) {
  const { H, k, shY, hipY, tw, bw, hx, hy, r, handX, handY } = R
  const g = L.glow
  const kit = L.kit ?? 0x5a4436
  const small = { ...sootForm, rim: Math.max(0.8, H * 0.03), core: Math.max(1.2, H * 0.07) }
  const emberLip = mix(g, SOOT, 0.35)

  // cape / robe behind
  if (L.build === 'champion' || L.build === 'warlord' || L.build === 'regent' || L.build === 'caller') {
    const capeC = L.robe !== undefined ? shade(L.robe, -0.2) : L.build === 'regent' ? 0x6a2416 : L.build === 'caller' ? 0x2e2650 : L.build === 'champion' ? 0x3a2448 : 0x4a1016
    const cape: PathFn = x2 => {
      x2.moveTo(cx - tw * 0.45, shY - H * 0.08)
      x2.lineTo(cx + tw * 0.3, shY - H * 0.1)
      x2.quadraticCurveTo(cx + tw * 0.2, by - H * 0.2, cx + tw * 0.05, by - H * 0.02)
      x2.lineTo(cx - tw * 0.25, by - H * 0.07)
      x2.lineTo(cx - tw * 0.55, by + H * 0.0)
      x2.lineTo(cx - tw * 0.8, by - H * 0.09)
      x2.lineTo(cx - tw * 1.1, by - H * 0.02)
      x2.quadraticCurveTo(cx - tw * 0.95, by - H * 0.35, cx - tw * 0.45, shY - H * 0.08)
      x2.closePath()
    }
    form(x, cape, capeC, { rim: 1, core: H * 0.12, hatch: 0.18 })
    rimLight(x, cape, mix(g, capeC, 0.45), Math.max(1.2, H * 0.04))
  }

  // keg on the back
  if (L.build === 'keg') {
    form(x, P.round(cx - tw * 0.98, shY - H * 0.3, H * 0.4, H * 0.46, H * 0.1), 0x8a5a2e, { rim: 1, core: 2.4 })
    for (const f of [0.1, 0.34]) fill(x, P.rect(cx - tw * 0.98, shY - H * 0.3 + H * f, H * 0.4, H * 0.045), IRON)
    fill(x, P.circle(cx - tw * 0.78, shY - H * 0.08, H * 0.05), 0x2a1a10)
  }

  // tail for runners
  if (L.build === 'runner') {
    x.save()
    x.beginPath(); x.moveTo(cx - bw * 0.5, hipY); x.bezierCurveTo(cx - H * 0.6, hipY + H * 0.05, cx - H * 0.75, hipY - H * 0.2, cx - H * 0.62, hipY - H * 0.42)
    x.strokeStyle = css(SOOT); x.lineWidth = 2.4 * k; x.stroke()
    x.restore()
  }

  // legs: bowed and clawed
  for (const s of [-1, 1]) {
    const lx = cx + s * H * (L.build === 'runner' ? 0.15 : 0.12) * R.bulk
    const lw = H * 0.15 * R.bulk
    form(x, P.blob([[lx - lw * 0.5, hipY - H * 0.02], [lx + lw * 0.5, hipY - H * 0.02], [lx + lw * 0.45, by - H * 0.06], [lx - lw * 0.55, by - H * 0.06]], 0.7), s < 0 ? shade(SOOT, -0.12) : SOOT, small)
    const foot = P.poly([[lx - lw * 0.6, by], [lx + lw * 0.95, by], [lx + lw * 0.5, by - H * 0.08], [lx - lw * 0.55, by - H * 0.08]])
    form(x, foot, 0x221819, small)
    rimLight(x, foot, emberLip, 1)
  }

  // back arm, long enough to drag
  const backArm = P.blob([[cx - tw * 0.52, shY - H * 0.02], [cx - tw * 0.3, shY], [cx - tw * 0.36, shY + H * 0.36], [cx - tw * 0.58, shY + H * 0.34]], 0.8)
  form(x, backArm, shade(SOOT, -0.15), small)
  fill(x, P.circle(cx - tw * 0.48, shY + H * 0.37, H * 0.07), 0x1c1416)

  // body
  const torso = hordeTorso(cx, R)
  if (L.build === 'caller' || L.build === 'regent') {
    const robe: PathFn = x2 => {
      x2.moveTo(cx - tw * 0.45, shY - H * 0.06)
      x2.bezierCurveTo(cx - tw * 0.1, shY - H * 0.14, cx + tw * 0.3, shY - H * 0.14, cx + tw * 0.5, shY - H * 0.02)
      x2.lineTo(cx + bw * 0.85, by - H * 0.02)
      x2.lineTo(cx + bw * 0.3, by + H * 0.01)
      x2.lineTo(cx - bw * 0.2, by - H * 0.03)
      x2.lineTo(cx - bw * 0.9, by - H * 0.01)
      x2.closePath()
    }
    const robeC = L.robe ?? (L.build === 'regent' ? 0x3e1c14 : 0x2a2446)
    form(x, robe, robeC, { rim: 1.2, core: H * 0.12, hatch: 0.16 })
    rimLight(x, robe, mix(g, robeC, 0.3), Math.max(1.4, H * 0.05))
    fill(x, P.rect(cx - H * 0.04, shY + H * 0.02, H * 0.08, by - shY - H * 0.06), mix(g, 0x000000, 0.2), 0.85)
    if (L.robe !== undefined) {
      // ash settled in the folds, and a scorched hem
      for (const [fx, fy, fr] of [[-0.3, 0.22, 0.03], [0.12, 0.34, 0.025], [-0.12, 0.5, 0.035], [0.3, 0.46, 0.022], [-0.4, 0.62, 0.028], [0.18, 0.66, 0.03]]) {
        fill(x, P.circle(cx + tw * fx, shY + H * fy, H * fr), mix(robeC, 0xf0e8e0, 0.45), 0.75)
      }
      fill(x, P.rect(cx - bw * 0.9, by - H * 0.07, bw * 1.75, H * 0.05), shade(robeC, -0.45), 0.8)
    }
  } else {
    form(x, torso, SOOT, { ...sootForm, rim: Math.max(1, H * 0.04), core: H * 0.13 })
    rimLight(x, torso, emberLip, Math.max(1.2, H * 0.045))
  }

  // tatters
  if (L.build === 'husk' || L.build === 'runner' || L.build === 'slinger' || L.build === 'keg' || L.build === 'brute') {
    form(x, P.poly([
      [cx - bw * 0.55, hipY - H * 0.01], [cx + bw * 0.5, hipY - H * 0.01], [cx + bw * 0.42, hipY + H * 0.14],
      [cx + bw * 0.12, hipY + H * 0.07], [cx - bw * 0.08, hipY + H * 0.16], [cx - bw * 0.46, hipY + H * 0.1],
    ]), kit, small)
  }

  // armour
  if (L.build === 'brute' || L.build === 'bulwark' || L.build === 'champion' || L.build === 'warlord') {
    const plate = L.build === 'champion' ? 0x4c4660 : L.build === 'warlord' ? 0x4e3c36 : 0x5e5854
    x.save(); x.beginPath(); torso(x); x.clip()
    form(x, P.round(cx - tw * 0.1, shY + H * 0.02, tw * 0.62, H * 0.22, 2), plate, { rim: 1, core: 2 })
    x.restore()
    for (const s of [-1, 1]) {
      const px = cx + (s < 0 ? -tw * 0.35 : tw * 0.36)
      const py = shY - H * 0.07
      form(x, P.blob([[px - H * 0.15, py + H * 0.08], [px - H * 0.1, py - H * 0.07], [px + H * 0.1, py - H * 0.08], [px + H * 0.15, py + H * 0.08]], 0.7), plate, { rim: 1, core: 2.2 })
      if (L.build !== 'bulwark') {
        form(x, P.poly([[px - H * 0.05, py - H * 0.06], [px + s * H * 0.03, py - H * 0.22], [px + H * 0.05, py - H * 0.07]]), 0xd8ccb4, { rim: 0.6, core: 1 })
      }
    }
  }

  // glowing seams
  crack(x, [[cx - tw * 0.3, shY - H * 0.02], [cx - tw * 0.16, shY + H * 0.08], [cx - tw * 0.26, shY + H * 0.17], [cx - tw * 0.06, shY + H * 0.27]], g, Math.max(0.9, H * 0.03))
  if (H > 34) crack(x, [[cx + tw * 0.12, shY + H * 0.1], [cx + tw * 0.02, shY + H * 0.18], [cx + tw * 0.14, shY + H * 0.24]], g, Math.max(0.9, H * 0.024))

  // head
  if (L.build !== 'caller' && L.build !== 'slinger') {
    form(x, P.circle(hx, hy, r), SOOT, { ...sootForm, rim: Math.max(0.8, r * 0.14), core: r * 0.38 })
  }

  switch (L.build) {
    case 'husk':
    case 'keg':
      form(x, P.poly([[hx - r * 0.95, hy - r * 0.4], [hx - r * 0.55, hy - r * 1.45], [hx - r * 0.15, hy - r * 0.85], [hx + r * 0.25, hy - r * 1.5], [hx + r * 0.95, hy - r * 0.45]]), 0x1f1618, small)
      break
    case 'runner':
      for (const s of [-0.7, 0.1]) {
        form(x, P.poly([[hx + r * s, hy - r * 0.5], [hx + r * (s - 1.5), hy - r * 1.25], [hx + r * (s + 0.55), hy - r * 0.1]]), SOOT, small)
      }
      break
    case 'brute':
      for (const s of [-1, 1]) {
        form(x, x2 => {
          x2.moveTo(hx + s * r * 0.75, hy - r * 0.45)
          x2.quadraticCurveTo(hx + s * r * 2.3, hy - r * 0.7, hx + s * r * 2.1, hy - r * 2.3)
          x2.quadraticCurveTo(hx + s * r * 1.5, hy - r * 1.1, hx + s * r * 0.5, hy - r * 0.05)
          x2.closePath()
        }, 0xd6c8aa, { rim: 0.8, core: 1.8 })
      }
      break
    case 'slinger': {
      const hood: PathFn = x2 => {
        x2.moveTo(hx - r * 1.35, hy + r * 1.1)
        x2.bezierCurveTo(hx - r * 1.6, hy - r * 1.3, hx + r * 0.5, hy - r * 2.0, hx + r * 1.35, hy - r * 0.55)
        x2.lineTo(hx + r * 1.2, hy + r * 1.1)
        x2.closePath()
      }
      form(x, hood, 0x3e2e34, { ...sootForm, rim: 1, core: 2.4 })
      form(x, P.blob([[hx - r * 0.75, hy - r * 0.55], [hx + r * 0.95, hy - r * 0.6], [hx + r * 0.75, hy + r * 0.45], [hx + r * 0.05, hy + r * 0.95], [hx - r * 0.65, hy + r * 0.45]], 0.5), 0xece0c4, { rim: 0.8, core: 1.6 })
      line(x, x2 => { x2.moveTo(hx - r * 0.35, hy + r * 0.62); x2.lineTo(hx + r * 0.45, hy + r * 0.6) }, 0.9, INK, 0.75)
      for (let i = 0; i < 3; i++) line(x, x2 => { const tx = hx - r * 0.2 + i * r * 0.25; x2.moveTo(tx, hy + r * 0.52); x2.lineTo(tx, hy + r * 0.72) }, 0.6, INK, 0.6)
      break
    }
    case 'bulwark':
    case 'champion':
    case 'warlord': {
      const hc = L.build === 'champion' ? 0x4c4660 : L.build === 'warlord' ? 0x42322e : 0x5e5854
      form(x, P.round(hx - r * 1.1, hy - r * 1.2, r * 2.2, r * 2.15, r * 0.75), hc, { rim: 1.2, core: 2.4 })
      fill(x, P.round(hx - r * 0.8, hy - r * 0.2, r * 1.65, r * 0.46, r * 0.2), 0x0c0808)
      if (L.build !== 'bulwark') {
        for (const s of [-1, 1]) {
          form(x, x2 => {
            x2.moveTo(hx + s * r * 0.85, hy - r * 0.8)
            x2.quadraticCurveTo(hx + s * r * 2.3, hy - r * 1.1, hx + s * r * 2.1, hy - r * 2.6)
            x2.quadraticCurveTo(hx + s * r * 1.55, hy - r * 1.3, hx + s * r * 0.7, hy - r * 0.35)
            x2.closePath()
          }, 0xdccfb2, { rim: 0.8, core: 1.8 })
        }
      }
      if (L.build === 'champion') {
        glow(x, hx - r * 0.2, hy - r * 1.8, r * 1.8, g, 0.55)
        form(x, P.blob([[hx - r * 0.55, hy - r * 1.1], [hx + r * 0.45, hy - r * 1.1], [hx + r * 0.25, hy - r * 2.0], [hx - r * 0.3, hy - r * 2.9], [hx - r * 0.55, hy - r * 1.9]], 0.7), g, { rim: 1, core: 1.4, light: 0xffffff })
      }
      R.ey = hy + r * 0.03; R.gap = r * 0.7; R.ex = hx - r * 0.3
      break
    }
    case 'caller': {
      const hood: PathFn = P.blob([[hx - r * 1.15, hy + r * 0.9], [hx - r * 0.35, hy - r * 2.5], [hx + r * 0.25, hy - r * 2.6], [hx + r * 1.2, hy + r * 0.9]], 0.4)
      form(x, hood, L.robe ?? 0x2a2446, { rim: 1, core: 2.4 })
      fill(x, P.ellipse(hx + r * 0.05, hy + r * 0.15, r * 0.75, r * 0.7), 0x0c0810)
      fill(x, P.poly([[hx - r * 0.2, hy - r * 1.5], [hx, hy - r * 1.95], [hx + r * 0.2, hy - r * 1.5], [hx, hy - r * 1.1]]), g)
      break
    }
    case 'regent': {
      glow(x, hx, hy - r * 1.4, r * 2.4, 0xffa040, 0.55)
      fill(x, P.rect(hx - r * 1.05, hy - r * 0.95, r * 2.1, r * 0.45), 0x3a1410)
      for (const o of [-0.7, -0.25, 0.25, 0.7]) {
        const tall = Math.abs(o) < 0.5 ? 2.0 : 1.45
        form(x, P.poly([[hx + r * (o - 0.26), hy - r * 0.9], [hx + r * (o + 0.26), hy - r * 0.9], [hx + r * o, hy - r * tall]]), 0xff7a2a, { rim: 0.8, core: 1, light: 0xffe08a })
      }
      break
    }
  }

  // tower shield for the bulwark, carried in front
  if (L.build === 'bulwark') {
    const sw = H * 0.5, sh = H * 0.66
    const sx = cx + tw * 0.18, sy = shY + H * 0.26
    const shield = P.round(sx - sw / 2, sy - sh / 2, sw, sh, H * 0.07)
    form(x, shield, 0x534e4a, { rim: 1.4, core: 3, hatch: 0.15 })
    rimLight(x, shield, mix(g, 0x534e4a, 0.45), 1.4)
    for (let i = 0; i < 3; i++) fill(x, P.rect(sx - sw / 2 + 2, sy - sh / 2 + sh * (0.2 + i * 0.28), sw - 4, H * 0.035), 0x2e2a28)
    for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) fill(x, P.circle(sx + ox * (sw / 2 - 2.6 * k), sy + oy * (sh / 2 - 2.6 * k), 1 * k), 0xb8b0a0)
    crack(x, [[sx - sw * 0.1, sy - sh * 0.36], [sx + sw * 0.1, sy - sh * 0.12], [sx - sw * 0.08, sy + sh * 0.08], [sx + sw * 0.12, sy + sh * 0.36]], g, Math.max(1, H * 0.032))
  }

  // weapon arm
  const arm = P.blob([[cx + tw * 0.4, shY - H * 0.04], [cx + tw * 0.64, shY - H * 0.02], [handX + H * 0.05, handY], [handX - H * 0.07, handY + H * 0.02]], 0.8)
  form(x, arm, SOOT, small)
  rimLight(x, arm, emberLip, 1)

  switch (L.build) {
    case 'husk': {
      form(x, P.blob([[handX - 1.6 * k, handY + 3 * k], [handX + 1.6 * k, handY + 3 * k], [handX + 4.6 * k, handY - 15 * k], [handX - 3.4 * k, handY - 15 * k]], 0.8), 0x5e3c22, small)
      for (const [nx, ny] of [[-2.6, -13], [3.2, -11], [-1.6, -8.5]]) fill(x, P.circle(handX + nx * k, handY + ny * k, 1 * k), 0xc8c0b0)
      break
    }
    case 'brute': {
      form(x, P.round(handX - 1.5 * k, handY - 17 * k, 3 * k, 21 * k, 1), 0x4a3020, small)
      form(x, P.round(handX - 7 * k, handY - 23 * k, 14 * k, 9 * k, 2.4 * k), 0x5c5854, { rim: 1, core: 2.4 })
      crack(x, [[handX - 5 * k, handY - 19 * k], [handX + 4 * k, handY - 17 * k]], g, 1)
      break
    }
    case 'slinger': weaponFor(x, 'bow', handX, handY, H, g); break
    case 'bulwark': weaponFor(x, 'sword', handX + H * 0.04, handY, H, g); break
    case 'keg': form(x, P.round(handX - 1 * k, handY - 11 * k, 2 * k, 13 * k, 1), 0x5a3a22, small); break
    case 'champion':
    case 'warlord': weaponFor(x, 'greataxe', handX, handY, H, g); break
    case 'caller':
    case 'regent': {
      form(x, P.round(handX - 1.2 * k, handY - 27 * k, 2.4 * k, 35 * k, 1), 0x3a2618, small)
      if (L.staff === 'brazier') {
        // an iron fire-bowl on three prongs
        const bt = handY - 27 * k
        for (const o of [-4, 0, 4]) line(x, x2 => { x2.moveTo(handX, bt + 5 * k); x2.lineTo(handX + o * k, bt) }, 1.1 * k, 0x2a2624, 1)
        form(x, P.poly([[handX - 6.5 * k, bt - 1.5 * k], [handX + 6.5 * k, bt - 1.5 * k], [handX + 3.8 * k, bt + 3.4 * k], [handX - 3.8 * k, bt + 3.4 * k]]), 0x46403c, { rim: 0.8, core: 1.8 })
        fill(x, P.rect(handX - 7 * k, bt - 2.4 * k, 14 * k, 1.6 * k), 0x6a625c)
        fill(x, P.ellipse(handX, bt - 2.2 * k, 5.2 * k, 1.5 * k), 0xff7a2a)
      } else if (L.build === 'caller') {
        const bx = handX + 1 * k, byy = handY - 26 * k
        form(x, P.poly([[bx, byy], [bx + 12 * k, byy + 1 * k], [bx + 10 * k, byy + 6 * k], [bx + 13 * k, byy + 12 * k], [bx, byy + 13 * k]]), 0x3c3070, { rim: 0.8, core: 2 })
        fill(x, P.circle(bx + 5.5 * k, byy + 6.5 * k, 2.2 * k), g)
      }
      break
    }
    default: break
  }
  form(x, P.circle(handX, handY, H * 0.075), 0x221819, small)
  if (L.drip !== undefined) paintDrips(x, cx, by, R, L.drip)
}

/** S16: the bog wretch's slime, running off the shoulders, the arms and the hem and pooling in bulbs. */
function paintDrips(x: Ctx, cx: number, by: number, R: HordeRig, c: number) {
  const { H, shY, hipY, tw, bw, handX, handY } = R
  // weed hanging over the hump
  for (const [ox, len] of [[-0.42, 0.3], [-0.12, 0.24], [0.18, 0.2]]) {
    line(x, x2 => {
      const sx = cx + tw * ox, sy = shY - H * 0.12
      x2.moveTo(sx, sy)
      x2.bezierCurveTo(sx - H * 0.05, sy + H * len * 0.4, sx + H * 0.04, sy + H * len * 0.7, sx - H * 0.02, sy + H * len)
    }, Math.max(1, H * 0.035), shade(c, -0.35), 0.95)
  }
  const runs: number[][] = [
    [cx - tw * 0.48, shY + H * 0.3, 0.2],
    [cx - tw * 0.16, shY - H * 0.08, 0.3],
    [cx + tw * 0.3, shY - H * 0.02, 0.22],
    [handX - H * 0.02, handY + H * 0.02, 0.16],
    [cx - bw * 0.32, hipY + H * 0.06, 0.13],
    [cx + bw * 0.3, hipY + H * 0.04, 0.1],
  ]
  const w = Math.max(1.1, H * 0.04)
  for (const [dx, ty, f] of runs) {
    const len = H * f
    const run = P.blob([
      [dx - w, ty], [dx + w, ty], [dx + w * 0.45, ty + len * 0.75], [dx + w * 1.15, ty + len],
      [dx, ty + len + w * 1.5], [dx - w * 1.15, ty + len], [dx - w * 0.45, ty + len * 0.75],
    ], 0.6)
    form(x, run, c, { rim: 0.8, core: 1, light: mix(c, 0xe8f0c0, 0.4), dark: shade(c, -0.4) })
    fill(x, P.ellipse(dx - w * 0.35, ty + len - w * 0.1, w * 0.35, w * 0.5), mix(c, 0xffffff, 0.55), 0.85)
  }
  // a drop falling from the hand, and the puddle it feeds
  fill(x, P.ellipse(handX + H * 0.01, handY + H * 0.3, w * 0.8, w * 1.1), c)
  form(x, P.ellipse(cx + H * 0.02, by - H * 0.01, bw * 0.95, H * 0.035), shade(c, -0.25), { rim: 0.6, core: 0.8 })
}

/** S16: thornlings, a knot of bramble on twig legs, all thorns and two coals for eyes. */
function bakeThornling(scene: Phaser.Scene, key: string, H: number, g: number) {
  const w = Math.ceil(H * 2 + 18), h = Math.ceil(H * 1.7 + FOOT + 8)
  const cx = w / 2, by = h - FOOT
  const k = H / 16
  const BARK = 0x3e2c1e, TWIG = 0x2a1e14, THORN = 0xd6c490
  const cy = by - 12 * k
  bake(scene, key, w, h, {
    body: x => {
      for (const s of [-1, 1]) {
        line(x, x2 => { x2.moveTo(cx + s * 2 * k, by - 7 * k); x2.quadraticCurveTo(cx + s * 5 * k, by - 4 * k, cx + s * 4.5 * k, by) }, 1.7 * k, TWIG, 1)
        line(x, x2 => { x2.moveTo(cx + s * 4.5 * k, by); x2.lineTo(cx + s * 6.5 * k, by - 0.5 * k) }, 1.2 * k, TWIG, 1)
      }
      // the back arm, then the knot, then the reaching arm
      line(x, x2 => { x2.moveTo(cx - 3 * k, cy - 1 * k); x2.quadraticCurveTo(cx - 8 * k, cy + 1 * k, cx - 9 * k, cy + 5 * k) }, 1.4 * k, shade(TWIG, -0.2), 1)
      for (let i = 0; i < 11; i++) {
        const a = -Math.PI * 0.95 + (i / 10) * Math.PI * 1.9 - Math.PI / 2
        const r0 = 5.5 * k, r1 = (i % 2 ? 9 : 11) * k
        const bx = cx + Math.cos(a) * r0, byy = cy + Math.sin(a) * r0 * 1.1
        const tx = cx + Math.cos(a) * r1, ty = cy + Math.sin(a) * r1 * 1.1
        const nx = -Math.sin(a) * 1.1 * k, ny = Math.cos(a) * 1.1 * k
        fill(x, P.poly([[bx + nx, byy + ny], [tx, ty], [bx - nx, byy - ny]]), THORN)
      }
      const knot = P.cluster([[cx - 3 * k, cy + 2 * k, 4.6 * k], [cx + 3 * k, cy + 1.5 * k, 4.8 * k], [cx, cy - 3.5 * k, 5.4 * k], [cx + 4.5 * k, cy - 4 * k, 3.8 * k]])
      form(x, knot, BARK, { rim: 1, core: 2.2, hatch: 0.2, light: 0x70543a, dark: 0x1c140e })
      rimLight(x, knot, mix(g, BARK, 0.45), 1.1)
      // vines wound round the knot
      for (const [a, b] of [[[-5, -3], [5, 2]], [[-4, 4], [6, -5]], [[-2, -8], [3, 5]]]) {
        line(x, x2 => { x2.moveTo(cx + a[0] * k, cy + a[1] * k); x2.quadraticCurveTo(cx, cy - 1 * k, cx + b[0] * k, cy + b[1] * k) }, 1.1 * k, 0x241810, 0.9)
      }
      line(x, x2 => { x2.moveTo(cx + 4 * k, cy); x2.quadraticCurveTo(cx + 9 * k, cy - 1 * k, cx + 10 * k, cy + 4 * k) }, 1.5 * k, TWIG, 1)
      for (const [tx, ty] of [[10, 4], [11.5, 2.5], [9, 5.5]]) fill(x, P.poly([[cx + 10 * k, cy + 4 * k], [cx + (tx + 1.5) * k, cy + (ty + 0.8) * k], [cx + tx * k, cy + (ty + 1.6) * k]]), THORN)
      // one sour leaf
      form(x, P.ellipse(cx - 4.5 * k, cy - 7 * k, 2.6 * k, 1.3 * k, -0.7), 0x6a8a3a, { rim: 0.6, core: 0.8 })
    },
    over: x => emberEyes(x, cx + 1.8 * k, cy - 3.5 * k, 3.2 * k, 1.2 * k, g),
    outline: 1.3,
    grain: 0.12,
  })
}

/** S16: the cinder hound, a lean soot dog cracked with fire, a mane of embers down its spine. */
function bakeHound(scene: Phaser.Scene, key: string, H: number, g: number) {
  const w = Math.ceil(H * 2.2 + 24), h = Math.ceil(H * 1.3 + FOOT + 12)
  const cx = w / 2 - H * 0.08, by = h - FOOT
  const bodyY = by - H * 0.56
  const x0 = cx - H * 0.62, x1 = cx + H * 0.46
  const hx = x1 + H * 0.26, hy = bodyY - H * 0.3
  const small = { ...sootForm, rim: Math.max(0.8, H * 0.03), core: Math.max(1.2, H * 0.06) }
  const emberLip = mix(g, SOOT, 0.35)
  const lw = H * 0.065
  const foreLeg = (fx: number): PathFn => P.blob([
    [fx - lw * 1.3, bodyY], [fx + lw * 1.3, bodyY], [fx + H * 0.03 + lw, by - H * 0.22],
    [fx + H * 0.07 + lw, by - H * 0.02], [fx + H * 0.07 - lw, by - H * 0.02], [fx + H * 0.02 - lw, by - H * 0.22],
  ], 0.5)
  const hindLeg = (fx: number): PathFn => P.blob([
    [fx - lw * 1.8, bodyY - H * 0.04], [fx + lw * 1.6, bodyY - H * 0.04], [fx - H * 0.06 + lw, by - H * 0.22],
    [fx - H * 0.01 + lw, by - H * 0.02], [fx - H * 0.01 - lw, by - H * 0.02], [fx - H * 0.12 - lw, by - H * 0.24],
  ], 0.5)
  const paw = (fx: number) => P.ellipse(fx + H * 0.04, by - H * 0.025, lw * 1.9, lw * 0.9)
  const spine = [[x0 + H * 0.08, bodyY - H * 0.14], [cx - H * 0.2, bodyY - H * 0.2], [cx + H * 0.08, bodyY - H * 0.24], [x1 - H * 0.04, bodyY - H * 0.3], [x1 + H * 0.12, bodyY - H * 0.4]]
  bake(scene, key, w, h, {
    body: x => {
      // far legs, in shadow
      form(x, foreLeg(x1 - H * 0.2), shade(SOOT, -0.2), small)
      form(x, hindLeg(x0 + H * 0.2), shade(SOOT, -0.2), small)
      // the tail, a whip with a coal at the end
      line(x, x2 => { x2.moveTo(x0 + H * 0.04, bodyY - H * 0.08); x2.bezierCurveTo(x0 - H * 0.2, bodyY - H * 0.1, x0 - H * 0.22, bodyY - H * 0.4, x0 - H * 0.36, bodyY - H * 0.46) }, Math.max(1.6, H * 0.06), SOOT, 1)
      // the barrel: deep chest, tucked belly
      const body = P.blob([
        [x0, bodyY - H * 0.1], [cx - H * 0.15, bodyY - H * 0.2], [x1 - H * 0.06, bodyY - H * 0.26], [x1 + H * 0.12, bodyY - H * 0.02],
        [x1 - H * 0.02, bodyY + H * 0.2], [cx - H * 0.06, bodyY + H * 0.08], [x0 + H * 0.02, bodyY + H * 0.14],
      ], 0.8)
      form(x, body, SOOT, { ...sootForm, rim: Math.max(1, H * 0.04), core: H * 0.12 })
      rimLight(x, body, emberLip, Math.max(1.2, H * 0.045))
      // neck and head: a long wedge of a skull, ears swept back
      const neck = P.blob([[x1 - H * 0.12, bodyY - H * 0.2], [x1 + H * 0.02, bodyY - H * 0.34], [hx - H * 0.02, hy - H * 0.08], [hx + H * 0.04, hy + H * 0.1], [x1 + H * 0.12, bodyY + H * 0.06]], 0.7)
      form(x, neck, SOOT, small)
      for (const o of [0, 0.07]) form(x, P.poly([[hx - H * (0.08 + o), hy - H * 0.06], [hx - H * (0.3 + o), hy - H * 0.26], [hx - H * (0.02 + o), hy - H * 0.1]]), shade(SOOT, -0.1 - o), small)
      const head = P.blob([[hx - H * 0.12, hy - H * 0.09], [hx + H * 0.04, hy - H * 0.13], [hx + H * 0.3, hy - H * 0.01], [hx + H * 0.28, hy + H * 0.04], [hx + H * 0.04, hy + H * 0.1], [hx - H * 0.1, hy + H * 0.08]], 0.6)
      form(x, head, SOOT, { ...small, core: H * 0.06 })
      rimLight(x, head, emberLip, 1.1)
      // the jaw hangs open on the fire inside
      form(x, P.poly([[hx + H * 0.02, hy + H * 0.06], [hx + H * 0.24, hy + H * 0.06], [hx + H * 0.2, hy + H * 0.13], [hx + H * 0.02, hy + H * 0.11]]), 0x221819, small)
      fill(x, P.poly([[hx + H * 0.04, hy + H * 0.055], [hx + H * 0.26, hy + H * 0.035], [hx + H * 0.22, hy + H * 0.075]]), mix(g, 0xfff0c0, 0.3))
      for (let i = 0; i < 3; i++) fill(x, P.poly([[hx + H * (0.1 + i * 0.05), hy + H * 0.04], [hx + H * (0.12 + i * 0.05), hy + H * 0.08], [hx + H * (0.14 + i * 0.05), hy + H * 0.04]]), 0xe8dcc0)
      // near legs
      form(x, hindLeg(x0 + H * 0.26), SOOT, small)
      rimLight(x, hindLeg(x0 + H * 0.26), emberLip, 1)
      form(x, foreLeg(x1 - H * 0.14), SOOT, small)
      rimLight(x, foreLeg(x1 - H * 0.14), emberLip, 1)
      for (const fx of [x1 - H * 0.2, x0 + H * 0.2 - H * 0.05, x1 - H * 0.14, x0 + H * 0.26 - H * 0.05]) form(x, paw(fx), 0x221819, small)
      // the mane: a ridge of soot spikes down the spine
      for (let i = 0; i < spine.length; i++) {
        const [sx, sy] = spine[i]
        const t = H * (0.1 + (i % 2) * 0.05)
        form(x, P.poly([[sx - H * 0.06, sy + H * 0.04], [sx - H * 0.1, sy - t], [sx + H * 0.05, sy + H * 0.03]]), 0x221819, small)
      }
      // fire under the hide
      crack(x, [[x0 + H * 0.1, bodyY - H * 0.02], [cx - H * 0.18, bodyY + H * 0.02], [cx - H * 0.02, bodyY - H * 0.08], [cx + H * 0.18, bodyY - H * 0.02]], g, Math.max(1, H * 0.035))
      crack(x, [[x1 - H * 0.06, bodyY - H * 0.14], [x1 + H * 0.04, bodyY - H * 0.02], [x1 - H * 0.02, bodyY + H * 0.1]], g, Math.max(0.9, H * 0.03))
      crack(x, [[x0 + H * 0.24, bodyY + H * 0.08], [x0 + H * 0.2, by - H * 0.22]], g, Math.max(0.8, H * 0.025))
    },
    over: x => {
      glow(x, hx + H * 0.06, hy - H * 0.04, H * 0.14, g, 0.75)
      fill(x, P.ellipse(hx + H * 0.06, hy - H * 0.04, H * 0.045, H * 0.03, -0.3), mix(g, 0xffffff, 0.3))
      fill(x, P.circle(hx + H * 0.065, hy - H * 0.045, H * 0.018), 0xfffbe8)
      glow(x, hx + H * 0.16, hy + H * 0.08, H * 0.12, g, 0.6)
      glow(x, x0 - H * 0.36, bodyY - H * 0.46, H * 0.12, g, 0.9)
      fill(x, P.circle(x0 - H * 0.36, bodyY - H * 0.46, H * 0.035), 0xffd24a)
      for (let i = 0; i < spine.length; i++) {
        const [sx, sy] = spine[i]
        const t = H * (0.1 + (i % 2) * 0.05)
        glow(x, sx - H * 0.09, sy - t + H * 0.02, H * 0.07, g, 0.85)
        fill(x, P.circle(sx - H * 0.095, sy - t + H * 0.02, H * 0.018), 0xffd88a)
      }
    },
    outline: Math.max(1.5, Math.min(3, H * 0.05)),
    grain: 0.14,
  })
}

function hordeOver(x: Ctx, cx: number, by: number, L: HordeLook, R: HordeRig) {
  const { H, k, handX, handY, shY, tw } = R
  if (L.build !== 'caller') emberEyes(x, R.ex, R.ey, R.gap, R.es, L.glow)
  else emberEyes(x, R.hx - R.r * 0.3, R.hy + R.r * 0.15, R.r * 0.6, R.es, L.glow)
  if (L.build === 'keg') {
    const fx = cx - tw * 0.78, fy = shY - H * 0.34
    glow(x, fx, fy, 8 * k, 0xffd24a, 0.95)
    fill(x, P.circle(fx, fy, 1.8 * k), 0xfffbe8)
    glow(x, handX, handY - 12 * k, 7 * k, 0xff9a3a, 0.95)
    fill(x, P.circle(handX, handY - 12 * k, 2.2 * k), 0xffd24a)
  }
  if (L.staff === 'brazier') {
    // the brazier's fire: three tongues over the coals, and the light they throw
    const fy = handY - 29.5 * k
    glow(x, handX, fy - 3 * k, 13 * k, 0xff8a2a, 0.9)
    for (const [o, t] of [[-3, 7], [0, 10], [3, 6.5]]) {
      fill(x, P.poly([[handX + (o - 2.2) * k, fy + 1 * k], [handX + o * 0.6 * k, fy - t * k], [handX + (o + 2.2) * k, fy + 1 * k]]), 0xff9a3a, 0.9)
    }
    fill(x, P.poly([[handX - 1.6 * k, fy + 1 * k], [handX, fy - 6 * k], [handX + 1.6 * k, fy + 1 * k]]), 0xffe8a0)
  } else if (L.build === 'caller' || L.build === 'regent') {
    const orbY = handY - 28 * k
    glow(x, handX, orbY, 10 * k, L.build === 'regent' ? 0xff8a2a : L.glow, 0.95)
    fill(x, P.circle(handX, orbY, 3.2 * k), mix(L.glow, 0xffffff, 0.55))
  }
  if (L.build === 'regent') {
    for (let i = 0; i < 7; i++) {
      const px = cx + (i - 3) * H * 0.08
      const py = by - H * (0.12 + (i % 3) * 0.17)
      glow(x, px, py, 2.8 * k, 0xffb04a, 0.85)
    }
  }
}

function bakeHorde(scene: Phaser.Scene, key: string, L: HordeLook) {
  const H = L.h
  const bulk = L.bulk ?? 1
  const w = Math.ceil(H * 1.55 * bulk + 30)
  const h = Math.ceil(H * 1.5 + FOOT + 14)
  const cx = w / 2 - H * 0.08, by = h - FOOT
  const R = hordeRig(cx, by, L)
  bake(scene, key, w, h, {
    body: x => paintHorde(x, cx, by, L, R),
    over: x => hordeOver(x, cx, by, L, R),
    outline: Math.max(1.5, Math.min(3.2, H * 0.05)),
    grain: 0.14,
  })
}

/** Chitters: a skittering knot of soot on six legs. */
function bakeSwarm(scene: Phaser.Scene, key: string, H: number, g: number) {
  const w = Math.ceil(H * 2 + 18), h = Math.ceil(H * 1.3 + FOOT + 8)
  const cx = w / 2, by = h - FOOT
  const k = H / 16
  bake(scene, key, w, h, {
    body: x => {
      for (const [lx, dir] of [[-5, -1], [-1, -1], [3, -1], [-3, 1], [1, 1], [5, 1]]) {
        line(x, x2 => {
          x2.moveTo(cx + lx * k, by - 5 * k)
          x2.quadraticCurveTo(cx + (lx + dir * 3) * k, by - 8 * k, cx + (lx + dir * 5) * k, by)
        }, 1.4 * k, 0x221819, 1)
      }
      const shell = P.blob([[cx - 9 * k, by - 3 * k], [cx - 8 * k, by - 11 * k], [cx + 2 * k, by - 14 * k], [cx + 10 * k, by - 9 * k], [cx + 9 * k, by - 2 * k]], 1)
      form(x, shell, SOOT, { ...sootForm, rim: 1, core: 2.6 })
      rimLight(x, shell, mix(g, SOOT, 0.35), 1.2)
      for (let i = 0; i < 3; i++) {
        const sx = cx - 6 * k + i * 4.5 * k
        form(x, P.poly([[sx - 1.6 * k, by - 11 * k + i * 0.6 * k], [sx + 0.6 * k, by - 16 * k + i * 0.8 * k], [sx + 2 * k, by - 11.5 * k + i * 0.6 * k]]), 0x221819, { ...sootForm, rim: 0.5, core: 0.8 })
      }
      crack(x, [[cx - 6 * k, by - 6 * k], [cx - 2 * k, by - 8 * k], [cx + 2 * k, by - 6 * k]], g, 0.9)
    },
    over: x => emberEyes(x, cx + 4 * k, by - 8 * k, 3.4 * k, 1.35 * k, g),
    outline: 1.4,
    grain: 0.12,
  })
}

/** The siege beast: a horned ram-thing hauling a spiked battering sledge. */
function bakeSiegeBeast(scene: Phaser.Scene, key: string, H: number, g: number) {
  const w = Math.ceil(H * 1.9 + 30), h = Math.ceil(H * 1.25 + FOOT + 14)
  const cx = w / 2, by = h - FOOT
  const k = H / 80
  let eyes = { x: 0, y: 0 }
  bake(scene, key, w, h, {
    body: x => {
      const big = { ...sootForm, rim: 2, core: 6, hatch: 0.18 }
      // legs, like pillars
      for (const lx of [-40, -22, 18, 36]) {
        form(x, P.round(cx + lx * k - 7 * k, by - 34 * k, 14 * k, 34 * k, 5 * k), lx % 2 === 0 ? SOOT : shade(SOOT, -0.15), big)
        form(x, P.round(cx + lx * k - 8 * k, by - 7 * k, 16 * k, 7 * k, 3 * k), 0x3a3230, { rim: 1, core: 2 })
      }
      // the sledge on its back
      form(x, P.round(cx - 42 * k, by - 86 * k, 70 * k, 22 * k, 4 * k), 0x5a3a24, { rim: 1.6, core: 4, hatch: 0.2 })
      for (let i = 0; i < 5; i++) {
        form(x, P.poly([[cx - 38 * k + i * 15 * k, by - 86 * k], [cx - 33 * k + i * 15 * k, by - 98 * k], [cx - 28 * k + i * 15 * k, by - 86 * k]]), 0x8a8074, { rim: 1, core: 1.6 })
      }
      // the body
      form(x, P.blob([[cx - 54 * k, by - 62 * k], [cx - 30 * k, by - 72 * k], [cx + 30 * k, by - 70 * k], [cx + 50 * k, by - 50 * k], [cx + 44 * k, by - 28 * k], [cx - 50 * k, by - 28 * k]], 0.9), SOOT, { ...big, core: 10 })
      crack(x, [[cx - 30 * k, by - 58 * k], [cx - 18 * k, by - 48 * k], [cx - 24 * k, by - 38 * k], [cx - 8 * k, by - 32 * k]], g, 2.2)
      crack(x, [[cx + 8 * k, by - 62 * k], [cx + 20 * k, by - 52 * k], [cx + 12 * k, by - 42 * k]], g, 1.8)
      // head, low and armoured
      form(x, P.blob([[cx + 38 * k, by - 62 * k], [cx + 64 * k, by - 58 * k], [cx + 70 * k, by - 38 * k], [cx + 56 * k, by - 26 * k], [cx + 36 * k, by - 34 * k]], 0.8), 0x3a302e, big)
      for (const s of [0, 1]) {
        form(x, x2 => {
          const ox = cx + (46 + s * 8) * k, oy = by - 58 * k
          x2.moveTo(ox, oy)
          x2.bezierCurveTo(ox - 16 * k, oy - 22 * k, ox + 18 * k, oy - 30 * k, ox + 22 * k, oy - 6 * k)
          x2.bezierCurveTo(ox + 12 * k, oy - 18 * k, ox + 2 * k, oy - 12 * k, ox + 6 * k, oy + 4 * k)
          x2.closePath()
        }, 0xd6c8ac, { rim: 1.2, core: 3 })
      }
      eyes = { x: cx + 58 * k, y: by - 46 * k }
    },
    over: x => emberEyes(x, eyes.x - 4 * k, eyes.y, 8 * k, 2.4 * k, g),
    outline: 3.2,
    grain: 0.14,
  })
}

// ---- rosters -----------------------------------------------------------------

const HERO_LOOKS: Look[] = [
  { h: 32, body: PAL.heroBody, band: PAL.bone, sigil: PAL.ember, weapon: 'sword', helm: 'hair', hair: 0x6a3a1e, skin: SKINS[0] },
  { h: 34, body: PAL.heroBody, band: PAL.bone, sigil: PAL.ember, weapon: 'sword', helm: 'nasal', shield: 'round', cape: 0x24407f, skin: SKINS[0] },
  { h: 36, body: 0x2a5098, band: PAL.bone, sigil: PAL.ember, weapon: 'axe', helm: 'winged', shield: 'heater', cape: 0x1f3a78, gilt: true, bulk: 1.08, skin: SKINS[0] },
  { h: 39, body: 0x244690, band: PAL.bone, sigil: PAL.ember, weapon: 'greataxe', helm: 'crowned', shield: 'heater', cape: 0x8a2438, plume: PAL.ember, gilt: true, bulk: 1.16, skin: SKINS[0], helmColour: 0xdad2c2 },
]

function soldierLook(key: string, colour: number, accent: number, scale: number): Look {
  const h = 28 * scale
  const base: Look = { h, body: colour, band: PAL.bone, sigil: accent, helm: 'kettle', weapon: 'sword' }
  switch (key) {
    case 'swordsman': return { ...base, shield: 'round', skin: SKINS[1] }
    case 'spearman': return { ...base, helm: 'nasal', weapon: 'spear', skin: SKINS[2] }
    case 'guard': return { ...base, helm: 'great', shield: 'tower', bulk: 1.25, helmColour: 0xb8c0ca, skin: SKINS[0] }
    case 'archer': return { ...base, helm: 'hood', helmColour: 0x3f6b3a, weapon: 'bow', quiver: true, band: undefined, skin: SKINS[3] }
    case 'crossbow': return { ...base, helm: 'kettle', weapon: 'crossbow', band: 0xe0d2a8, skin: SKINS[1] }
    case 'outrider': return { ...base, helm: 'nasal', weapon: 'spear', cape: 0x7d4520, skin: SKINS[2] }
    default: return base
  }
}

const WORKER_LOOKS: Record<string, (colour: number, accent: number) => Look> = {
  lumberjack: c => ({ h: 26, body: 0xa8402c, apron: undefined, band: undefined, helm: 'cap', helmColour: 0x3a5a2e, weapon: 'axe', skin: SKINS[1], legs: 0x5a4632, belt: c }),
  farmer: () => ({ h: 26, body: 0x7f9a44, helm: 'straw', weapon: 'scythe', skin: SKINS[2], legs: 0x6a5a3e, apron: 0xd8c898 }),
  fisher: () => ({ h: 26, body: 0x5a86a0, helm: 'hood', helmColour: 0x2e4a5a, weapon: 'spear', skin: SKINS[1], legs: 0x4a4436, apron: 0xc8b890 }),
  cutter: () => ({ h: 26, body: 0x8a8c8e, helm: 'cap', helmColour: 0x5a5e62, weapon: 'hammer', skin: SKINS[0], apron: 0x6e4a2e }),
  miner: () => ({ h: 26, body: 0x9a7248, helm: 'miner', weapon: 'pick', skin: SKINS[3], legs: 0x4a3a2a }),
  delver: () => ({ h: 26, body: 0x7a5aa8, helm: 'hood', helmColour: 0x4e3a78, weapon: 'chisel', skin: SKINS[1] }),
  builder: () => ({ h: 26, body: 0xd88a3a, helm: 'cap', helmColour: 0xe0b040, weapon: 'hammer', skin: SKINS[2], apron: 0x7a5232 }),
}

const HORDE: Record<string, Omit<HordeLook, 'h' | 'glow'>> = {
  grunt: { build: 'husk', hunch: 0.14 },
  runner: { build: 'runner', hunch: 0.26 },
  brute: { build: 'brute', bulk: 1.35, hunch: 0.12, kit: 0x4a3226 },
  archer: { build: 'slinger', hunch: 0.08, kit: 0x3a2c30 },
  shield: { build: 'bulwark', bulk: 1.1, hunch: 0.04 },
  bomber: { build: 'keg', hunch: 0.16, kit: 0x5a4030 },
  elite: { build: 'champion', bulk: 1.15, hunch: 0.04 },
  commander: { build: 'caller', bulk: 1.05, hunch: 0.02 },
  warlord: { build: 'warlord', bulk: 1.3, hunch: 0.04 },
  cinderRegent: { build: 'regent', bulk: 1.2, hunch: 0.0 },
  // S16
  bogWretch: { build: 'husk', bulk: 1.3, hunch: 0.24, kit: 0x3a4a2a, drip: 0x5e7a36 },
  ashPriest: { build: 'caller', bulk: 1.0, hunch: 0.1, robe: 0x747069, staff: 'brazier' },
}

export function buildUnitTextures(scene: Phaser.Scene) {
  HERO_LOOKS.forEach((look, i) => bakeFigure(scene, `hero${i}`, look, look.plume !== undefined ? 8 : 0))

  for (const def of Object.values(SOLDIERS)) {
    const look = soldierLook(def.key, def.colour, def.accent === 0x24486f ? PAL.ember : PAL.ember, def.scale)
    if (def.key === 'outrider') bakeOutrider(scene, `sol_${def.key}`, look)
    else bakeFigure(scene, `sol_${def.key}`, look, def.key === 'spearman' ? 14 : 0)
  }

  for (const def of Object.values(WORKERS)) {
    const make = WORKER_LOOKS[def.key]
    const look = make ? make(def.colour, def.accent) : { h: 26, body: def.colour, weapon: 'none' as const }
    bakeFigure(scene, `wrk_${def.key}`, look)
  }

  for (const def of Object.values(ENEMIES)) {
    if (def.structure) continue // camps are drawn as structures in props.ts
    const h = 28 * def.scale
    if (def.key === 'swarm') { bakeSwarm(scene, 'enm_swarm', h, def.colour); continue }
    if (def.key === 'siegeBeast') { bakeSiegeBeast(scene, 'enm_siegeBeast', h, def.colour); continue }
    if (def.key === 'thornling') { bakeThornling(scene, 'enm_thornling', h, def.colour); continue }
    if (def.key === 'cinderHound') { bakeHound(scene, 'enm_cinderHound', h, def.colour); continue }
    const spec = HORDE[def.key] ?? { build: 'husk' as const }
    bakeHorde(scene, `enm_${def.key}`, { ...spec, h, glow: def.colour })
  }
}
