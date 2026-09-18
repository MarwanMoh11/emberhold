export type ResourceType = 'coins' | 'wood' | 'food' | 'stone' | 'metal' | 'crystal'

export const RESOURCE_ORDER: ResourceType[] = ['coins', 'wood', 'food', 'stone', 'metal', 'crystal']

export type ResourceBag = Partial<Record<ResourceType, number>>

export type EntityKind = 'player' | 'soldier' | 'worker' | 'enemy' | 'building' | 'node'

/** Anything the combat system can hit. */
export interface Targetable {
  id: number
  kind: EntityKind
  x: number
  y: number
  radius: number
  hp: number
  maxHp: number
  alive: boolean
  /** returns true if this hit killed it */
  applyDamage(amount: number, srcX: number, srcY: number, knockback?: number): boolean
}

export interface GridItem {
  x: number
  y: number
  alive: boolean
}

export const bagAdd = (into: ResourceBag, from: ResourceBag, mult = 1): ResourceBag => {
  for (const k of Object.keys(from) as ResourceType[]) {
    into[k] = (into[k] ?? 0) + (from[k] ?? 0) * mult
  }
  return into
}

export const bagScale = (b: ResourceBag, mult: number): ResourceBag => {
  const out: ResourceBag = {}
  for (const k of Object.keys(b) as ResourceType[]) out[k] = Math.ceil((b[k] ?? 0) * mult)
  return out
}

export const bagTotal = (b: ResourceBag): number => {
  let t = 0
  for (const k of Object.keys(b) as ResourceType[]) t += b[k] ?? 0
  return t
}

export const bagEmpty = (b: ResourceBag): boolean => bagTotal(b) <= 0
