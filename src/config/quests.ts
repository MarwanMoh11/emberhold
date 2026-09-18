import type { ResourceBag } from '../core/types'
import type { BuildingKey } from './buildings'

export type QuestGoal =
  | { type: 'kill'; amount: number }
  | { type: 'collect'; resource: 'coins' | 'wood' | 'food' | 'stone' | 'metal' | 'crystal'; amount: number }
  | { type: 'build'; building: BuildingKey; amount?: number }
  | { type: 'upgrade'; building: BuildingKey; level: number }
  | { type: 'recruit'; amount: number }
  | { type: 'workers'; amount: number }
  | { type: 'survive'; wave: number }
  | { type: 'camp'; amount: number }
  | { type: 'zone'; amount: number }
  | { type: 'level'; amount: number }

export interface QuestDef {
  id: string
  title: string
  /** short imperative shown under the objective banner */
  hint: string
  goal: QuestGoal
  reward: ResourceBag & { xp?: number }
}

/**
 * A single running chain. This *is* the tutorial: no text walls, each step
 * points an arrow at the next thing and pays out enough to do it.
 */
export const QUESTS: QuestDef[] = [
  { id: 'q1', title: 'Pick up the pieces', hint: 'Collect 30 coins from the wreckage',
    goal: { type: 'collect', resource: 'coins', amount: 30 }, reward: { coins: 30, xp: 5 } },

  { id: 'q2', title: 'First timber', hint: 'Build the Lumber Camp',
    goal: { type: 'build', building: 'lumberCamp' }, reward: { coins: 70, wood: 40, xp: 10 } },

  { id: 'q3', title: 'Hands to work', hint: 'Hire 2 workers at the Lumber Camp',
    goal: { type: 'workers', amount: 2 }, reward: { coins: 90, wood: 60, xp: 12 } },

  // Food has to exist before anything that costs food is asked for.
  { id: 'q4', title: 'Something to eat', hint: 'Build the Homestead Farm',
    goal: { type: 'build', building: 'farm' }, reward: { coins: 120, food: 110, xp: 18 } },

  { id: 'q5', title: 'Somewhere to stack it', hint: 'Build the Warehouse',
    goal: { type: 'build', building: 'warehouse' }, reward: { coins: 150, wood: 80, xp: 20 } },

  { id: 'q6', title: 'Muster', hint: 'Build the Barracks',
    goal: { type: 'build', building: 'barracks' }, reward: { coins: 140, food: 90, xp: 24 } },

  { id: 'q7', title: 'A line to hold', hint: 'Recruit 3 soldiers at the Barracks',
    goal: { type: 'recruit', amount: 3 }, reward: { coins: 180, food: 80, xp: 30 } },

  { id: 'q8', title: 'Hold the ridge', hint: 'Survive the first night',
    goal: { type: 'survive', wave: 1 }, reward: { coins: 220, wood: 120, xp: 45 } },

  { id: 'q9', title: 'Eyes on the road', hint: 'Build a Watchtower',
    goal: { type: 'build', building: 'watchtower' }, reward: { coins: 200, wood: 150, xp: 35 } },

  { id: 'q10', title: 'Push the fence out', hint: 'Claim a new territory',
    goal: { type: 'zone', amount: 1 }, reward: { coins: 250, wood: 150, xp: 45 } },

  { id: 'q11', title: 'Burn them out', hint: 'Destroy an enemy camp',
    goal: { type: 'camp', amount: 1 }, reward: { coins: 400, wood: 200, stone: 80, xp: 70 } },

  { id: 'q12', title: 'Raise the hall', hint: 'Upgrade the Command Hall to level 2',
    goal: { type: 'upgrade', building: 'townHall', level: 2 }, reward: { coins: 400, stone: 150, xp: 80 } },

  { id: 'q13', title: 'Loose the arrows', hint: 'Build the Archery Range',
    goal: { type: 'build', building: 'archeryRange' }, reward: { coins: 350, food: 200, xp: 70 } },

  { id: 'q14', title: 'Break the beast', hint: 'Survive wave 5',
    goal: { type: 'survive', wave: 5 }, reward: { coins: 800, stone: 250, metal: 60, xp: 150 } },

  { id: 'q15', title: 'Stone on stone', hint: 'Build the Stone Quarry',
    goal: { type: 'build', building: 'quarry' }, reward: { coins: 500, stone: 250, xp: 100 } },

  { id: 'q16', title: 'Sharpen everything', hint: 'Build the Blacksmith',
    goal: { type: 'build', building: 'blacksmith' }, reward: { coins: 600, metal: 60, xp: 110 } },

  { id: 'q17', title: 'A real army', hint: 'Field 12 soldiers at once',
    goal: { type: 'recruit', amount: 12 }, reward: { coins: 800, food: 400, xp: 140 } },

  { id: 'q18', title: 'Walls of Emberhold', hint: 'Raise 6 rampart sections',
    goal: { type: 'build', building: 'wall', amount: 6 }, reward: { coins: 700, stone: 400, xp: 130 } },

  { id: 'q19', title: 'Warlord', hint: 'Survive wave 10',
    goal: { type: 'survive', wave: 10 }, reward: { coins: 2500, metal: 300, crystal: 30, xp: 400 } },

  { id: 'q20', title: 'Frontier secured', hint: 'Destroy Ashgate Fortress',
    goal: { type: 'camp', amount: 5 }, reward: { coins: 5000, metal: 800, crystal: 80, xp: 900 } },
]

export const ACHIEVEMENTS = [
  { id: 'a1', title: 'Blooded', desc: 'Defeat 100 enemies', stat: 'kills', amount: 100 },
  { id: 'a2', title: 'Horde Breaker', desc: 'Defeat 1,000 enemies', stat: 'kills', amount: 1000 },
  { id: 'a3', title: 'Warmaker', desc: 'Defeat 5,000 enemies', stat: 'kills', amount: 5000 },
  { id: 'a4', title: 'Captain', desc: 'Recruit 20 soldiers', stat: 'recruited', amount: 20 },
  { id: 'a5', title: 'Timber Baron', desc: 'Produce 10,000 wood', stat: 'woodTotal', amount: 10000 },
  { id: 'a6', title: 'Nightkeeper', desc: 'Survive 10 waves', stat: 'wavesCleared', amount: 10 },
  { id: 'a7', title: 'Beast Slayer', desc: 'Defeat your first boss', stat: 'bossKills', amount: 1 },
  { id: 'a8', title: 'Reclaimer', desc: 'Destroy 5 enemy camps', stat: 'campsCleared', amount: 5 },
] as const
