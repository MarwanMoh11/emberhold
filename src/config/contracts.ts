/**
 * The hall's dawn contracts: three posted each dawn for the coming night and
 * day, each expiring at the next dawn (the rules are in systems/contracts.ts).
 * Goals and rewards scale with the wave. The reward numbers are estimates to
 * play-test: a night's coins are fitted to the scripted waves, and a contract
 * pays `seconds` of that income, spread over a typical day and night.
 */
import type { EnemyKey } from './enemies'

export const CONTRACT_KINDS = ['cull', 'slaughter', 'hold', 'raise', 'muster', 'haul'] as const
export type ContractKind = (typeof CONTRACT_KINDS)[number]

/** Cull: the horde types it can name, from the first wave they walk in. Goal: base + perWave × wave, at least 3. */
export interface CullType { key: EnemyKey; from: number; base: number; perWave: number }
export const CULL: CullType[] = [
  { key: 'grunt', from: 1, base: 6, perWave: 1 },
  { key: 'runner', from: 2, base: 3, perWave: 0.5 },
  { key: 'swarm', from: 6, base: 10, perWave: 1.5 },
  { key: 'archer', from: 7, base: 4, perWave: 0.5 },
  { key: 'shield', from: 8, base: 3, perWave: 0.3 },
  { key: 'bomber', from: 8, base: 2, perWave: 0.25 },
]

export const CONTRACTS = {
  /** contracts posted each dawn, never two of one kind */
  perDawn: 3,
  /** goals: base + perWave × wave, rounded (Hold fast is always one: it fails on a sacking) */
  goal: {
    slaughter: { base: 3, perWave: 3 },
    raise: { base: 2, perWave: 0.25 },
    muster: { base: 2, perWave: 0.4 },
    haul: { base: 30, perWave: 10 },
  },
  /** a night's coins at a wave: base + perWave × wave (the clear reward and the walkers' coins) */
  income: { base: 60, perWave: 60 },
  /** seconds in a typical day and night: a night's coins over this is its coins a second */
  cycle: 150,
  /** the reward in seconds of that income: `from` at wave 1, `to` from wave `by` on */
  seconds: { from: 40, to: 90, by: 20 },
  /** each kind's share of the reward */
  weight: { cull: 1, slaughter: 1.2, hold: 0.8, raise: 1, muster: 1, haul: 0.9 },
  /** from wave `from` a contract may also pay crystal, with this chance: 1 + wave / `per` */
  crystal: { from: 5, chance: 1 / 3, per: 10 },
}
