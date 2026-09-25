import type Phaser from 'phaser'
import { bake, fill, form, glow, line, mix, P, rimLight, shade, type Ctx, type PathFn } from './ink'

/**
 * S17: the stronghold bosses. Each is a horde body (soot, lit from inside)
 * at 1.6–2× a walker, with one thing that names it at a glance: the knight's
 * gallows-banner, the matron's rooted thorn skirt, the overseer's mask and
 * whip, the warden's stepped shield. Facing right, feet 8 px off the bottom.
 */

const FOOT = 8
const sootForm = { light: 0x6e5a52, dark: 0x140c0e, rim: 1.4, core: 3 }

function eyes(x: Ctx, ex: number, ey: number, gap: number, s: number, c: number) {
  glow(x, ex + gap / 2, ey, s * 5, c, 0.55)
  for (const o of [0, gap]) {
    glow(x, ex + o, ey, s * 2.2, c, 0.9)
    fill(x, P.ellipse(ex + o, ey, s * 1.1, s * 0.75, -0.2), mix(c, 0xffffff, 0.25))
  }
}

/** Two armoured legs and their feet. */
function legs(x: Ctx, cx: number, by: number, k: number, hip: number, base: number, spread = 5) {
  for (const s of [-1, 1]) {
    const lx = cx + s * spread * k
    form(x, P.round(lx - 3.2 * k, hip, 6.4 * k, by - hip - 2 * k, 2 * k), shade(base, s < 0 ? -0.18 : 0), sootForm)
    form(x, P.round(lx - 3.6 * k + (s > 0 ? 1.5 * k : 0), by - 3.2 * k, 8 * k, 3.4 * k, 1.4 * k), shade(base, -0.3), sootForm)
  }
}

/** The Gallows Knight: black plate, a greatsword, and a gibbet on its back flying a rag of banner with the noose. */
function bakeKnight(scene: Phaser.Scene, key: string, H: number, g: number) {
  const k = H / 32
  const w = Math.ceil(H * 1.7 + 30), h = Math.ceil(H * 1.85 + FOOT + 12)
  const cx = w / 2 - 4 * k, by = h - FOOT
  const PLATE = 0x3a3440, STEEL = 0xb8c4d0, ROPE = 0x9a7a4a, RAG = 0x5a1a1c
  const hip = by - 15 * k, sh = by - 31 * k
  const poleX = cx - 8 * k, poleTop = by - 56 * k, armEnd = cx - 26 * k
  bake(scene, key, w, h, {
    body: x => {
      // the gibbet: pole, crossbar reaching back, a brace, the rag banner and the noose
      form(x, P.rect(poleX - 1.6 * k, poleTop, 3.2 * k, by - 12 * k - poleTop), 0x4a3424, { rim: 0.8, core: 1.2 })
      form(x, P.rect(armEnd, poleTop - 1.2 * k, poleX - armEnd + 1.6 * k, 3 * k), 0x4a3424, { rim: 0.8, core: 1.2 })
      line(x, x2 => { x2.moveTo(poleX, poleTop + 8 * k); x2.lineTo(poleX - 7 * k, poleTop + 1.5 * k) }, 1.6 * k, 0x3a281a, 1)
      const rag: PathFn = x2 => {
        x2.moveTo(poleX - 1.5 * k, poleTop + 3 * k)
        x2.lineTo(armEnd + 8 * k, poleTop + 2 * k)
        x2.lineTo(armEnd + 7 * k, poleTop + 16 * k)
        x2.lineTo(armEnd + 10 * k, poleTop + 13 * k)
        x2.lineTo(armEnd + 12 * k, poleTop + 19 * k)
        x2.lineTo(armEnd + 15 * k, poleTop + 14 * k)
        x2.lineTo(poleX - 1.5 * k, poleTop + 17 * k)
        x2.closePath()
      }
      form(x, rag, RAG, { rim: 1, core: 2, hatch: 0.25 })
      line(x, x2 => { x2.moveTo(armEnd + 2 * k, poleTop + 1 * k); x2.lineTo(armEnd + 2 * k, poleTop + 12 * k) }, 1.1 * k, ROPE, 1)
      line(x, P.ellipse(armEnd + 2 * k, poleTop + 15 * k, 2.4 * k, 3.2 * k), 1.1 * k, ROPE, 1)
      // legs, a torn tabard, the cuirass and pauldrons
      legs(x, cx, by, k, hip - 2 * k, PLATE)
      const tabard: PathFn = x2 => {
        x2.moveTo(cx - 8 * k, hip - 2 * k); x2.lineTo(cx + 8 * k, hip - 2 * k)
        x2.lineTo(cx + 6 * k, by - 6 * k); x2.lineTo(cx + 3 * k, by - 9 * k); x2.lineTo(cx, by - 5 * k)
        x2.lineTo(cx - 3 * k, by - 9 * k); x2.lineTo(cx - 6 * k, by - 6 * k); x2.closePath()
      }
      form(x, tabard, RAG, { rim: 0.8, core: 1.6 })
      const chest = P.blob([[cx - 11 * k, sh], [cx + 11 * k, sh - 1 * k], [cx + 9 * k, hip], [cx - 9 * k, hip]], 0.5)
      form(x, chest, PLATE, sootForm)
      rimLight(x, chest, STEEL, 1.4 * k)
      line(x, x2 => { x2.moveTo(cx, sh + 2 * k); x2.lineTo(cx + 1 * k, hip - 1 * k) }, 1 * k, shade(PLATE, -0.4), 0.8)
      for (const s of [-1, 1]) form(x, P.ellipse(cx + s * 10 * k, sh + 1 * k, 6 * k, 4.6 * k), shade(PLATE, 0.08), sootForm)
      // the great helm, a slit for the eyes
      const helm = P.round(cx - 2 * k, sh - 13 * k, 12 * k, 13 * k, 3.5 * k)
      form(x, helm, PLATE, sootForm)
      rimLight(x, helm, STEEL, 1.2 * k)
      fill(x, P.rect(cx + 1 * k, sh - 8.5 * k, 9 * k, 2 * k), 0x0a0608)
      // the greatsword, raised to cleave
      const hx = cx + 12 * k, hy = sh + 8 * k
      line(x, x2 => { x2.moveTo(hx - 2 * k, hy + 3 * k); x2.lineTo(hx + 1 * k, hy - 1 * k) }, 2.6 * k, 0x3a281a, 1)
      line(x, x2 => { x2.moveTo(hx - 3 * k, hy - 4 * k); x2.lineTo(hx + 5 * k, hy + 2 * k) }, 2 * k, STEEL, 1)
      const blade: PathFn = x2 => {
        x2.moveTo(hx, hy - 1 * k); x2.lineTo(hx + 17 * k, hy - 27 * k); x2.lineTo(hx + 17.5 * k, hy - 30 * k)
        x2.lineTo(hx + 14.5 * k, hy - 27.5 * k); x2.lineTo(hx - 2 * k, hy - 3 * k); x2.closePath()
      }
      form(x, blade, STEEL, { rim: 1, core: 1.6, light: 0xf0f4f8, dark: 0x6a7480 })
      form(x, P.ellipse(hx, hy + 1 * k, 3.4 * k, 3 * k), PLATE, sootForm)
    },
    over: x => {
      eyes(x, cx + 3.4 * k, sh - 7.5 * k, 3.6 * k, 1.2 * k, g === 0xb8c8d8 ? 0x8ad8ff : g)
      glow(x, cx, sh + 6 * k, 5 * k, 0x8ad8ff, 0.25)
    },
    outline: Math.max(1.8, Math.min(3.2, H * 0.05)),
    grain: 0.14,
  })
}

/** The Thornmother: a matron whose skirt is a bramble rooted in the ground, with a crown of thorned branches. */
function bakeMatron(scene: Phaser.Scene, key: string, H: number, g: number) {
  const k = H / 32
  const w = Math.ceil(H * 2.1 + 20), h = Math.ceil(H * 1.95 + FOOT + 10)
  const cx = w / 2, by = h - FOOT
  const BARK = 0x3e2c1e, DARK = 0x21160e, THORN = 0xd6c490, LEAF = 0x6a8a3a
  const waist = by - 20 * k, sh = by - 33 * k
  bake(scene, key, w, h, {
    body: x => {
      // roots running out along the ground
      for (const [dx, len, up] of [[-1, 22, 2], [-0.6, 26, 0.5], [0.7, 24, 1.5], [1, 20, 0.2]]) {
        line(x, x2 => {
          x2.moveTo(cx + dx * 9 * k, by - 2 * k)
          x2.quadraticCurveTo(cx + dx * (9 + len / 2) * k, by - up * k, cx + dx * (9 + len) * k, by + 0.5 * k)
        }, 2.2 * k, DARK, 1)
      }
      // the bramble skirt, a bell of knotted wood, thorns along its hem
      const skirt = P.blob([[cx - 5 * k, waist], [cx + 5 * k, waist], [cx + 17 * k, by - 1 * k], [cx - 17 * k, by - 1 * k]], 0.6)
      form(x, skirt, BARK, { rim: 1.2, core: 3, hatch: 0.3, light: 0x70543a, dark: DARK })
      rimLight(x, skirt, mix(g, BARK, 0.5), 1.2 * k)
      for (let i = 0; i < 9; i++) {
        const t = i / 8, bx = cx - 15 * k + t * 30 * k, byy = by - 2 * k - Math.sin(t * Math.PI) * 1.5 * k
        fill(x, P.poly([[bx - 1 * k, byy], [bx + (i % 2 ? 1 : -1) * 2 * k, byy - 4 * k], [bx + 1 * k, byy]]), THORN)
      }
      for (const [a, b] of [[[-10, 2], [6, 12]], [[8, 3], [-4, 14]], [[-3, 6], [12, 17]]]) {
        line(x, x2 => { x2.moveTo(cx + a[0] * k, waist + a[1] * k); x2.quadraticCurveTo(cx, waist + 9 * k, cx + b[0] * k, waist + b[1] * k) }, 1.2 * k, DARK, 0.9)
      }
      // a thin trunk of a body
      const torso = P.blob([[cx - 6 * k, sh], [cx + 6 * k, sh], [cx + 4 * k, waist + 1 * k], [cx - 4 * k, waist + 1 * k]], 0.5)
      form(x, torso, BARK, { rim: 1, core: 2.2, light: 0x70543a, dark: DARK })
      // long arms, clawed with thorns: one reaching forward, one hanging back
      line(x, x2 => { x2.moveTo(cx + 5 * k, sh + 1 * k); x2.quadraticCurveTo(cx + 15 * k, sh + 3 * k, cx + 19 * k, sh + 13 * k) }, 2.4 * k, BARK, 1)
      line(x, x2 => { x2.moveTo(cx - 5 * k, sh + 1 * k); x2.quadraticCurveTo(cx - 13 * k, sh + 6 * k, cx - 14 * k, sh + 16 * k) }, 2.2 * k, shade(BARK, -0.2), 1)
      for (const [ox, oy, s] of [[19, 13, 1], [-14, 16, -1]]) {
        for (const d of [-1, 0, 1]) {
          fill(x, P.poly([[cx + ox * k - 1 * k, sh + oy * k], [cx + (ox + s * 2 + d) * k, sh + (oy + 4) * k], [cx + ox * k + 1 * k, sh + oy * k]]), THORN)
        }
      }
      // the head, and its crown of branches
      const head = P.ellipse(cx + 1 * k, sh - 5 * k, 4.4 * k, 5.4 * k)
      form(x, head, BARK, { rim: 1, core: 2, light: 0x70543a, dark: DARK })
      for (const [ax, ay, bx2, by2] of [[-2, -9, -9, -22], [0, -10, -2, -25], [2, -10, 7, -23], [3, -8, 11, -16], [-3, -7, -11, -13]]) {
        line(x, x2 => { x2.moveTo(cx + ax * k, sh + ay * k); x2.quadraticCurveTo(cx + (ax + bx2) / 2 * k, sh + (ay + by2) / 2 * k - 1 * k, cx + bx2 * k, sh + by2 * k) }, 1.5 * k, BARK, 1)
        fill(x, P.poly([[cx + bx2 * k - 0.8 * k, sh + by2 * k + 1 * k], [cx + bx2 * k, sh + by2 * k - 2.5 * k], [cx + bx2 * k + 0.8 * k, sh + by2 * k + 1 * k]]), THORN)
      }
      for (const [lx, ly, r] of [[-8, -18, -0.6], [6, -20, 0.5], [12, 2, 0.3]]) form(x, P.ellipse(cx + lx * k, sh + ly * k, 2.6 * k, 1.3 * k, r), LEAF, { rim: 0.6, core: 0.8 })
    },
    over: x => {
      eyes(x, cx + 1.4 * k, sh - 5.4 * k, 3 * k, 1.1 * k, g)
      glow(x, cx, sh + 7 * k, 5 * k, g, 0.5) // a sour heart showing through the bark
    },
    outline: Math.max(1.8, Math.min(3.2, H * 0.05)),
    grain: 0.14,
  })
}

/** The Seam Overseer: a broad driver in a leather coat, an iron mask for a face, a lamp at the belt and the whip out. */
function bakeOverseer(scene: Phaser.Scene, key: string, H: number, g: number) {
  const k = H / 32
  const w = Math.ceil(H * 2 + 30), h = Math.ceil(H * 1.55 + FOOT + 12)
  const cx = w / 2 - 12 * k, by = h - FOOT
  const COAT = 0x4e3424, APRON = 0x2e2420, MASK = 0xc8c0b0, CHAIN = 0x8a8a8a
  const hip = by - 13 * k, sh = by - 28 * k
  bake(scene, key, w, h, {
    body: x => {
      legs(x, cx, by, k, hip - 1 * k, 0x3a2a22, 5.5)
      // the coat: broad at the shoulders, open over a heavy apron
      const coat = P.blob([[cx - 14 * k, sh - 1 * k], [cx + 12 * k, sh - 2 * k], [cx + 11 * k, by - 7 * k], [cx - 13 * k, by - 6 * k]], 0.55)
      form(x, coat, COAT, sootForm)
      rimLight(x, coat, mix(g, COAT, 0.4), 1.4 * k)
      form(x, P.round(cx - 3 * k, sh + 4 * k, 10 * k, by - 8 * k - sh - 4 * k, 2 * k), APRON, sootForm)
      form(x, P.rect(cx - 13 * k, hip - 2 * k, 25 * k, 2.6 * k), 0x2a1a12, { rim: 0.6, core: 0.8 })
      // chains over the shoulder
      for (let i = 0; i < 6; i++) line(x, P.ellipse(cx - 9 * k + i * 3 * k, sh + 1 * k + i * 2 * k, 1.5 * k, 1 * k, 0.6), 0.9 * k, CHAIN, 1)
      // the hood and the iron mask
      form(x, P.ellipse(cx + 1 * k, sh - 5 * k, 8 * k, 7.5 * k), shade(COAT, -0.2), sootForm)
      const mask = P.blob([[cx + 1 * k, sh - 11 * k], [cx + 8 * k, sh - 10 * k], [cx + 9 * k, sh - 2 * k], [cx + 3 * k, sh + 1 * k], [cx - 1 * k, sh - 4 * k]], 0.7)
      form(x, mask, MASK, { rim: 1, core: 1.8, light: 0xf0ece0, dark: 0x6a6258 })
      fill(x, P.rect(cx + 2.5 * k, sh - 7.2 * k, 6 * k, 1.4 * k), 0x0a0608)
      for (const r of [0, 1, 2]) fill(x, P.circle(cx + 3 * k + r * 2 * k, sh - 1.8 * k, 0.45 * k), 0x3a342e)
      // the whip arm raised back, the handle, and the lash thrown forward in a long S to the ground
      const hx = cx + 10 * k, hy = sh - 6 * k
      line(x, x2 => { x2.moveTo(cx + 8 * k, sh + 2 * k); x2.quadraticCurveTo(cx + 12 * k, sh, hx, hy) }, 3.6 * k, COAT, 1)
      form(x, P.circle(hx, hy, 2.4 * k), 0x8a6a4a, { rim: 0.6, core: 0.8 })
      line(x, x2 => { x2.moveTo(hx - 1 * k, hy + 2 * k); x2.lineTo(hx + 3 * k, hy - 5 * k) }, 2 * k, 0x3a281a, 1)
      line(x, x2 => {
        x2.moveTo(hx + 3 * k, hy - 5 * k)
        x2.bezierCurveTo(hx + 16 * k, hy - 14 * k, hx + 22 * k, hy + 2 * k, hx + 16 * k, hy + 12 * k)
        x2.bezierCurveTo(hx + 11 * k, hy + 20 * k, hx + 24 * k, hy + 26 * k, hx + 30 * k, by - 1 * k)
      }, 1.3 * k, 0x2a1a12, 1)
    },
    over: x => {
      eyes(x, cx + 3.6 * k, sh - 6.5 * k, 3 * k, 0.9 * k, g)
      // the lamp at the belt
      glow(x, cx - 9 * k, hip + 2 * k, 6 * k, g, 0.7)
      fill(x, P.round(cx - 10.5 * k, hip - 0.5 * k, 3 * k, 4.2 * k, 0.8 * k), mix(g, 0xfff0c0, 0.5))
    },
    outline: Math.max(1.8, Math.min(3.2, H * 0.05)),
    grain: 0.14,
  })
}

/** The Stairwarden: heavy blue-steel plate behind a tower shield whose top is cut in steps, a crested helm, a glaive. */
function bakeWarden(scene: Phaser.Scene, key: string, H: number, g: number) {
  const k = H / 32
  const w = Math.ceil(H * 1.6 + 30), h = Math.ceil(H * 2.05 + FOOT + 12)
  const cx = w / 2 - 5 * k, by = h - FOOT
  const PLATE = 0x4a5a70, STEEL = 0xc8d4e2, SHIELD = 0x34405a, GILT = 0xc9a24a
  const hip = by - 15 * k, sh = by - 31 * k
  bake(scene, key, w, h, {
    body: x => {
      // the glaive, upright behind the shield
      const gx = cx + 3 * k
      line(x, x2 => { x2.moveTo(gx, by - 2 * k); x2.lineTo(gx, by - 58 * k) }, 2 * k, 0x3a281a, 1)
      const head: PathFn = x2 => { x2.moveTo(gx - 1 * k, by - 52 * k); x2.quadraticCurveTo(gx + 7 * k, by - 58 * k, gx + 1 * k, by - 66 * k); x2.lineTo(gx - 1.2 * k, by - 57 * k); x2.closePath() }
      form(x, head, STEEL, { rim: 0.8, core: 1.2, light: 0xf0f4f8, dark: 0x6a7480 })
      legs(x, cx, by, k, hip - 2 * k, PLATE, 5.5)
      const chest = P.blob([[cx - 12 * k, sh], [cx + 11 * k, sh - 1 * k], [cx + 9 * k, hip + 1 * k], [cx - 10 * k, hip + 1 * k]], 0.5)
      form(x, chest, PLATE, sootForm)
      rimLight(x, chest, STEEL, 1.4 * k)
      for (const s of [-1, 1]) form(x, P.ellipse(cx + s * 10.5 * k, sh + 1 * k, 6.4 * k, 5 * k), shade(PLATE, 0.1), sootForm)
      // the crested helm
      const helm = P.round(cx - 5 * k, sh - 14 * k, 12 * k, 13 * k, 4 * k)
      form(x, helm, PLATE, sootForm)
      rimLight(x, helm, STEEL, 1.2 * k)
      fill(x, P.rect(cx - 1 * k, sh - 9 * k, 8 * k, 1.8 * k), 0x0a0608)
      const crest: PathFn = x2 => { x2.moveTo(cx - 5 * k, sh - 12 * k); x2.quadraticCurveTo(cx - 3 * k, sh - 22 * k, cx + 5 * k, sh - 19 * k); x2.quadraticCurveTo(cx - 1 * k, sh - 17 * k, cx + 2 * k, sh - 13 * k); x2.closePath() }
      form(x, crest, 0x8a2a1c, { rim: 0.8, core: 1.4 })
      // the stair-shield: tall, its top edge cut in four steps
      const sx = cx + 7 * k, sw = 15 * k, top = by - 42 * k, bot = by - 3 * k, st = sw / 4
      const shield: PathFn = x2 => {
        x2.moveTo(sx, bot)
        x2.lineTo(sx, top + 9 * k)
        for (let i = 0; i < 4; i++) { x2.lineTo(sx + i * st, top + (9 - i * 3) * k); x2.lineTo(sx + (i + 1) * st, top + (9 - i * 3) * k) }
        x2.lineTo(sx + sw, bot - 3 * k)
        x2.quadraticCurveTo(sx + sw * 0.5, bot + 2 * k, sx, bot)
        x2.closePath()
      }
      form(x, shield, SHIELD, { rim: 1.4, core: 3, light: 0x6a7a98, dark: 0x141a28 })
      rimLight(x, shield, STEEL, 1.4 * k)
      // a gilt stair embossed on its face
      const ex = sx + 3 * k, ey = by - 14 * k, es = 2.6 * k
      const emblem: PathFn = x2 => {
        x2.moveTo(ex, ey)
        for (let i = 0; i < 3; i++) { x2.lineTo(ex + i * es, ey - (i + 1) * es); x2.lineTo(ex + (i + 1) * es, ey - (i + 1) * es) }
        x2.lineTo(ex + 3 * es, ey); x2.closePath()
      }
      form(x, emblem, GILT, { rim: 0.6, core: 0.8, light: 0xf0d890, dark: 0x6a5020 })
      line(x, x2 => { x2.moveTo(sx + 1 * k, bot - 7 * k); x2.lineTo(sx + sw - 1 * k, bot - 9 * k) }, 1 * k, shade(SHIELD, -0.4), 0.7)
    },
    over: x => {
      eyes(x, cx + 0.6 * k, sh - 8.2 * k, 3.4 * k, 1.1 * k, g === 0x8ab0d8 ? 0xff9a44 : g)
    },
    outline: Math.max(1.8, Math.min(3.2, H * 0.05)),
    grain: 0.14,
  })
}

/** The boss keys drawn here, instead of by the horde rig in units.ts. */
export const BOSS_PAINTERS: Record<string, (scene: Phaser.Scene, key: string, H: number, g: number) => void> = {
  gallowsKnight: bakeKnight,
  thornmother: bakeMatron,
  seamOverseer: bakeOverseer,
  stairwarden: bakeWarden,
}
