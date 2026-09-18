import { Pen, shade } from './draw'
import { PAL } from '../config/palette'
import { ENEMIES } from '../config/enemies'
import { SOLDIERS } from '../config/units'
import { WORKERS } from '../config/units'

export interface UnitLook {
  body: number
  accent: number
  skin?: number
  /** overall pixel height of the character */
  h?: number
  weapon?: 'sword' | 'spear' | 'bow' | 'crossbow' | 'axe' | 'club' | 'staff' | 'none' | 'hammer' | 'pick' | 'scythe' | 'torch'
  shield?: boolean
  helmet?: boolean
  cape?: number
  horns?: boolean
  /** extra bulk multiplier on the torso */
  bulk?: number
  eyes?: number
  banner?: number
}

/**
 * One humanoid recipe drives every character in the game. Silhouette is varied
 * through bulk, helmet, horns and weapon so factions read instantly at a glance.
 */
export function drawUnit(p: Pen, key: string, look: UnitLook) {
  const H = look.h ?? 30
  const W = Math.round(H * 0.80 * (look.bulk ?? 1))
  const PADX = 16, PADY = 8
  const texW = W + PADX * 2
  const texH = H + PADY * 2
  const cx = texW / 2
  const baseY = texH - PADY

  const body = look.body
  const dark = shade(body, -0.42)
  const light = shade(body, 0.22)
  const skin = look.skin ?? PAL.heroSkin
  const bulk = look.bulk ?? 1

  const headR = H * 0.20
  const torsoH = H * 0.44
  const torsoW = W * 0.78
  const torsoY = baseY - H * 0.62
  const headY = torsoY - headR * 0.72

  // cape behind everything
  if (look.cape !== undefined) {
    p.fill(shade(look.cape, -0.18))
      .poly([
        [cx - torsoW * 0.62, torsoY + 2],
        [cx + torsoW * 0.62, torsoY + 2],
        [cx + torsoW * 0.44, baseY - 1],
        [cx - torsoW * 0.44, baseY - 1],
      ])
  }

  // legs
  p.fill(dark)
    .rect(cx - torsoW * 0.36, baseY - H * 0.2, torsoW * 0.28, H * 0.2, 2)
    .rect(cx + torsoW * 0.08, baseY - H * 0.2, torsoW * 0.28, H * 0.2, 2)

  // boots
  p.fill(shade(dark, -0.25))
    .rect(cx - torsoW * 0.40, baseY - H * 0.06, torsoW * 0.34, H * 0.06, 2)
    .rect(cx + torsoW * 0.06, baseY - H * 0.06, torsoW * 0.34, H * 0.06, 2)

  // torso
  p.fill(body).rect(cx - torsoW / 2, torsoY, torsoW, torsoH, Math.max(2, H * 0.10))
  p.fill(light).rect(cx - torsoW / 2, torsoY, torsoW, torsoH * 0.44, Math.max(2, H * 0.10))
  // belt + accent stripe
  p.fill(look.accent).rect(cx - torsoW / 2, torsoY + torsoH * 0.62, torsoW, torsoH * 0.18)
  // shoulders
  p.fill(shade(look.accent, 0.12))
    .circle(cx - torsoW * 0.5, torsoY + torsoH * 0.16, H * 0.095 * bulk)
    .circle(cx + torsoW * 0.5, torsoY + torsoH * 0.16, H * 0.095 * bulk)

  // head
  p.fill(shade(skin, -0.3)).circle(cx, headY + 1, headR)
  p.fill(skin).circle(cx, headY, headR)

  if (look.helmet) {
    p.fill(look.accent)
      .poly([
        [cx - headR * 1.08, headY + headR * 0.18],
        [cx - headR * 0.92, headY - headR * 0.78],
        [cx + headR * 0.92, headY - headR * 0.78],
        [cx + headR * 1.08, headY + headR * 0.18],
      ])
    p.fill(shade(look.accent, 0.3)).rect(cx - headR * 1.02, headY - headR * 0.34, headR * 2.04, headR * 0.26)
  }

  if (look.horns) {
    p.fill(shade(0xf0e2c8, -0.1))
      .tri(cx - headR * 0.95, headY - headR * 0.35, cx - headR * 1.85, headY - headR * 1.25, cx - headR * 0.75, headY - headR * 0.95)
      .tri(cx + headR * 0.95, headY - headR * 0.35, cx + headR * 1.85, headY - headR * 1.25, cx + headR * 0.75, headY - headR * 0.95)
  }

  // eyes — the single detail that makes them feel alive at small size
  const eyeC = look.eyes ?? 0x1b2430
  p.fill(eyeC)
    .circle(cx - headR * 0.36, headY + headR * 0.06, Math.max(1, headR * 0.15))
    .circle(cx + headR * 0.36, headY + headR * 0.06, Math.max(1, headR * 0.15))

  // weapon in the right hand
  const wx = cx + torsoW * 0.62
  const wy = torsoY + torsoH * 0.3
  const steel = 0xd8dfe8
  switch (look.weapon) {
    case 'sword':
      p.fill(0x6b4a2a).rect(wx - 2, wy + H * 0.1, 4, H * 0.12, 1)
      p.fill(steel).poly([[wx - 3, wy + H * 0.1], [wx + 3, wy + H * 0.1], [wx + 2, wy - H * 0.26], [wx, wy - H * 0.33], [wx - 2, wy - H * 0.26]])
      p.fill(look.accent).rect(wx - 5, wy + H * 0.07, 10, 3, 1)
      break
    case 'axe':
      p.fill(0x6b4a2a).rect(wx - 2, wy - H * 0.2, 4, H * 0.42, 1)
      p.fill(steel).poly([[wx + 1, wy - H * 0.22], [wx + H * 0.28, wy - H * 0.30], [wx + H * 0.3, wy - H * 0.02], [wx + 1, wy - H * 0.06]])
      break
    case 'club':
      p.fill(0x6b4a2a).rect(wx - 2.5, wy - H * 0.1, 5, H * 0.4, 2)
      p.fill(shade(0x6b4a2a, 0.15)).circle(wx, wy - H * 0.18, H * 0.13)
      p.fill(0x4a3320).circle(wx - H * 0.06, wy - H * 0.22, 1.6).circle(wx + H * 0.07, wy - H * 0.15, 1.6)
      break
    case 'hammer':
      p.fill(0x6b4a2a).rect(wx - 2.5, wy - H * 0.12, 5, H * 0.44, 2)
      p.fill(0x9aa4ad).rect(wx - H * 0.16, wy - H * 0.26, H * 0.32, H * 0.16, 2)
      break
    case 'pick':
      p.fill(0x6b4a2a).rect(wx - 2, wy - H * 0.14, 4, H * 0.44, 1)
      p.fill(0x9aa4ad).poly([[wx - H * 0.22, wy - H * 0.26], [wx + H * 0.22, wy - H * 0.26], [wx, wy - H * 0.14]])
      break
    case 'scythe':
      p.fill(0x6b4a2a).rect(wx - 2, wy - H * 0.2, 4, H * 0.5, 1)
      p.fill(steel).poly([[wx, wy - H * 0.2], [wx + H * 0.3, wy - H * 0.34], [wx + H * 0.22, wy - H * 0.16]])
      break
    case 'spear':
      p.fill(0x7d5433).rect(wx - 2, wy - H * 0.42, 4, H * 0.8, 1)
      p.fill(steel).tri(wx - 4.5, wy - H * 0.38, wx + 4.5, wy - H * 0.38, wx, wy - H * 0.60)
      break
    case 'bow':
      p.line(2.6, 0x8a5f33).ring(wx + 2, wy, H * 0.26)
      p.fill(0x121b28).rect(wx + 1, wy - H * 0.26, 1.4, H * 0.52)
      break
    case 'crossbow':
      p.fill(0x6b4a2a).rect(wx - H * 0.05, wy - H * 0.04, H * 0.30, 4, 1)
      p.fill(0x4a3320).rect(wx + H * 0.12, wy - H * 0.16, 3.5, H * 0.26, 1)
      break
    case 'staff':
      p.fill(0x6b4a2a).rect(wx - 2, wy - H * 0.36, 4, H * 0.74, 1)
      p.fill(look.accent, 0.95).circle(wx, wy - H * 0.42, H * 0.11)
      break
    case 'torch':
      p.fill(0x6b4a2a).rect(wx - 2, wy - H * 0.1, 4, H * 0.38, 1)
      p.fill(0xff9840).circle(wx, wy - H * 0.18, H * 0.1)
      p.fill(0xffd24a).circle(wx, wy - H * 0.21, H * 0.055)
      break
  }

  if (look.shield) {
    const sx = cx - torsoW * 0.66
    p.fill(shade(look.accent, -0.2)).poly([
      [sx - H * 0.15, torsoY + torsoH * 0.04],
      [sx + H * 0.15, torsoY + torsoH * 0.04],
      [sx + H * 0.15, torsoY + torsoH * 0.52],
      [sx, torsoY + torsoH * 0.72],
      [sx - H * 0.15, torsoY + torsoH * 0.52],
    ])
    p.fill(shade(look.accent, 0.3)).circle(sx, torsoY + torsoH * 0.34, H * 0.06)
  }

  if (look.banner !== undefined) {
    p.fill(0x6b4a2a).rect(cx - torsoW * 0.78, torsoY - H * 0.5, 3, H * 0.9, 1)
    p.fill(look.banner).poly([
      [cx - torsoW * 0.78, torsoY - H * 0.48],
      [cx - torsoW * 0.78 - H * 0.26, torsoY - H * 0.40],
      [cx - torsoW * 0.78 - H * 0.26, torsoY - H * 0.10],
      [cx - torsoW * 0.78, torsoY - H * 0.16],
    ])
  }

  p.bake(key, texW, texH)
  return { w: texW, h: texH, baseOffset: PADY }
}

const HERO_TIER_LOOKS: UnitLook[] = [
  { body: PAL.heroBody, accent: 0x2a4d96, h: 32, weapon: 'sword', helmet: false, skin: PAL.heroSkin },
  { body: PAL.heroBody, accent: PAL.heroTrim, h: 34, weapon: 'sword', helmet: true, shield: true, skin: PAL.heroSkin },
  { body: 0x3559b8, accent: PAL.gold, h: 36, weapon: 'axe', helmet: true, shield: true, cape: 0x24407f, bulk: 1.1 },
  { body: 0x2c49a8, accent: 0xffe27a, h: 39, weapon: 'axe', helmet: true, shield: true, cape: 0x8a2f4f, bulk: 1.2, horns: true },
]

const ENEMY_WEAPON: Record<string, UnitLook['weapon']> = {
  grunt: 'club', runner: 'none', brute: 'hammer', archer: 'bow', shield: 'sword',
  bomber: 'torch', swarm: 'none', elite: 'axe', commander: 'staff',
  siegeBeast: 'none', warlord: 'axe',
}

const WORKER_WEAPON: Record<string, UnitLook['weapon']> = {
  lumberjack: 'axe', farmer: 'scythe', cutter: 'hammer', miner: 'pick', porter: 'none', builder: 'hammer',
}

export function buildUnitTextures(p: Pen) {
  HERO_TIER_LOOKS.forEach((look, i) => drawUnit(p, `hero${i}`, look))

  for (const def of Object.values(SOLDIERS)) {
    drawUnit(p, `sol_${def.key}`, {
      body: def.colour, accent: def.accent, h: 28 * def.scale,
      weapon: def.key === 'archer' ? 'bow' : def.key === 'crossbow' ? 'crossbow'
        : def.key === 'spearman' ? 'spear' : 'sword',
      helmet: true,
      shield: def.key === 'guard' || def.key === 'swordsman',
      bulk: def.key === 'guard' ? 1.25 : 1,
      cape: def.key === 'outrider' ? 0x7d4520 : undefined,
    })
  }

  for (const def of Object.values(WORKERS)) {
    drawUnit(p, `wrk_${def.key}`, {
      body: def.colour, accent: def.accent, h: 26,
      weapon: WORKER_WEAPON[def.key] ?? 'none', helmet: false,
    })
  }

  for (const def of Object.values(ENEMIES)) {
    if (def.structure) continue // camps are drawn as structures in props.ts
    drawUnit(p, `enm_${def.key}`, {
      body: def.colour, accent: def.accent,
      h: 28 * def.scale,
      skin: shade(def.colour, -0.5),
      eyes: def.boss || def.elite ? 0xffe27a : 0xffd8c8,
      weapon: ENEMY_WEAPON[def.key] ?? 'club',
      helmet: def.key === 'shield' || def.key === 'elite' || def.key === 'warlord',
      shield: def.key === 'shield' || def.key === 'warlord',
      horns: def.key === 'brute' || def.key === 'elite' || def.key === 'warlord' || def.key === 'siegeBeast',
      bulk: def.boss ? 1.45 : def.elite ? 1.2 : def.key === 'brute' ? 1.3 : 1,
      cape: def.key === 'commander' ? 0x36246e : def.key === 'warlord' ? 0x4a0f18 : undefined,
      banner: def.key === 'commander' ? 0x8f6fe0 : undefined,
    })
  }
}
