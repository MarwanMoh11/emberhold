/**
 * Dawn contracts, the pure rules: what a board holds, how progress and
 * completion work, and what lapses at dawn. No Phaser here, so the tests can
 * load it. ContractManager feeds it from the bus and pays out.
 */
import { ENEMIES, type EnemyKey } from '../config/enemies'
import { CONTRACTS, CONTRACT_KINDS, CULL, type ContractKind } from '../config/contracts'

export interface Contract {
  /** the wave it was posted for and its kind, e.g. `8-cull` */
  id: string
  kind: ContractKind
  /** cull: the horde key; haul: 'wood' or 'stone' */
  target?: string
  /** the goal (Hold fast: 1, held through the night) */
  need: number
  have: number
  reward: { coins: number; crystal?: number }
  /** `expired` only on a board that dawn has settled; it is never saved */
  state: 'open' | 'done' | 'failed' | 'expired'
}

/** The bus events the contracts count, reduced to what each one needs. */
export type ContractEvent =
  | { name: 'enemy:killed'; key: string }
  | { name: 'building:built' }
  | { name: 'building:sacked' }
  | { name: 'soldier:recruited' }
  | { name: 'res:gained'; type: string; amount: number }

/** A seeded rng for one dawn (mulberry32): the same wave always posts the same board. */
export function dawnRng(wave: number): () => number {
  let s = (Math.imul(wave, 0x9e3779b1) ^ 0x2545f491) >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(xs: readonly T[], rand: () => number): T => xs[Math.floor(rand() * xs.length)]

function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** The goal for a kind at a wave; Cull's depends on the horde type it names. */
function goalOf(kind: ContractKind, wave: number, target?: string): number {
  if (kind === 'hold') return 1
  if (kind === 'cull') {
    const t = CULL.find(x => x.key === target)
    return Math.max(3, Math.round((t?.base ?? 0) + (t?.perWave ?? 0) * wave))
  }
  const g = CONTRACTS.goal[kind]
  return Math.max(1, Math.round(g.base + g.perWave * wave))
}

/** Coins for a kind at a wave: `seconds` of a night's income, over a typical day and night, rounded to 5. */
export function rewardCoins(wave: number, kind: ContractKind): number {
  const { income, cycle, seconds, weight } = CONTRACTS
  const t = Math.min(1, Math.max(0, (wave - 1) / (seconds.by - 1)))
  const secs = seconds.from + (seconds.to - seconds.from) * t
  const perSecond = (income.base + income.perWave * wave) / cycle
  return Math.max(5, Math.round((secs * perSecond * weight[kind]) / 5) * 5)
}

const crystalFor = (wave: number, rand: () => number): number =>
  wave >= CONTRACTS.crystal.from && rand() < CONTRACTS.crystal.chance
    ? 1 + Math.floor(wave / CONTRACTS.crystal.per) : 0

/** The board for the coming night: `perDawn` contracts, each of a different kind. */
export function postContracts(wave: number, rand: () => number = dawnRng(wave)): Contract[] {
  return shuffled(CONTRACT_KINDS, rand).slice(0, CONTRACTS.perDawn).map((kind): Contract => {
    const target = kind === 'cull' ? pick(CULL.filter(t => t.from <= wave), rand).key
      : kind === 'haul' ? (rand() < 0.5 ? 'wood' : 'stone') : undefined
    const crystal = crystalFor(wave, rand)
    return {
      id: `${wave}-${kind}`,
      kind,
      ...(target ? { target } : {}),
      need: goalOf(kind, wave, target),
      have: 0,
      reward: crystal ? { coins: rewardCoins(wave, kind), crystal } : { coins: rewardCoins(wave, kind) },
      state: 'open',
    }
  })
}

/** How far one event moves a contract's progress (0 when it does not count). */
function countOf(c: Contract, e: ContractEvent): number {
  switch (c.kind) {
    case 'cull': return e.name === 'enemy:killed' && e.key === c.target ? 1 : 0
    case 'slaughter': return e.name === 'enemy:killed' && !ENEMIES[e.key as EnemyKey]?.structure ? 1 : 0
    case 'raise': return e.name === 'building:built' ? 1 : 0
    case 'muster': return e.name === 'soldier:recruited' ? 1 : 0
    case 'haul': return e.name === 'res:gained' && e.type === c.target ? e.amount : 0
    default: return 0
  }
}

/** One event against one contract: progress, completion or failure. A contract that is not open is left as it is. */
export function applyEvent(c: Contract, e: ContractEvent): Contract {
  if (c.state !== 'open') return c
  if (c.kind === 'hold') return e.name === 'building:sacked' ? { ...c, state: 'failed' } : c
  const add = countOf(c, e)
  if (!add) return c
  const have = Math.min(c.need, c.have + add)
  return { ...c, have, state: have >= c.need ? 'done' : 'open' }
}

/** Dawn settles the old board: Hold fast pays if it never failed; every other open contract expires unpaid. */
export function settleAtDawn(board: Contract[]): { paid: Contract[]; expired: Contract[] } {
  const paid: Contract[] = [], expired: Contract[] = []
  for (const c of board) {
    if (c.state !== 'open') continue
    if (c.kind === 'hold') paid.push({ ...c, have: c.need, state: 'done' })
    else expired.push({ ...c, state: 'expired' })
  }
  return { paid, expired }
}

/** The line a contract reads as, e.g. "Cull 18/25 Chitters — 140 coins". */
export function contractLine(c: Contract): string {
  const what = c.kind === 'cull' ? `Cull ${c.have}/${c.need} ${ENEMIES[c.target as EnemyKey]?.name ?? c.target}s`
    : c.kind === 'slaughter' ? `Slaughter ${c.have}/${c.need} walkers`
    : c.kind === 'hold' ? 'Hold fast: no holding sacked tonight'
    : c.kind === 'raise' ? `Raise ${c.have}/${c.need} buildings`
    : c.kind === 'muster' ? `Muster ${c.have}/${c.need} soldiers`
    : `Haul ${c.have}/${c.need} ${c.target}`
  const crystal = c.reward.crystal ? ` + ${c.reward.crystal} crystal` : ''
  return `${what} — ${c.reward.coins} coins${crystal}`
}

const within = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi

/** A contract as a save holds it: kind, sizes and state checked; a target that names nothing just never progresses. */
export function isContract(v: unknown): v is Contract {
  if (typeof v !== 'object' || v === null) return false
  const c = v as Record<string, unknown>
  const r = c.reward as Record<string, unknown> | null | undefined
  return typeof c.id === 'string' && c.id.length <= 64
    && (CONTRACT_KINDS as readonly unknown[]).includes(c.kind)
    && (c.target === undefined || (typeof c.target === 'string' && c.target.length <= 32))
    && within(c.need, 1, 1e6) && within(c.have, 0, 1e6)
    && ['open', 'done', 'failed'].includes(c.state as string)
    && typeof r === 'object' && r !== null && within(r.coins, 0, 1e9)
    && (r.crystal === undefined || within(r.crystal, 0, 1e6))
}

/** A saved board: at most `perDawn` contracts, each valid. */
export const isBoard = (v: unknown): v is Contract[] =>
  Array.isArray(v) && v.length <= CONTRACTS.perDawn && v.every(isContract)
