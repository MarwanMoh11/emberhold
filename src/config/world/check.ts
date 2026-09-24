/**
 * Compile-time pins between the blueprint, which imports nothing, and the
 * game's own key unions. Nothing imports this file at runtime; tsc checks it
 * because it sits under src/. Camp spawn keys are plain strings in the
 * blueprint, so tests/world-blueprint.test.mjs pins those against ENEMIES.
 */
import type { BuildingKey } from '../buildings'
import type { PadKey } from './blueprint'

/** fishery and tradingPost (S13) are pads before they are buildings; outpost landed in S11. */
type PlannedPadKey = 'fishery' | 'tradingPost'

type Assignable<A extends B, B> = A

/** Fails to compile if a blueprint pad names a building the game doesn't have. */
export type PadKeysAreBuildings = Assignable<Exclude<PadKey, PlannedPadKey>, BuildingKey>
