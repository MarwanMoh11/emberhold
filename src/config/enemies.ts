import { PAL } from './palette'

export type EnemyKey =
  | 'grunt' | 'runner' | 'brute' | 'archer' | 'shield'
  | 'bomber' | 'swarm' | 'elite' | 'commander'
  | 'siegeBeast' | 'warlord' | 'cinderRegent' | 'camp' | 'brazier'
  | 'bogWretch' | 'thornling' | 'ashPriest' | 'cinderHound'

export type TargetPref = 'nearest' | 'structures' | 'workers' | 'player'

export interface EnemyDef {
  key: EnemyKey
  name: string
  hp: number
  damage: number
  speed: number
  range: number
  attackRate: number
  radius: number
  scale: number
  colour: number
  accent: number
  xp: number
  /** average coins dropped */
  coins: number
  /** chance -> extra resource drops */
  drops?: { type: 'wood' | 'food' | 'stone' | 'metal' | 'crystal'; chance: number; amount: number }[]
  prefers: TargetPref
  ranged?: boolean
  projectileSpeed?: number
  /** S16: the bolt's texture and tint (default the slinger's arrow) */
  projectileTex?: string
  projectileTint?: number
  /** explodes on death near structures */
  explodes?: { radius: number; damage: number }
  /** buffs nearby allies; `heal` hp/s to the others in reach (S16), `tint` on the buffed */
  aura?: { radius: number; damageMult: number; speedMult: number; heal?: number; tint?: number }
  /** S16: its hits slow the hero and soldiers: `mult` on move speed for `seconds` (never stacks) */
  slows?: { mult: number; seconds: number }
  /** S16: each card in the night's deck opens into this many, side by side */
  pack?: number
  /** S16: a visual burst on death */
  deathFx?: 'splinters'
  /** S16: leaves a burning patch where it dies, hurting the hero and soldiers */
  deathPatch?: { radius: number; dps: number; seconds: number }
  boss?: boolean
  elite?: boolean
  knockbackResist?: number
  healthbar?: boolean
  /** stationary objective rather than a walking unit */
  structure?: boolean
}

export const ENEMIES: Record<EnemyKey, EnemyDef> = {
  grunt: {
    key: 'grunt', name: 'Husk Raider',
    hp: 40, damage: 5, speed: 76, range: 30, attackRate: 1, radius: 13, scale: 1,
    colour: PAL.enemyBody, accent: 0x7d2620, xp: 3, coins: 5, prefers: 'nearest',
  },
  runner: {
    key: 'runner', name: 'Scurrier',
    hp: 26, damage: 4, speed: 142, range: 26, attackRate: 1.3, radius: 11, scale: 0.88,
    colour: PAL.enemyRunner, accent: 0x8a4a18, xp: 3, coins: 4, prefers: 'workers',
  },
  brute: {
    key: 'brute', name: 'Ironhide Brute',
    hp: 190, damage: 18, speed: 48, range: 40, attackRate: 0.72, radius: 21, scale: 1.5,
    colour: PAL.enemyBrute, accent: 0x5e211a, xp: 14, coins: 18, prefers: 'nearest',
    knockbackResist: 0.72, healthbar: true,
    drops: [{ type: 'stone', chance: 0.4, amount: 6 }],
  },
  archer: {
    key: 'archer', name: 'Bone Slinger',
    hp: 52, damage: 7, speed: 70, range: 230, attackRate: 0.8, radius: 12, scale: 0.98,
    colour: PAL.enemyArcher, accent: 0x7d2a4c, xp: 6, coins: 8, prefers: 'nearest',
    ranged: true, projectileSpeed: 380,
  },
  shield: {
    key: 'shield', name: 'Bulwark',
    hp: 150, damage: 10, speed: 58, range: 34, attackRate: 0.9, radius: 17, scale: 1.2,
    colour: PAL.enemyShield, accent: 0x4f3a28, xp: 10, coins: 12, prefers: 'structures',
    knockbackResist: 0.85, healthbar: true,
  },
  bomber: {
    key: 'bomber', name: 'Powderkeg',
    hp: 46, damage: 6, speed: 104, range: 30, attackRate: 1, radius: 14, scale: 1.05,
    colour: PAL.enemyBomber, accent: 0x8a5a12, xp: 8, coins: 10, prefers: 'structures',
    explodes: { radius: 110, damage: 42 },
  },
  swarm: {
    key: 'swarm', name: 'Chitter',
    hp: 12, damage: 2, speed: 118, range: 22, attackRate: 1.6, radius: 8, scale: 0.62,
    colour: PAL.enemySwarm, accent: 0x6d2a38, xp: 1, coins: 2, prefers: 'nearest',
  },
  elite: {
    key: 'elite', name: 'Ash Champion',
    hp: 420, damage: 24, speed: 74, range: 44, attackRate: 1, radius: 23, scale: 1.6,
    colour: PAL.enemyElite, accent: 0x4c2160, xp: 40, coins: 55, prefers: 'nearest',
    elite: true, knockbackResist: 0.8, healthbar: true,
    drops: [{ type: 'metal', chance: 0.6, amount: 8 }, { type: 'stone', chance: 0.7, amount: 10 }],
  },
  commander: {
    key: 'commander', name: 'Horde Caller',
    hp: 300, damage: 12, speed: 66, range: 40, attackRate: 0.8, radius: 20, scale: 1.4,
    colour: PAL.enemyCommander, accent: 0x36246e, xp: 32, coins: 40, prefers: 'nearest',
    elite: true, healthbar: true,
    aura: { radius: 260, damageMult: 1.35, speedMult: 1.2 },
    drops: [{ type: 'crystal', chance: 0.35, amount: 2 }],
  },
  siegeBeast: {
    key: 'siegeBeast', name: 'SIEGE BEAST',
    hp: 2600, damage: 34, speed: 44, range: 62, attackRate: 0.6, radius: 42, scale: 2.9,
    colour: 0xff8a34, accent: 0x3f2415, xp: 260, coins: 420, prefers: 'structures',
    boss: true, knockbackResist: 1, healthbar: true,
    drops: [
      { type: 'stone', chance: 1, amount: 120 },
      { type: 'wood', chance: 1, amount: 120 },
      { type: 'metal', chance: 1, amount: 40 },
    ],
  },
  camp: {
    key: 'camp', name: 'Warcamp',
    hp: 1400, damage: 0, speed: 0, range: 0, attackRate: 0.01, radius: 46, scale: 1,
    colour: 0xff6a2e, accent: 0x3f1c14, xp: 120, coins: 200, prefers: 'player',
    knockbackResist: 1, healthbar: true, structure: true,
  },
  // S10: the fortress's wards. Three ring Ashgate; it takes no damage until they fall.
  brazier: {
    key: 'brazier', name: 'Warding Brazier',
    hp: 2000, damage: 0, speed: 0, range: 0, attackRate: 0.01, radius: 26, scale: 1,
    colour: 0xff8a34, accent: 0x2a1c16, xp: 40, coins: 60, prefers: 'player',
    knockbackResist: 1, healthbar: true, structure: true,
  },
  // ---- S16: the new walkers (05-content §New walkers) ----------------------
  bogWretch: {
    key: 'bogWretch', name: 'Bog Wretch',
    hp: 160, damage: 9, speed: 54, range: 34, attackRate: 0.8, radius: 17, scale: 1.25,
    colour: 0x9cc25a, accent: 0x2e3a22, xp: 10, coins: 12, prefers: 'nearest',
    knockbackResist: 0.6, healthbar: true,
    slows: { mult: 0.7, seconds: 1.5 },
  },
  thornling: {
    key: 'thornling', name: 'Thornling',
    hp: 10, damage: 2, speed: 130, range: 22, attackRate: 1.5, radius: 8, scale: 0.6,
    colour: 0xc8d26a, accent: 0x3e4a1e, xp: 1, coins: 1, prefers: 'nearest',
    pack: 5, deathFx: 'splinters',
  },
  ashPriest: {
    key: 'ashPriest', name: 'Ash Priest',
    hp: 220, damage: 10, speed: 60, range: 200, attackRate: 0.6, radius: 17, scale: 1.3,
    colour: 0xff9a44, accent: 0x5a5250, xp: 24, coins: 30, prefers: 'nearest',
    ranged: true, projectileSpeed: 300, projectileTex: 'proj_magic', projectileTint: 0xff8a3a,
    elite: true, knockbackResist: 0.4, healthbar: true,
    aura: { radius: 220, damageMult: 1.25, speedMult: 1, heal: 10, tint: 0xffc890 },
    drops: [{ type: 'crystal', chance: 0.2, amount: 1 }],
  },
  cinderHound: {
    key: 'cinderHound', name: 'Cinder Hound',
    hp: 60, damage: 8, speed: 170, range: 28, attackRate: 1.2, radius: 14, scale: 1.05,
    colour: 0xff6a2a, accent: 0x5a2010, xp: 6, coins: 7, prefers: 'nearest',
    deathPatch: { radius: 56, dps: 14, seconds: 3 },
  },
  warlord: {
    key: 'warlord', name: 'WARLORD KRAHN',
    hp: 7200, damage: 46, speed: 62, range: 70, attackRate: 0.85, radius: 48, scale: 3.3,
    colour: PAL.enemyBoss, accent: 0x2a0d12, xp: 900, coins: 1400, prefers: 'player',
    boss: true, knockbackResist: 1, healthbar: true,
    aura: { radius: 340, damageMult: 1.25, speedMult: 1.15 },
    drops: [
      { type: 'metal', chance: 1, amount: 200 },
      { type: 'crystal', chance: 1, amount: 40 },
      { type: 'stone', chance: 1, amount: 200 },
    ],
  },
  cinderRegent: {
    key: 'cinderRegent', name: 'THE CINDER REGENT',
    hp: 9400, damage: 42, speed: 76, range: 68, attackRate: 0.8, radius: 44, scale: 3.1,
    colour: 0xffa03a, accent: 0xffb64c, xp: 1200, coins: 1800, prefers: 'player',
    boss: true, knockbackResist: 1, healthbar: true,
    drops: [
      { type: 'crystal', chance: 1, amount: 120 },
      { type: 'metal', chance: 1, amount: 320 },
      { type: 'stone', chance: 1, amount: 240 },
    ],
  },
}
