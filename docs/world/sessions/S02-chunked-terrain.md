# S02 · Chunked terrain

**Goal.** Replace the single world-sized terrain canvas with streamed 1024 px chunks. Do it **on the old map**, which must look the same afterwards. This makes a 10240 px world possible at all.

**Depends on.** S01 (branch only).

**Size.** Medium to large. `Terrain.ts` is the biggest read (about 7k tokens). You may read it whole, because you are replacing it.

## Read first
- [04-systems.md §Chunked terrain](../design/04-systems.md#chunked-terrain-s02)
- [CONTRACTS.md §S02](../CONTRACTS.md#s02-terrain-chunks)
- `src/world/Terrain.ts` (whole). Note which parts are:
  - ground noise (the `FIELD` array);
  - zone tints;
  - decals;
  - props/sprites;
  - `buildVellumTexture`. Leave that one alone; fog uses it.
- `src/scenes/GameScene.ts`: `grep -n "buildTerrain\|terrain\|Terrain"`, and read ±15 lines around each hit.
- The memory note on browser testing (in the auto-memory index): the harness pump stalls title tweens, and pane screenshots go stale.

## Do

**C1 · A deterministic painter**
1. Split Terrain's drawing into `paintTerrainRect(ctx, wx, wy, size, scale)`. It may depend only on world coordinates and static config.
2. Replace the precomputed global noise field with a seeded value-noise function of world `(x, y)`. It must reproduce the look, not the exact pixels.
3. Anything that is a sprite (props, trees) stays outside the painter.

**C2 · Streaming**
1. Add `src/world/TerrainChunks.ts` per CONTRACTS:
   - an LRU of `maxResident` (24);
   - a nearest-first bake queue within `bakeBudgetMs` (4);
   - chunk canvases at `scale` 0.5;
   - 16 px overdraw, clipped.
2. Each chunk is a Phaser `Image` from a canvas texture. Destroy the texture on eviction.
3. In GameScene:
   - construct it where `buildTerrain` was;
   - call `.update(camera)` each frame;
   - before play starts, bake every chunk visible at spawn synchronously, so there is no pop-in.

**C3 · Stats**
1. Show `chunks.stats()` in the F2 debug panel (`grep -n "F2\|debug" src/scenes/UIScene.ts`).
2. Log any bake that takes more than 12 ms once, with `console.warn`.

## Out of scope
- New-world art (that is S07).
- Fog (S03).
- The minimap, which still reads whatever it read before. If it read the old terrain canvas, give it a one-off low-resolution bake from the painter instead, and note it for S12.

## Done when
- The old map looks the same to the eye at three spots: the hall, a zone border and the Ashgate corner. Check with before and after screenshots.
- No chunk seams are visible.
- The debug panel shows 24 or fewer chunks resident while you pan across the map.
- No frame spends more than 4 ms baking during steady play.
- Tests and typecheck are green.

## Verify
- Screenshot "before" first, at `scale: 0.5`, **before** you change anything.
- Drive the camera with `javascript_tool` (`gs().cameras.main.centerOn(x, y)`), using the harness `pump` to advance frames. Read `chunks.stats()` back as JSON.
- Four screenshots at most.

## Handoff
- Record the painter's signature and where the per-biome colour logic lives. S04 and S07 will paint the new world through it.
- Note any sprite that the painter could not absorb.
