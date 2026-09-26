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

/**
 * The macro pace runs at 1.5× the first pass (STATUS 2026-09-24): night `n`
 * threatens like first-pass night `n / WAVE_PACE`, so night 45 is the old 30.
 * The scripted list above is that first pass. Its nights land at
 * `stretched(k)` (1, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18) with their banners
 * and bosses (the siege beast on 8, Krahn on 15); the nights between take
 * counts part-way between their neighbours.
 */
export const WAVE_PACE = 1.5
const stretched = (k: number) => (k === 1 ? 1 : Math.round(k * WAVE_PACE))
const LAST = stretched(WAVES.length)

/**
 * Three fronts (S22). An approach's walkers are stronger the deeper its muster
 * camp sits (`hp`/`dmg` per tier, tiers 1 to 5), and a night that comes from
 * three or more fronts sends `share` of its walkers: the army cannot stand on
 * every road at once. S20 left the hold a coin flip from night 23 (the probe
 * had no towers); S22's playthrough, towers built, still lost the hall or
 * the whole army most nights from 23 with the old 0.25/0.15 and a full deck.
 */
export const FRONTS = { hp: 0.12, dmg: 0.08, share: 0.85 }
export const frontShare = (fronts: number) => (fronts >= 3 ? FRONTS.share : 1)

/** Past the scripted list, the director keeps building waves that scale. */
export function proceduralWave(wave: number): WaveDef {
  const t = wave / WAVE_PACE - WAVES.length
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
  // a boss every 8 nights (the first pass: every 5), a Warlord every 16
  if (wave % 8 === 0) {
    def.boss = wave % 16 === 0 ? 'warlord' : 'siegeBeast'
    def.banner = wave % 16 === 0 ? 'A WARLORD RETURNS' : 'SIEGE BEAST INBOUND'
  }
  return def
}

export function waveDef(wave: number): WaveDef {
  if (wave > LAST) return proceduralWave(wave)
  const at = WAVES.find(w => stretched(w.wave) === wave)
  if (at) return { ...at, wave }
  // between two scripted nights: the counts part-way, no banner, no boss
  const k = WAVES.findIndex(w => stretched(w.wave) > wave)
  const a = WAVES[Math.max(0, k - 1)], b = WAVES[k]
  const f = (wave - stretched(a.wave)) / (stretched(b.wave) - stretched(a.wave))
  const enemies: WaveDef['enemies'] = {}
  for (const key of new Set([...Object.keys(a.enemies), ...Object.keys(b.enemies)]) as Set<EnemyKey>) {
    const n = Math.round((a.enemies[key] ?? 0) * (1 - f) + (b.enemies[key] ?? 0) * f)
    if (n > 0) enemies[key] = n
  }
  return { wave, enemies, spread: a.spread }
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
  if (input.wallHp > 3000 && def.wave >= 9) {
    out.enemies.bomber = (out.enemies.bomber ?? 0) + Math.min(8, Math.floor(input.wallHp / 2500))
  }
  // Big standing army -> a couple of elites so the line has something to chew.
  if (input.soldierCount > 14 && def.wave >= 11) {
    out.enemies.elite = (out.enemies.elite ?? 0) + 1
  }
  // Tower-heavy -> archers to trade at range.
  if (input.towerCount >= 4 && def.wave >= 9) {
    out.enemies.archer = (out.enemies.archer ?? 0) + input.towerCount
  }
  return out
}
