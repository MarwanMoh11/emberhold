/** Central colour vocabulary. Keep every hue here so the game reads as one world. */
export const PAL: Record<string, number> = {
  // terrain
  grassA: 0x4a7c43,
  grassB: 0x558a4b,
  grassC: 0x416d3b,
  dirt: 0x8a6a45,
  path: 0xa8916b,
  stoneGround: 0x6f7680,
  ruins: 0x5d5f68,
  sand: 0xc2ab72,
  water: 0x3f7fa8,

  // player faction (cool steel-blue)
  heroBody: 0x3f6fd0,
  heroTrim: 0x8fd0ff,
  heroSkin: 0xf0c49a,
  allyBody: 0x4a86d8,
  allyAlt: 0x58a86a,
  workerBody: 0xc8a25c,

  // horde faction (hot red-orange)
  enemyBody: 0xd0453c,
  enemyRunner: 0xe0813a,
  enemyBrute: 0x9c3b30,
  enemyArcher: 0xc85f8e,
  enemyShield: 0x8a6a50,
  enemyBomber: 0xe8a13a,
  enemySwarm: 0xb4566a,
  enemyElite: 0x8e3fa8,
  enemyCommander: 0x6f4bd0,
  enemyBoss: 0x7a2630,

  // resources
  coins: 0xffd24a,
  wood: 0xa4703c,
  food: 0x7fc44f,
  stone: 0x9aa4ad,
  metal: 0xd4dbe6,
  crystal: 0xa878f0,
  xp: 0x6ee8ff,

  // structures
  woodLight: 0xb98551,
  woodDark: 0x7d5433,
  stoneLight: 0xb0b7c0,
  stoneDark: 0x767e8a,
  roofA: 0xc4553f,
  roofB: 0x4f7fb5,
  banner: 0x3f6fd0,

  // ui
  uiBg: 0x121b28,
  uiPanel: 0x1b2739,
  uiEdge: 0x33506f,
  uiText: 0xe9f1ff,
  uiDim: 0x8ba0bb,
  gold: 0xffc93c,
  danger: 0xff5a4a,
  good: 0x5ce08a,
  night: 0x0d1a3a,
}

export const CSS = (n: number) => '#' + n.toString(16).padStart(6, '0')
