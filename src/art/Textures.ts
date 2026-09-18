import Phaser from 'phaser'
import { Pen } from './draw'
import { buildUnitTextures } from './units'
import { buildBuildingTextures } from './buildings'
import { buildPropTextures } from './props'
import { buildFxTextures } from './fx'
import { buildGroundTextures } from './ground'

/**
 * Every pixel in the game is generated here at boot. No external art assets,
 * but the palette and shading rules are shared so it reads as one world.
 * Swapping in hand-made art later means replacing these texture keys only.
 */
export function generateAllTextures(scene: Phaser.Scene) {
  const p = new Pen(scene)
  buildGroundTextures(p)
  buildPropTextures(p)
  buildUnitTextures(p)
  buildBuildingTextures(p)
  buildFxTextures(p)
  p.destroy()
}
