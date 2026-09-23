# World v2: status ledger

**Next: S03** ([card](sessions/S03-fog-and-culling.md)) · branch `world-v2` (created by S01 from `main` at df51e0f)

Keep this file short. The newest entry goes on top. Each entry is 12 lines or fewer, and entries that are 3+ sessions old collapse to one line.

## Decisions

These bind every session. Add a line when one is made, with the date and who decided.

- 2026-09-23 (design): the world is 10240×9216. Nav and region raster cells are 32 px; streaming chunks are 1024 px. The blueprint is the single source of truth, and moving anything more than 120 px is a design change.
- 2026-09-23 (design): enemies never use roads. Roads give +20% speed to the hero, soldiers and workers only.
- 2026-09-23 (design): night spawns clamp to 2400 px of path from claimed ground. Enemies force-march at 2.4× until they reach claimed ground.
- 2026-09-23 (design): development happens on `world-v2`. `main` stays the live v1 game until S22.

## Open decisions

These need the human. Don't guess them. Use the default and flag it in your handoff.

- **v1 saves** ([07-save.md §Migration](design/07-save.md#migration)): the options are the Veteran's charter (default), a clean slate, or keeping v1 playable. Blocks S19 only. Until then, S04's guard keeps v1 saves untouched and starts v2 fresh.
- **Day length** ([03 §Day and night](design/03-nights-and-camps.md#day-and-night)): default `day = 60 + 10 × claimed regions`, capped at 180 s. Tuned in S20.

## Log

### S02 · Chunked terrain: done (2026-09-23)
- `paintTerrainRect(ctx, wx, wy, size, scale)` in `src/world/Terrain.ts` is the deterministic painter (ctx arrives world-transformed; brushwork in texels at S = 0.5). Per-biome colour is `biomeAt`/`TONES`/`toneAt`, per-biome marks `markAt`. Scatter is dealt per 128 px cell from `strokeRng(cell, k)`; roads, plaza, camp scorch and gates are laid out once. `buildTerrain` is gone; `buildVellumTexture` untouched.
- `src/world/TerrainChunks.ts` streams 1024 px chunks per CONTRACTS §S02. GameScene constructs it where buildTerrain was, calls `prime(cam)` after centring on the hero, and `update(cam)` every frame (before the pause check). F2 shows held/queued/baked and bake ms.
- Deviations: chunks bake in 256 px slices (a whole chunk is ~10 ms, over the 4 ms budget); added `prime()`, and `frameMs`/`worstFrameMs` in `stats()`. Textures go in with `textures.addImage`, since `addCanvas`'s CanvasTexture reads every pixel back (1-4 ms per chunk).
- Old map check: 12 chunks, slices 0.7-1.7 ms, worst streaming frame 3.5 ms. Mean colour at hall, zone border and Ashgate is identical to before; per-pixel difference 3-5/255 (the scatter moved). The step across chunk borders is no larger than across any other column.
- Trips: the painter still reads `WORLD` (balance) and `ZONES/PADS/CAMPS/SPAWN_GATES/WALL_RING` (map); S04 swaps those for the blueprint and gives the chunks the new world size. S03's Culler must not register the chunk Images, which TerrainChunks owns. Call `prime` after any camera jump.
- No sprite needed absorbing: Terrain.ts drew none. The minimap never read the terrain texture, so nothing is left for S12. No new open decisions.

### S01 · Blueprint home: done (2026-09-23)
- Branch `world-v2` created from `main` (df51e0f). `docs/world/` committed as "Chart the new frontier".
- Blueprint moved to `src/config/world/blueprint.ts`; typecheck green with no data changes. `check.ts` pins pad keys to `BuildingKey`.
- `src/world/raster.ts` (rasterise, geometry, `blockedWithin`, `T`) and `src/world/flow.ts` (flowField, descend, nearestPassable, `step`, `NB8`): no Phaser, type-only blueprint import. Nothing in game code imports them yet.
- New `road` layer: 2,088 cells. The game doesn't read it until S06.
- Signature change from the tool's JS: `sealed` is now an options bag, `flowField(r, src, { sealed, cost })`, `descend(r, f, from, { sealed })`, `nearestPassable(r, x, y, { sealed })`. `passable(i, sealed?)` is unchanged. CONTRACTS §S01 updated.
- Port proof: every tool mode and `map.svg` are byte-identical apart from the blueprint path. terrain, under, crossing, region, passable, slowCost and both flow fields match the old code cell for cell.
- `render.mjs` loads the modules with top-level `await loadTs(...)`, so anything that imports it (the test does) pays about 0.1 s of esbuild.
- `npm run world:lint`, `npm run world:map` and `tests/world-blueprint.test.mjs` added (6 tests: lint clean, raster size, roads, routes reach the hall, `via` order, spawn keys).
- `.claude/` stays untracked on purpose. No deviations from the blueprint, and no new open decisions.
