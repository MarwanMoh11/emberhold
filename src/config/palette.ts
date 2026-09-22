/**
 * Central colour vocabulary. Keep every hue here so the game reads as one world.
 *
 * The look is "ink and ember": a frontier chronicle drawn in warm gouache over
 * paper, inked in a brown-black, and fought over by two heraldries. The hold
 * wears lapis and bone; the horde is soot, lit from inside by ember. Colour is
 * rationed so it can carry meaning — gold is reward, vermilion is danger, lapis
 * is yours — and the ground stays muted so everything that matters stands on it.
 */
export const PAL: Record<string, number> = {
  // terrain — sage and ochre gouache, never lime
  grassA: 0x7d8b4c,
  grassB: 0x97a45c,
  grassC: 0x5d6c3b,
  dirt: 0xa27d52,
  path: 0xc6a978,
  stoneGround: 0x8f8a7b,
  ruins: 0x7c766a,
  sand: 0xd4bd88,
  water: 0x4e7f93,

  // the hold: lapis and bone
  heroBody: 0x2c5aa0,
  heroTrim: 0x8ec2ff,
  heroSkin: 0xf0c9a0,
  allyBody: 0x3a68b0,
  allyAlt: 0x4f8a4a,
  workerBody: 0xc49a5a,

  // the horde: soot bodies, and these are the embers that burn inside them
  enemyBody: 0xff6a2e,
  enemyRunner: 0xffa23c,
  enemyBrute: 0xe8492b,
  enemyArcher: 0xff5a9e,
  enemyShield: 0xd99a58,
  enemyBomber: 0xffcf3e,
  enemySwarm: 0xff7d6a,
  enemyElite: 0xb46cff,
  enemyCommander: 0x7f8cff,
  enemyBoss: 0xff3b2a,

  // resources
  coins: 0xf2c24e,
  wood: 0xae7a42,
  food: 0xb3c95a,
  stone: 0xb5ae9f,
  metal: 0xcfd8e2,
  crystal: 0xb98cff,
  xp: 0x8ee6ff,

  // structures
  woodLight: 0xc6955e,
  woodDark: 0x7c5436,
  stoneLight: 0xd0c8b3,
  stoneDark: 0x8e8776,
  roofA: 0xb4553b,
  roofB: 0x3b64a0,
  banner: 0x2c5aa0,

  // ui — walnut, bone and gilt
  uiBg: 0x16100c,
  uiPanel: 0x241a13,
  uiEdge: 0x7a5f3a,
  uiText: 0xf4e9cf,
  uiDim: 0xbba98a,
  gold: 0xf0c050,
  danger: 0xf2573c,
  good: 0x9dd46c,
  night: 0x1b1a3a,

  // the ink and paper everything is drawn with
  ink: 0x22160e,
  inkSoft: 0x4a3526,
  parchment: 0xecdcb4,
  parchmentDark: 0xcdb485,
  vellum: 0xe4d2a6,
  soot: 0x2b2225,
  char: 0x44352f,
  ember: 0xff7a2e,
  lapis: 0x2c5aa0,
  bone: 0xf1e4c3,
  gilt: 0xdcaa45,
  wax: 0xa8302a,
}

export const CSS = (n: number) => '#' + n.toString(16).padStart(6, '0')
