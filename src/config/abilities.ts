export type AbilityKey = 'whirlwind' | 'arrowRain' | 'shockwave' | 'rally' | 'firebomb' | 'mend'

export interface AbilityDef {
  key: AbilityKey
  name: string
  short: string
  cooldown: number
  /** glyph drawn on the hotbar button */
  glyph: string
  colour: number
  desc: string
  unlockLevel: number
  ultimate?: boolean
}

export const ABILITIES: Record<AbilityKey, AbilityDef> = {
  whirlwind: {
    key: 'whirlwind', name: 'Whirlwind', short: 'WHIRL', cooldown: 7, glyph: '✳',
    colour: 0x8fd0ff, unlockLevel: 1,
    desc: 'Sweep everything around you for heavy damage and knockback.',
  },
  shockwave: {
    key: 'shockwave', name: 'Shockwave', short: 'SHOCK', cooldown: 11, glyph: '◎',
    colour: 0x6ee8ff, unlockLevel: 3,
    desc: 'A ring of force hurls the horde back and stuns it.',
  },
  arrowRain: {
    key: 'arrowRain', name: 'Arrow Rain', short: 'RAIN', cooldown: 14, glyph: '⇊',
    colour: 0x9ff07a, unlockLevel: 6,
    desc: 'Volleys fall on the thickest part of the horde.',
  },
  firebomb: {
    key: 'firebomb', name: 'Fire Bomb', short: 'FIRE', cooldown: 16, glyph: '✸',
    colour: 0xff9840, unlockLevel: 9,
    desc: 'Leaves burning ground that cooks anything crossing it.',
  },
  mend: {
    key: 'mend', name: 'Second Wind', short: 'MEND', cooldown: 26, glyph: '✚',
    colour: 0x5ce08a, unlockLevel: 4,
    desc: 'Restore a chunk of your health and your nearby troops.',
  },
  rally: {
    key: 'rally', name: 'Rally', short: 'RALLY', cooldown: 34, glyph: '★',
    colour: 0xffc93c, unlockLevel: 8, ultimate: true,
    desc: 'Your whole army hits harder and faster for 10 seconds.',
  },
}

export const ABILITY_SLOTS: AbilityKey[] = ['whirlwind', 'shockwave', 'arrowRain', 'firebomb', 'mend']
export const ULTIMATE: AbilityKey = 'rally'

export const ABILITY_TUNING = {
  whirlwind: { radius: 168, damageMult: 2.6, knockback: 300 },
  shockwave: { radius: 260, damageMult: 1.4, knockback: 640, stun: 1.1 },
  arrowRain: { radius: 190, volleys: 14, damageMult: 0.85, duration: 2.4 },
  firebomb: { radius: 150, duration: 6, tickRate: 0.35, damageMult: 0.55 },
  mend: { healPct: 0.45, allyHealPct: 0.5, radius: 320 },
  rally: { duration: 10, damageMult: 1.8, rateMult: 1.5 },
}
