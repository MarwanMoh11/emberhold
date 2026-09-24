import type { EnemyKey } from './enemies'
import type { ApproachId } from '../systems/Approaches'

export interface WaveDef {
  wave: number
  enemies: Partial<Record<EnemyKey, number>>
  /**
   * Fronts this night would rather use, in order. Only live approaches count,
   * and the fronts-per-night limit still applies; the rest of the night is
   * chosen by `Approaches.tonight`. Most waves leave it out.
   */
  approaches?: ApproachId[]
  banner?: string
  /** boss spawns alongside the listed enemies */
  boss?: EnemyKey
  hpMult?: number
  dmgMult?: number
  /** seconds the spawn is spread over */
  spread?: number
}

export const WAVES: WaveDef[] = [
  { wave: 1, enemies: { grunt: 8 }, banner: 'Scouts on the ridge', spread: 5 },
  { wave: 2, enemies: { grunt: 12, runner: 4 }, spread: 6 },
  { wave: 3, enemies: { grunt: 16, runner: 8 }, spread: 7 },
  { wave: 4, enemies: { grunt: 20, runner: 10, brute: 3 }, banner: 'Brutes in the line', spread: 8 },
  { wave: 5, enemies: { grunt: 18, runner: 10, brute: 4 }, boss: 'siegeBeast', banner: 'A SIEGE BEAST IS COMING', spread: 9 },
  { wave: 6, enemies: { grunt: 24, runner: 14, swarm: 20 }, spread: 9 },
  { wave: 7, enemies: { grunt: 22, archer: 8, brute: 4, runner: 10 }, banner: 'They brought slingers', spread: 9 },
  { wave: 8, enemies: { grunt: 26, archer: 10, shield: 6, bomber: 4, runner: 12 }, spread: 10 },
  { wave: 9, enemies: { grunt: 24, archer: 12, brute: 6, elite: 2, swarm: 30 }, banner: 'Champions among them', spread: 10 },
  { wave: 10, enemies: { grunt: 30, archer: 12, shield: 8, brute: 6, bomber: 6 }, boss: 'warlord', banner: 'WARLORD KRAHN MARCHES', spread: 12 },
  { wave: 11, enemies: { grunt: 34, runner: 20, archer: 14, shield: 8, commander: 2 }, spread: 11 },
  { wave: 12, enemies: { grunt: 36, brute: 10, elite: 3, bomber: 8, swarm: 40 }, spread: 12 },
]

/** Past the scripted list, the director keeps building waves that scale. */
export function proceduralWave(wave: number): WaveDef {
  const t = wave - WAVES.length
  const s = 1 + t * 0.14
  const def: WaveDef = {
    wave,
    enemies: {
      grunt: Math.round(30 * s),
      runner: Math.round(16 * s),
      archer: Math.round(12 * s),
      shield: Math.round(7 * s),
      brute: Math.round(8 * s),
      bomber: Math.round(5 * s),
      swarm: Math.round(24 * s),
      elite: 2 + Math.floor(t / 2),
      commander: 1 + Math.floor(t / 3),
    },
    hpMult: 1 + t * 0.22,
    dmgMult: 1 + t * 0.13,
    spread: 12,
  }
  if (wave % 5 === 0) {
    def.boss = wave % 10 === 0 ? 'warlord' : 'siegeBeast'
    def.banner = wave % 10 === 0 ? 'A WARLORD RETURNS' : 'SIEGE BEAST INBOUND'
  }
  return def
}

export function waveDef(wave: number): WaveDef {
  return WAVES.find(w => w.wave === wave) ?? proceduralWave(wave)
}

/**
 * Light director. Nudges composition toward what the player is *not* ready for,
 * without rubber-banding away their power. A strong hold still steamrolls.
 */
export interface DirectorInput {
  soldierCount: number
  towerCount: number
  playerLevel: number
  wallHp: number
}

export function directorAdjust(def: WaveDef, input: DirectorInput): WaveDef {
  const out: WaveDef = { ...def, enemies: { ...def.enemies }, ...(def.approaches ? { approaches: [...def.approaches] } : {}) }
  // Lots of walls up -> send more sappers to make the player defend actively.
  if (input.wallHp > 3000 && def.wave >= 6) {
    out.enemies.bomber = (out.enemies.bomber ?? 0) + Math.min(8, Math.floor(input.wallHp / 2500))
  }
  // Big standing army -> a couple of elites so the line has something to chew.
  if (input.soldierCount > 14 && def.wave >= 7) {
    out.enemies.elite = (out.enemies.elite ?? 0) + 1
  }
  // Tower-heavy -> archers to trade at range.
  if (input.towerCount >= 4 && def.wave >= 6) {
    out.enemies.archer = (out.enemies.archer ?? 0) + input.towerCount
  }
  return out
}
