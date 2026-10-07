/**
 * Night omens: some nights change the night, and the warning before dusk
 * names it. Which night gets which omen is worked out in `systems/omens.ts`.
 */

export type OmenKey = 'bloodMoon' | 'swarm' | 'quiet'

export interface OmenDef {
  key: OmenKey
  name: string
  /** the one-line hint, shown at the warning */
  hint: string
  /** the horde's size, walker kind by walker kind */
  hordeMult: number
  /** extra Chitters, as a share of the night's walkers */
  swarmShare: number
  /** what each kill pays, in coins */
  coinMult: number
  /** the night's light is blended toward this colour, by `tintAmount`, while the night is on */
  tint: number
  tintAmount: number
}

export const OMENS: Record<OmenKey, OmenDef> = {
  bloodMoon: {
    key: 'bloodMoon', name: 'Blood Moon', hint: 'the horde is larger; every kill pays more',
    hordeMult: 1.4, swarmShare: 0, coinMult: 1.6, tint: 0x8a0c0c, tintAmount: 0.55,
  },
  swarm: {
    key: 'swarm', name: 'Swarm Night', hint: 'Chitters swarm in; every kill pays a little more',
    hordeMult: 1, swarmShare: 0.5, coinMult: 1.2, tint: 0x6b8a2a, tintAmount: 0.4,
  },
  quiet: {
    key: 'quiet', name: 'Quiet Night', hint: 'the horde is smaller; a breather before the next',
    hordeMult: 0.7, swarmShare: 0, coinMult: 1, tint: 0x3f6fb0, tintAmount: 0.35,
  },
}

/** Blood Moon: every `every`th night from wave `from` (7, 14, 21 ...). */
export const BLOOD_MOON = { from: 7, every: 7 }

/**
 * Random omens: each other night from wave `from` rolls `chance`. Half of the
 * rolls are Swarm Nights, half Quiet; two random omens never come in a row.
 */
export const OMEN_ROLL = { from: 4, chance: 0.25 }
