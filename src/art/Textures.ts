import Phaser from 'phaser'
import { buildUnitTextures } from './units'
import { buildBuildingTextures } from './buildings'
import { buildPropTextures } from './props'
import { buildScatterTextures } from './scatter'
import { buildFxTextures } from './fx'
import { buildIconTextures } from './icons'

/**
 * Every pixel in the game is painted here at boot, through the ink toolkit in
 * ink.ts. No external art assets — but one set of shading, outlining and grain
 * rules, so it all reads as one hand-inked chronicle. Swapping in hand-made
 * art later means replacing these texture keys only.
 */
export function generateAllTextures(scene: Phaser.Scene) {
  buildFxTextures(scene)
  buildPropTextures(scene)
  buildScatterTextures(scene)
  buildBuildingTextures(scene)
  buildUnitTextures(scene)
  buildIconTextures(scene)
}
