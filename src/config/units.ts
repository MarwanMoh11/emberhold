import { PAL } from './palette'
import type { ResourceBag } from '../core/types'
import type { BuildingKey } from './buildings'

export type SoldierKey = 'swordsman' | 'spearman' | 'archer' | 'guard' | 'crossbow' | 'outrider'

export interface SoldierDef {
  key: SoldierKey
  name: string
  /** Chip-sized name for the muster line on the building card. */
  short: string
  hp: number
  damage: number
  attackRate: number
  range: number
  speed: number
  radius: number
  scale: number
  colour: number
  accent: number
  pop: number
  cost: ResourceBag
  from: BuildingKey
  /**
   * Building level that puts this unit on the roster. It is a floor, not a
   * swap: a Lv.3 Barracks can still muster swordsmen, and the spearman stays
   * available for the brutes it was designed to counter.
   */
  tier: number
  ranged?: boolean
  projectileSpeed?: number
  /** bonus multiplier vs big enemies */
  vsHeavy?: number
  desc: string
}

export const SOLDIERS: Record<SoldierKey, SoldierDef> = {
  swordsman: {
    key: 'swordsman', name: 'Swordsman', short: 'SWORD', hp: 110, damage: 11, attackRate: 1.05, range: 34,
    speed: 168, radius: 13, scale: 1, colour: PAL.allyBody, accent: 0x24486f, pop: 1,
    cost: { food: 30, coins: 12 }, from: 'barracks', tier: 1,
    desc: 'Steady line infantry.',
  },
  spearman: {
    key: 'spearman', name: 'Spearman', short: 'SPEAR', hp: 130, damage: 13, attackRate: 0.85, range: 54,
    speed: 160, radius: 13, scale: 1.04, colour: 0x2f7a8e, accent: 0x1f5566, pop: 1,
    cost: { food: 48, coins: 26, wood: 15 }, from: 'barracks', tier: 2, vsHeavy: 2.1,
    desc: 'Longer reach. Tears through brutes and elites.',
  },
  guard: {
    key: 'guard', name: 'Heavy Guard', short: 'GUARD', hp: 300, damage: 14, attackRate: 0.8, range: 36,
    speed: 132, radius: 16, scale: 1.24, colour: 0x5a6a86, accent: 0x2e384a, pop: 2,
    cost: { food: 85, coins: 60, metal: 10 }, from: 'barracks', tier: 3,
    desc: 'Soaks the charge so the rest of the line lives.',
  },
  archer: {
    key: 'archer', name: 'Archer', short: 'ARCHER', hp: 75, damage: 10, attackRate: 1.15, range: 250,
    speed: 160, radius: 12, scale: 0.96, colour: PAL.allyAlt, accent: 0x2e6b3a, pop: 1,
    cost: { food: 38, coins: 28, wood: 12 }, from: 'archeryRange', tier: 1,
    ranged: true, projectileSpeed: 560,
    desc: 'Shoots over the shield wall.',
  },
  crossbow: {
    key: 'crossbow', name: 'Crossbowman', short: 'BOLT', hp: 90, damage: 26, attackRate: 0.6, range: 300,
    speed: 148, radius: 12, scale: 1.02, colour: 0x6f8440, accent: 0x4c5c25, pop: 1,
    cost: { food: 65, coins: 62, metal: 10 }, from: 'archeryRange', tier: 2,
    ranged: true, projectileSpeed: 700,
    desc: 'Slow, punishing bolts with real punch.',
  },
  outrider: {
    key: 'outrider', name: 'Outrider', short: 'RIDER', hp: 160, damage: 22, attackRate: 1.3, range: 40,
    speed: 250, radius: 14, scale: 1.1, colour: 0x3c4f96, accent: 0x6d4620, pop: 2,
    cost: { food: 105, coins: 105, metal: 20 }, from: 'stable', tier: 1,
    desc: 'Fast flanker that runs down stragglers.',
  },
}

export type WorkerKey = 'lumberjack' | 'farmer' | 'cutter' | 'miner' | 'delver' | 'builder'

export interface WorkerDef {
  key: WorkerKey
  name: string
  hp: number
  speed: number
  /** units of resource gathered per gather tick */
  yield: number
  /** seconds per gather tick */
  gatherTime: number
  carry: number
  pop: number
  cost: ResourceBag
  colour: number
  accent: number
  home: BuildingKey
  desc: string
}

export const WORKERS: Record<WorkerKey, WorkerDef> = {
  lumberjack: {
    key: 'lumberjack', name: 'Lumberjack', hp: 60, speed: 132, yield: 8, gatherTime: 1.35,
    carry: 24, pop: 1, cost: { coins: 30, wood: 10 },
    colour: PAL.workerBody, accent: 0x6d4f22, home: 'lumberCamp',
    desc: 'Fells nearby trees and stacks the timber at camp.',
  },
  farmer: {
    key: 'farmer', name: 'Farmer', hp: 60, speed: 124, yield: 5, gatherTime: 1.8,
    carry: 18, pop: 1, cost: { coins: 35, wood: 10 },
    colour: 0x9fc25c, accent: 0x55702a, home: 'farm',
    desc: 'Works the fields for grain.',
  },
  cutter: {
    key: 'cutter', name: 'Stonecutter', hp: 75, speed: 112, yield: 5, gatherTime: 2,
    carry: 16, pop: 1, cost: { coins: 70, food: 25 },
    colour: 0x9aa4ad, accent: 0x4e565e, home: 'quarry',
    desc: 'Splits blocks from the quarry face.',
  },
  miner: {
    key: 'miner', name: 'Miner', hp: 75, speed: 112, yield: 4, gatherTime: 2.3,
    carry: 14, pop: 1, cost: { coins: 120, food: 45 },
    colour: 0xb08b5c, accent: 0x5a4227, home: 'mine',
    desc: 'Digs iron from the seam.',
  },
  /**
   * The slowest crew in the game, on purpose. Crystal is what the top level of
   * five different structures is priced in, so a delver who worked like a
   * miner would flatten the whole endgame inside one night.
   */
  delver: {
    key: 'delver', name: 'Delver', hp: 80, speed: 108, yield: 2, gatherTime: 7,
    carry: 10, pop: 1, cost: { coins: 260, food: 90, metal: 25 },
    colour: 0xb08fd8, accent: 0x54397e, home: 'crystalDelve',
    desc: 'Chips shards loose from the crystal seam. Never in a hurry.',
  },
  builder: {
    key: 'builder', name: 'Builder', hp: 70, speed: 136, yield: 0, gatherTime: 1,
    carry: 0, pop: 1, cost: { coins: 90, wood: 40, food: 20 },
    colour: 0xe0a35c, accent: 0x7d5322, home: 'workshop',
    desc: 'Patches damaged walls and buildings between waves.',
  },
}

/**
 * Which worker a given production building employs. A building missing from
 * this map cannot hire, so this is the whole roster.
 *
 * There is deliberately no hauler here. A porter sat in this file for a long
 * time, fully statted and impossible to hire, described as running deliveries
 * between sites — but nothing in the game has a delivery to run. A crew banks
 * its haul at its own camp and the number lands in one shared store the
 * instant it does; no site holds stock, nothing is ever in transit, and the
 * depot only exists to take the load off the hero's back. A porter here would
 * have had to invent resources at one end of a walk, which is a second income
 * channel wearing a logistics costume. If site-level stockpiles ever land,
 * that is when a hauler earns its keep.
 */
export const WORKER_FOR: Partial<Record<BuildingKey, WorkerKey>> = {
  lumberCamp: 'lumberjack',
  farm: 'farmer',
  quarry: 'cutter',
  mine: 'miner',
  crystalDelve: 'delver',
  workshop: 'builder',
}
