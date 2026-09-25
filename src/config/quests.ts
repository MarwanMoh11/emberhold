import type { ResourceBag } from '../core/types'
import type { BuildingKey } from './buildings'
import type { EnemyKey } from './enemies'
import { PADS, POIS, REGIONS, type RegionId } from './world'

export type QuestGoal =
  | { type: 'kill'; amount: number }
  | { type: 'collect'; resource: 'coins' | 'wood' | 'food' | 'stone' | 'metal' | 'crystal'; amount: number }
  /** `region`: only pads in that region count (S18's village quests) */
  | { type: 'build'; building: BuildingKey; amount?: number; region?: RegionId }
  | { type: 'upgrade'; building: BuildingKey; level: number }
  | { type: 'recruit'; amount: number }
  | { type: 'workers'; amount: number }
  | { type: 'survive'; wave: number }
  | { type: 'camp'; amount: number }
  /** claimed regions, the hold included (S18) */
  | { type: 'zone'; amount: number }
  | { type: 'level'; amount: number }
  | { type: 'boss'; key: EnemyKey }
  // S18: the frontier's own goals
  | { type: 'claim'; region: RegionId }
  | { type: 'burn'; camp: string }
  /** shrines restored */
  | { type: 'restore'; amount: number }
  /** relics held */
  | { type: 'relic'; amount: number }
  /** a POI done (survivors joined, a landmark reached…) */
  | { type: 'reach'; poi: string }
  /** travel by any waystone once */
  | { type: 'travel' }
  /** every piece and gate of a fortification line built and standing */
  | { type: 'line'; line: string }
  /** that many buildings standing in a region (walls and gates do not count) */
  | { type: 'settle'; region: RegionId; count: number }

export interface QuestDef {
  /** `a…` to `e…`: the letter is the act (ACTS), the number its place in it */
  id: string
  title: string
  /** short imperative shown under the objective banner */
  hint: string
  goal: QuestGoal
  reward: ResourceBag & { xp?: number }
}

export interface ActDef { roman: string; name: string; blurb: string }

/** Campaign 2.0's five acts (design 06). A banner plays as the chain enters each. */
export const ACTS: ActDef[] = [
  { roman: 'I', name: 'The Rise', blurb: 'Gather, build, and hold the Old King\'s Bridge.' },
  { roman: 'II', name: 'The River', blurb: 'Three fronts, and the old roads between them.' },
  { roman: 'III', name: 'The Frontier', blurb: 'Old gods, grave goods, and the first of the strongholds.' },
  { roman: 'IV', name: 'The Scar', blurb: 'Down through the Seamgate to the walls of Ashgate.' },
  { roman: 'V', name: 'The Crown', blurb: 'The causeway is open. She waits on her island.' },
]

/** 1-based act of a quest, from its id's letter. */
export const actOf = (q: Pick<QuestDef, 'id'>) => 'abcde'.indexOf(q.id[0]) + 1

/** Banners for camps whose burning changes the nights (design 06: b9, c4). */
export const CAMP_BANNERS: Record<string, [string, string]> = {
  campFerrow: ['The south front falls back', 'What is left of the muster marches from the Stairwarden\'s Bastion now.'],
  campIrontooth: ['The gorge falls quiet', 'Nothing will come over the Gorge Bridge again.'],
}

/**
 * A single running chain. This *is* the tutorial: no text walls, each step
 * points an arrow at the next thing and pays out enough to do it.
 *
 * Campaign 2.0 (design 06, S18): the 46 quests of the five acts in the order
 * the claims come (01 §Pacing targets: acts end near waves 8, 18, 33, 45, the
 * Regent near 50), with a village quest in every act so no stretch runs dry.
 * Rewards are S18's first pass; S20 tunes them.
 */
export const QUESTS: QuestDef[] = [
  // ---- Act I · The Rise (waves 1–8) ------------------------------------
  { id: 'a1', title: 'Pick up the pieces', hint: 'Collect 30 coins from the wreckage',
    goal: { type: 'collect', resource: 'coins', amount: 30 }, reward: { coins: 30, xp: 5 } },
  { id: 'a2', title: 'First timber', hint: 'Build the Lumber Camp',
    goal: { type: 'build', building: 'lumberCamp' }, reward: { coins: 70, wood: 40, xp: 10 } },
  { id: 'a3', title: 'Hands to work', hint: 'Hire 2 workers at the Lumber Camp',
    goal: { type: 'workers', amount: 2 }, reward: { coins: 90, wood: 60, xp: 12 } },
  // Food has to exist before anything that costs food is asked for.
  { id: 'a4', title: 'Bread', hint: 'Build the Homestead Farm',
    goal: { type: 'build', building: 'farm' }, reward: { coins: 120, food: 110, xp: 18 } },
  { id: 'a5', title: 'Hold the bridge', hint: 'Survive the first night: it comes over the Old King\'s Bridge',
    goal: { type: 'survive', wave: 1 }, reward: { coins: 200, wood: 120, xp: 40 } },
  { id: 'a6', title: 'A roof', hint: 'Build the Longhouse',
    goal: { type: 'build', building: 'house' }, reward: { coins: 150, wood: 80, xp: 20 } },
  { id: 'a7', title: 'Steel', hint: 'Build the Barracks',
    goal: { type: 'build', building: 'barracks' }, reward: { coins: 140, food: 90, xp: 24 } },
  { id: 'a8', title: 'Muster', hint: 'Recruit 3 soldiers at the Barracks',
    goal: { type: 'recruit', amount: 3 }, reward: { coins: 180, food: 80, xp: 30 } },
  { id: 'a9', title: 'Stake a claim', hint: 'Claim the Barrow Downs at the North Gate',
    goal: { type: 'claim', region: 'downs' }, reward: { coins: 220, wood: 120, xp: 40 } },
  { id: 'a10', title: 'Dig them out', hint: 'Burn the Barrow Diggers\' camp',
    goal: { type: 'burn', camp: 'campDiggers' }, reward: { coins: 300, wood: 200, stone: 80, xp: 60 } },
  { id: 'a11', title: 'Hearths', hint: 'Build 2 cottages',
    goal: { type: 'build', building: 'cottage', amount: 2 }, reward: { coins: 160, wood: 120, xp: 30 } },
  { id: 'a12', title: 'Timber hall', hint: 'Upgrade the Command Hall to level 2',
    goal: { type: 'upgrade', building: 'townHall', level: 2 }, reward: { coins: 400, stone: 150, xp: 80 } },
  { id: 'a13', title: 'Into the wood', hint: 'Claim Whisperwood',
    goal: { type: 'claim', region: 'whisperwood' }, reward: { coins: 300, wood: 400, xp: 60 } },
  { id: 'a14', title: 'The bridgehead', hint: 'Wall the Bridgehead: every piece and its gate',
    goal: { type: 'line', line: 'bridgehead' }, reward: { coins: 500, stone: 250, metal: 60, xp: 150 } },

  // ---- Act II · The River (waves 9–18) -----------------------------------
  { id: 'b1', title: 'Hollow', hint: 'Claim Hollow Village',
    goal: { type: 'claim', region: 'hollow' }, reward: { coins: 350, wood: 150, xp: 70 } },
  { id: 'b2', title: 'Rotwood burns', hint: 'Burn Rotwood Camp',
    goal: { type: 'burn', camp: 'campRotwood' }, reward: { coins: 450, wood: 200, stone: 100, xp: 90 } },
  { id: 'b3', title: 'Come up', hint: 'Find the survivors in the cellar under the green',
    goal: { type: 'reach', poi: 'survHollow' }, reward: { coins: 250, food: 200, xp: 60 } },
  { id: 'b4', title: 'A light in the dark', hint: 'Build an Outpost',
    goal: { type: 'build', building: 'outpost' }, reward: { coins: 350, wood: 150, xp: 70 } },
  { id: 'b5', title: 'The old roads', hint: 'Travel by waystone',
    goal: { type: 'travel' }, reward: { coins: 250, stone: 80, xp: 60 } },
  { id: 'b6', title: 'Greyfall', hint: 'Claim Greyfall Scarp',
    goal: { type: 'claim', region: 'greyfall' }, reward: { coins: 450, wood: 150, stone: 150, xp: 90 } },
  { id: 'b7', title: 'Good stone', hint: 'Build a Stone Quarry',
    goal: { type: 'build', building: 'quarry' }, reward: { coins: 500, stone: 250, xp: 100 } },
  { id: 'b8', title: 'Three fronts', hint: 'Survive night 14: the gorge is open now',
    goal: { type: 'survive', wave: 14 }, reward: { coins: 600, wood: 300, stone: 150, xp: 120 } },
  { id: 'b9', title: 'Over the bridge', hint: 'Claim the Ferrow Fields',
    goal: { type: 'claim', region: 'ferrow' }, reward: { coins: 550, food: 250, xp: 110 } },
  { id: 'b10', title: 'Break the muster', hint: 'Burn the Ferrow Muster',
    goal: { type: 'burn', camp: 'campFerrow' }, reward: { coins: 700, wood: 300, stone: 150, xp: 140 } },
  { id: 'b11', title: 'Full barns', hint: 'Build the Granary in the Ferrow Fields',
    goal: { type: 'build', building: 'granary', region: 'ferrow' }, reward: { coins: 450, food: 300, stone: 100, xp: 90 } },
  { id: 'b12', title: 'Stone hall', hint: 'Upgrade the Command Hall to level 3',
    goal: { type: 'upgrade', building: 'townHall', level: 3 }, reward: { coins: 800, wood: 600, stone: 300, metal: 60, xp: 160 } },
  { id: 'b13', title: 'Hold the ford', hint: 'Wall the Millford Barricade',
    goal: { type: 'line', line: 'millfordLine' }, reward: { coins: 1000, stone: 400, metal: 100, xp: 200 } },

  // ---- Act III · The Frontier (waves 19–33) ------------------------------
  { id: 'c1', title: 'Old gods', hint: 'Restore a shrine',
    goal: { type: 'restore', amount: 1 }, reward: { coins: 600, stone: 350, xp: 110 } },
  { id: 'c2', title: 'Iron', hint: 'Build an Iron Mine in the Irontooth Foothills',
    goal: { type: 'build', building: 'mine' }, reward: { coins: 700, metal: 150, xp: 140 } },
  { id: 'c3', title: 'Close the gorge', hint: 'Burn Irontooth Warcamp',
    goal: { type: 'burn', camp: 'campIrontooth' }, reward: { coins: 900, wood: 400, stone: 300, metal: 120, xp: 180 } },
  { id: 'c4', title: 'Cap the gorge', hint: 'Wall the Gorge Gate',
    goal: { type: 'line', line: 'gorgeLine' }, reward: { coins: 900, stone: 400, metal: 100, xp: 180 } },
  { id: 'c5', title: 'Wider still', hint: 'Hold 8 regions, the hold among them',
    goal: { type: 'zone', amount: 8 }, reward: { coins: 1000, wood: 400, stone: 300, xp: 200 } },
  { id: 'c6', title: 'The hanged', hint: 'Cut down the Gallows Knight on Gallows Hill',
    goal: { type: 'boss', key: 'gallowsKnight' }, reward: { coins: 1200, metal: 200, crystal: 20, xp: 260 } },
  { id: 'c7', title: 'Grave goods', hint: 'Hold 2 relics: open a barrow, or take one from a stronghold',
    goal: { type: 'relic', amount: 2 }, reward: { coins: 800, stone: 300, metal: 150, xp: 180 } },
  { id: 'c8', title: 'Thirty nights', hint: 'Survive night 30',
    goal: { type: 'survive', wave: 30 }, reward: { coins: 1200, stone: 400, metal: 200, xp: 240 } },
  { id: 'c9', title: 'The salt market', hint: 'Build the Market in Saltmere',
    goal: { type: 'build', building: 'market', region: 'saltmere' }, reward: { coins: 700, wood: 300, stone: 200, xp: 140 } },
  { id: 'c10', title: 'The frontier', hint: 'Hold 10 regions',
    goal: { type: 'zone', amount: 10 }, reward: { coins: 1500, stone: 500, metal: 200, xp: 300 } },
  { id: 'c11', title: 'Bastion hall', hint: 'Upgrade the Command Hall to level 4',
    goal: { type: 'upgrade', building: 'townHall', level: 4 }, reward: { coins: 1500, stone: 600, metal: 250, xp: 320 } },

  // ---- Act IV · The Scar (waves 34–45) -----------------------------------
  { id: 'd1', title: 'The Kettle cools', hint: 'Burn Kettle Warcamp',
    goal: { type: 'burn', camp: 'campKettle' }, reward: { coins: 1000, stone: 400, metal: 150, xp: 220 } },
  { id: 'd2', title: 'A watch on the pass', hint: 'Build the Watch Post over the Kettle Pass',
    goal: { type: 'build', building: 'watchPost', region: 'kettle' }, reward: { coins: 600, wood: 300, stone: 200, xp: 120 } },
  { id: 'd3', title: 'Through the Seamgate', hint: 'Claim Deepvein',
    goal: { type: 'claim', region: 'deepvein' }, reward: { coins: 1200, stone: 400, metal: 150, xp: 260 } },
  { id: 'd4', title: 'First light', hint: 'Build the Crystal Delve',
    goal: { type: 'build', building: 'crystalDelve' }, reward: { coins: 1000, metal: 200, crystal: 30, xp: 240 } },
  { id: 'd5', title: 'The deep market', hint: 'Build the Market in Deepvein',
    goal: { type: 'build', building: 'market', region: 'deepvein' }, reward: { coins: 800, stone: 300, metal: 150, xp: 160 } },
  { id: 'd6', title: 'The Blackened Rim', hint: 'Claim the Blackened Rim',
    goal: { type: 'claim', region: 'rim' }, reward: { coins: 1400, stone: 600, metal: 200, xp: 300 } },
  { id: 'd7', title: 'Cap the Stair', hint: 'Wall the Stair',
    goal: { type: 'line', line: 'stairLine' }, reward: { coins: 1400, stone: 600, metal: 200, xp: 300 } },
  { id: 'd8', title: 'The Stairwarden', hint: 'Break the Stairwarden at his bastion',
    goal: { type: 'boss', key: 'stairwarden' }, reward: { coins: 1800, stone: 400, metal: 300, crystal: 40, xp: 400 } },
  { id: 'd9', title: 'Down the Bonepass', hint: 'Claim Ashgate',
    goal: { type: 'claim', region: 'ashgate' }, reward: { coins: 1600, stone: 600, metal: 250, xp: 340 } },
  { id: 'd10', title: 'Ashgate falls', hint: 'Burn Ashgate Fortress',
    goal: { type: 'burn', camp: 'campAshgate' }, reward: { coins: 2500, stone: 800, metal: 400, crystal: 60, xp: 600 } },

  // ---- Act V · The Crown (waves 46+) --------------------------------------
  { id: 'e1', title: 'Citadel', hint: 'Upgrade the Command Hall to level 5',
    goal: { type: 'upgrade', building: 'townHall', level: 5 }, reward: { coins: 2000, stone: 800, metal: 300, crystal: 30, xp: 500 } },
  { id: 'e2', title: 'Ashgate rebuilt', hint: 'Raise 4 buildings in Ashgate',
    goal: { type: 'settle', region: 'ashgate', count: 4 }, reward: { coins: 1500, stone: 600, metal: 300, crystal: 20, xp: 300 } },
  { id: 'e3', title: 'The Cinder Crown', hint: 'Claim the Cinder Crown',
    goal: { type: 'claim', region: 'crown' }, reward: { coins: 2500, stone: 600, metal: 500, crystal: 60, xp: 600 } },
  { id: 'e4', title: 'Banners on the Crown', hint: 'Raise 3 buildings on the Cinder Crown',
    goal: { type: 'settle', region: 'crown', count: 3 }, reward: { coins: 1500, metal: 300, crystal: 40, xp: 400 } },
  { id: 'e5', title: 'The Regent', hint: 'Cross the causeway and end the Cinder Regent',
    goal: { type: 'boss', key: 'cinderRegent' }, reward: { coins: 7000, crystal: 120, xp: 1400 } },
]

/** Every waystone there can be: an outpost's on each outpost pad, and the lone stones. */
const WAYSTONES_TOTAL = PADS.filter(p => p.key === 'outpost').length + POIS.filter(p => p.kind === 'waystone').length

export const ACHIEVEMENTS = [
  { id: 'a1', title: 'Blooded', desc: 'Defeat 100 enemies', stat: 'kills', amount: 100 },
  { id: 'a2', title: 'Horde Breaker', desc: 'Defeat 1,000 enemies', stat: 'kills', amount: 1000 },
  { id: 'a3', title: 'Warmaker', desc: 'Defeat 5,000 enemies', stat: 'kills', amount: 5000 },
  { id: 'a4', title: 'Captain', desc: 'Recruit 20 soldiers', stat: 'recruited', amount: 20 },
  { id: 'a5', title: 'Timber Baron', desc: 'Produce 10,000 wood', stat: 'woodTotal', amount: 10000 },
  { id: 'a6', title: 'Nightkeeper', desc: 'Survive 10 waves', stat: 'wavesCleared', amount: 10 },
  { id: 'a7', title: 'Beast Slayer', desc: 'Defeat your first boss', stat: 'bossKills', amount: 1 },
  { id: 'a8', title: 'Reclaimer', desc: 'Destroy 5 enemy camps', stat: 'campsCleared', amount: 5 },
  { id: 'a9', title: 'Loremaster', desc: 'Read all 12 lore stones', stat: 'loreRead', amount: 12 },
  { id: 'a10', title: 'Pilgrim', desc: 'Restore all 6 shrines', stat: 'shrinesRestored', amount: 6 },
  { id: 'a11', title: 'Reliquary', desc: 'Hold all 7 relics', stat: 'relicsHeld', amount: 7 },
  // S18: the rest of design 06's deeds
  { id: 'a12', title: 'Heartwood', desc: 'Kill the Thornmother', stat: 'thornmother', amount: 1 },
  { id: 'a13', title: 'Slagbreaker', desc: 'Burn the Slag Forges', stat: 'forges', amount: 1 },
  { id: 'a14', title: 'Surveyor', desc: 'See every region', stat: 'regionsSeen', amount: REGIONS.length },
  { id: 'a15', title: 'Wayfarer', desc: 'Light every waystone', stat: 'waystonesLit', amount: WAYSTONES_TOTAL },
] as const
