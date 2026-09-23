import type Phaser from 'phaser'
import { bake, fill, form, line, mix, P, Rng, INK, type Ctx } from './ink'
import { boulder, groundShadow, pine, trunk } from './props'

/**
 * Scatter props (S07): things standing on the ground that are not nodes and
 * cannot be harvested, so each region reads at a glance. Keys start `sc_`;
 * src/world/scatter.ts decides where they stand. Feet 8 px above the bottom
 * of the canvas, as for every world prop.
 */

const FOOT = 8

/** A bare tree: a trunk and forking limbs. */
function deadTree(x: Ctx, cx: number, by: number, c: number, r: Rng) {
  trunk(x, cx, by, 6, 30, c)
  const limb = (x0: number, y0: number, a: number, len: number, w: number, depth: number) => {
    const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len
    line(x, x2 => { x2.moveTo(x0, y0); x2.quadraticCurveTo((x0 + x1) / 2 + r.range(-3, 3), (y0 + y1) / 2, x1, y1) }, w + 1.4, INK, 0.9)
    line(x, x2 => { x2.moveTo(x0, y0); x2.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2, x1, y1) }, w, c, 1)
    if (depth > 0) {
      limb(x1, y1, a - r.range(0.3, 0.6), len * 0.62, w * 0.6, depth - 1)
      limb(x1, y1, a + r.range(0.3, 0.6), len * 0.58, w * 0.6, depth - 1)
    }
  }
  limb(cx, by - 28, -Math.PI / 2 - 0.35, 16, 3.4, 2)
  limb(cx, by - 26, -Math.PI / 2 + 0.45, 14, 3, 2)
}

/** Reeds: stalks leaning in the wind, some with cattail heads. */
function reeds(x: Ctx, cx: number, by: number, r: Rng, n: number, h: number) {
  for (let i = 0; i < n; i++) {
    const bx = cx + r.range(-10, 10), top = by - h * r.range(0.6, 1), lean = r.range(-6, 6)
    line(x, x2 => { x2.moveTo(bx, by); x2.quadraticCurveTo(bx + lean * 0.3, (by + top) / 2, bx + lean, top) }, 1.6, mix(0x6a7a3a, 0x9a9a54, r.next()), 1)
    if (r.next() < 0.45) form(x, P.ellipse(bx + lean * 0.9, top + 5, 2, 5, lean * 0.03), 0x6a4a2a, { rim: 0.6, core: 1 })
  }
  for (let i = 0; i < 4; i++) {
    const bx = cx + r.range(-9, 9)
    line(x, x2 => { x2.moveTo(bx, by); x2.quadraticCurveTo(bx + 4, by - 8, bx + r.range(6, 11), by - r.range(10, 16)) }, 1.4, 0x7a8a44, 0.9)
  }
}

/** A low mound of foliage, optionally in flower. */
function bush(x: Ctx, cx: number, by: number, base: number, r: Rng, flowers: number[] = []) {
  const circles = [[cx - 9, by - 7, 8], [cx + 8, by - 7, 8], [cx, by - 12, 10], [cx - 3, by - 5, 8]]
  form(x, P.cluster(circles), base, { rim: 2, core: 5, hatch: 0.2 })
  for (let i = 0; i < flowers.length * 3; i++) fill(x, P.circle(cx + r.range(-12, 12), by - r.range(4, 18), 1.5), flowers[i % flowers.length], 0.95)
}

/** Standing spires: stalagmites, or black glass. */
function spires(x: Ctx, cx: number, by: number, base: number, r: Rng, glint = 0) {
  for (const [dx, h, w] of [[-7, 22, 6], [5, 32, 7], [11, 16, 5]]) {
    const hx = cx + dx + r.range(-1, 1)
    const path = P.poly([[hx - w, by - 1], [hx - w * 0.3, by - h * 0.7], [hx + r.range(-1, 1), by - h], [hx + w * 0.4, by - h * 0.6], [hx + w, by]])
    form(x, path, base, { rim: 1.4, core: w * 0.6 })
    if (glint) line(x, x2 => { x2.moveTo(hx - w * 0.4, by - h * 0.25); x2.lineTo(hx - w * 0.1, by - h * 0.8) }, 1.2, glint, 0.8)
  }
}

export function buildScatterTextures(scene: Phaser.Scene) {
  const r = new Rng(7070)
  const item = (key: string, w: number, h: number, body: (x: Ctx, cx: number, by: number) => void, shadow = 0.6, outline = 1.6) => {
    const cx = w / 2, by = h - FOOT
    bake(scene, key, w, h, {
      under: shadow ? x => groundShadow(x, cx + 3, by, w * 0.36 * shadow, 5) : undefined,
      body: x => body(x, cx, by),
      outline,
      grain: 0.12,
    })
  }

  // highland: cold pines dusted with snow (the choppable pines are not)
  item('sc_pineSnow', 56, 84, (x, cx, by) => {
    pine(x, cx, by, 0x3e5e56)
    for (const [ty, hw] of [[by - 12, 22], [by - 28, 18], [by - 42, 14], [by - 54, 9]]) {
      fill(x, P.blob([[cx - hw * 0.5, ty - 5], [cx, ty - hw * 0.9 - 4], [cx + hw * 0.45, ty - 6], [cx, ty - 8]], 0.4), 0xeef4f4, 0.95)
    }
  })
  // marsh
  item('sc_reeds', 40, 50, (x, cx, by) => reeds(x, cx, by, r, 9, 34), 0.5, 1.2)
  // moor and the scorched lands
  item('sc_deadTree', 54, 78, (x, cx, by) => deadTree(x, cx, by, 0x6a5e52, r))
  item('sc_charred', 54, 78, (x, cx, by) => deadTree(x, cx, by, 0x2e2622, r))
  item('sc_heath', 44, 30, (x, cx, by) => bush(x, cx, by, 0x5e5a44, r, [0x9a5a8a, 0x7a4a72]), 0.8)
  // ash: the dead of old wars, and their standards
  item('sc_bones', 46, 26, (x, cx, by) => {
    for (let i = 0; i < 4; i++) line(x, x2 => { x2.moveTo(cx - 12 + i * 5, by - 2); x2.quadraticCurveTo(cx - 14 + i * 5, by - 12, cx - 6 + i * 5, by - 13) }, 2, 0xd8d0bc, 1)
    line(x, x2 => { x2.moveTo(cx - 14, by - 11); x2.lineTo(cx + 6, by - 12) }, 2, 0xd8d0bc, 1)
    form(x, P.circle(cx + 12, by - 6, 5.5), 0xe0d8c4, { rim: 1, core: 2 })
    fill(x, P.circle(cx + 10.5, by - 6.5, 1.3), INK, 0.9); fill(x, P.circle(cx + 14, by - 6.5, 1.3), INK, 0.9)
  }, 0.5)
  item('sc_standard', 34, 72, (x, cx, by) => {
    form(x, P.rect(cx - 1.5, by - 60, 3, 60), 0x4a3424, { rim: 0.6, core: 1 })
    line(x, x2 => { x2.moveTo(cx - 10, by - 58); x2.lineTo(cx + 12, by - 58) }, 2.4, 0x4a3424, 1)
    form(x, P.poly([[cx - 9, by - 57], [cx + 11, by - 57], [cx + 10, by - 30], [cx + 5, by - 36], [cx + 1, by - 27], [cx - 3, by - 35], [cx - 9, by - 29]]), 0x7a2a22, { rim: 1.2, core: 4 })
    form(x, P.circle(cx + 1, by - 47, 4), 0xd8d0bc, { rim: 0.8, core: 1.4 })
  }, 0.4)
  // farmland and village
  item('sc_fence', 64, 34, (x, cx, by) => {
    for (const dx of [-26, 0, 26]) form(x, P.round(cx + dx - 2.5, by - 22, 5, 22, 1.2), 0x7a5a3a, { rim: 0.8, core: 1.6 })
    for (const yy of [by - 17, by - 9]) form(x, P.rect(cx - 30, yy, 60, 3.2), 0x9a7a52, { rim: 0.6, core: 1 })
  }, 0.9, 1.4)
  item('sc_hay', 44, 36, (x, cx, by) => {
    form(x, P.blob([[cx - 17, by], [cx - 14, by - 15], [cx, by - 24], [cx + 14, by - 15], [cx + 17, by]], 0.5), 0xd2b056, { rim: 2, core: 6, hatch: 0.3 })
  })
  // green country
  item('sc_bush', 44, 34, (x, cx, by) => bush(x, cx, by, 0x5a7a3e, r))
  item('sc_bushFlower', 44, 34, (x, cx, by) => bush(x, cx, by, 0x5e7e40, r, [0xf2c24e, 0xf1e4c3, 0xe8a0b8]))
  item('sc_fern', 40, 28, (x, cx, by) => {
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.42, L = r.range(12, 17)
      line(x, x2 => { x2.moveTo(cx, by); x2.quadraticCurveTo(cx + Math.cos(a) * L * 0.6, by + Math.sin(a) * L * 0.8, cx + Math.cos(a) * L, by + Math.sin(a) * L * 0.7) }, 3, 0x4a6e36, 1)
    }
  }, 0.7, 1.2)
  item('sc_mushroom', 32, 26, (x, cx, by) => {
    for (const [dx, s, c] of [[-6, 1, 0xb0402a], [6, 0.75, 0xc8a878]] as const) {
      form(x, P.rect(cx + dx - 1.5 * s, by - 9 * s, 3 * s, 9 * s), 0xe8e0cc, { rim: 0.5, core: 1 })
      form(x, P.ellipse(cx + dx, by - 9 * s, 7 * s, 4.5 * s), c, { rim: 1, core: 2 })
      if (c === 0xb0402a) for (const [ox, oy] of [[-3, -1], [2, -2], [0, 1]]) fill(x, P.circle(cx + dx + ox, by - 9 + oy, 1), 0xf4ecd8, 0.95)
    }
  }, 0.5, 1.2)
  // stone country
  item('sc_scree', 44, 26, (x, cx, by) => {
    boulder(x, cx - 8, by, 0.32, 0x9a9484, r)
    boulder(x, cx + 7, by - 1, 0.26, 0x8e887a, r)
    boulder(x, cx + 1, by + 1, 0.2, 0xa8a292, r)
  }, 0.7, 1.2)
  item('sc_rustRock', 44, 32, (x, cx, by) => {
    boulder(x, cx - 4, by, 0.42, 0xa0664a, r)
    boulder(x, cx + 10, by, 0.26, 0x8a5a44, r)
  }, 0.7, 1.4)
  item('sc_vent', 44, 44, (x, cx, by) => {
    form(x, P.blob([[cx - 18, by], [cx - 10, by - 10], [cx + 10, by - 10], [cx + 18, by]], 0.5), 0x8a7a52, { rim: 2, core: 5 })
    fill(x, P.ellipse(cx, by - 9, 9, 3.4), 0xe0cc48, 0.95)
    fill(x, P.ellipse(cx, by - 9, 4.5, 1.7), 0x2a2218, 1)
    for (const [dx, dy, rr] of [[-2, -18, 5], [3, -26, 6], [-1, -34, 5]]) fill(x, P.circle(cx + dx, by + dy, rr), 0xf4f0e0, 0.4)
  }, 0.8, 1.4)
  item('sc_shrub', 40, 30, (x, cx, by) => {
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + r.range(-1.2, 1.2), L = r.range(10, 18)
      line(x, x2 => { x2.moveTo(cx, by); x2.lineTo(cx + Math.cos(a) * L * 0.5 + r.range(-2, 2), by + Math.sin(a) * L * 0.5); x2.lineTo(cx + Math.cos(a) * L, by + Math.sin(a) * L) }, 1.6, 0x6a5238, 1)
    }
  }, 0.6, 1.2)
  // the deep and the burned
  item('sc_stalagmite', 36, 46, (x, cx, by) => spires(x, cx, by, 0x7a746c, r))
  item('sc_shard', 36, 46, (x, cx, by) => spires(x, cx, by, 0x2a2228, r, 0xb8a8e8))
  item('sc_slagHeap', 48, 32, (x, cx, by) => {
    form(x, P.blob([[cx - 20, by], [cx - 15, by - 11], [cx - 4, by - 17], [cx + 9, by - 14], [cx + 20, by]], 0.5), 0x4a3a34, { rim: 2, core: 6, hatch: 0.25 })
    for (let i = 0; i < 6; i++) fill(x, P.circle(cx + r.range(-14, 14), by - r.range(3, 12), r.range(0.8, 1.5)), 0xff8a3a, 0.9)
  })
}
