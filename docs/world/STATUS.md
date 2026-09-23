# World v2: status ledger

**Next: S08** ([card](sessions/S08-regions-and-claims.md)) · branch `world-v2` (created by S01 from `main` at df51e0f)

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
- **Worker drop-off** (raised by S06): v1 crews stocked their own camp ("the short loop makes the settlement look busy"); design 04 §S06, the blueprint's depot and S06's card send every haul to the depot. Default (landed): the depot, via `buildings.dropoffFor`. Hold crews now walk ~500 px each way; Ferrow farmers ~1,550 px over the bridge until S11 outposts. Returning to v1 is a one-line change in `dropoffFor` (take the worker's camp). Tune in S20 either way.
- **Day length** ([03 §Day and night](design/03-nights-and-camps.md#day-and-night)): default `day = 60 + 10 × claimed regions`, capped at 180 s. Tuned in S20.

## Log

### S07 · Paint the frontier: done (2026-09-23)
- Painters: `Terrain.ts` holds the wash (`BIOME` recipes blended per cell and warped, ~96 px borders; water, ice, banks, cliff face and cast shadow, lava core, crust and glow, per 8 px sample) and the decals (`paintDecals`, batched). `TerrainFeatures.ts` holds feature lines (flow, ripples, cracks, cliff hatching, rubble, shore, crest and lava ink, foam), `paintRoads` and `paintCrossings`. `terrainField.ts` holds the signed distance fields, `cliffS` and contours built from `under`. Props: `world/scatter.ts` (placement) and `art/scatter.ts` (20 `sc_` textures). Map in CONTRACTS §S07.
- Bake cost: steady 5.3 ms per 1024 px chunk (median), p95 6.4, slices ≤ 4.6 ms. Over 528 in-game bakes (two full pans), 3 were over 12 ms: 21.9 on the first chunk after a map-wide jump, plus 12.3 and 12.4. Different chunks spike on each run (GC). A cold boot prime reaches ~15 ms, and `warmTerrain` takes ~140 ms once at scene create. Direct painter passes: max 8.3 ms. The old flat painter took 13–28 ms per chunk.
- 1,019 props (cap 1,500), placed deterministically per chunk, ≥ 100 px from pads and clear of fields, camps (240), POIs and claim stones (90), roads (40) and crossings (96). Highland pines are snow-dusted so nobody tries to chop them.
- For S14's landmarks: use the `bake()` ink style with a 1.6–2 px outline, `groundShadow`, feet 8 px up, depth y, and `culler.add`. Pick tones from the region's `BIOME` recipe. Props leave 90 px around every POI.
- Deviations: roads are Chaikin-smoothed, so they run ≤ ~10 px off the raster's road cells at bends. Drawn shores can sit ≤ 16 px from the nav edge (blurred signed distance fields). The wash is sampled every 8 px (was 4). Any bridge over lava draws as obsidian. `TerrainChunks.stats` gained `chunkMs` and `worstChunkMs` (F2). Verify used 4 screenshots, all composites: 2 of the painter alone, and 2 in-game covering all six card locations. No seams.
- Trips: the TEMP spawn-gate posts still stand by the bridges (S09). HMR reloads sometimes throw S04's `glTexture` null error; a clean load plus a full pan throws none. The claim tint goes after `paintCrossings` and before the set pieces. Saves restored byte-identical. No blueprint moves, no new open decisions.

### S06 · Ally pathing and roads: done (2026-09-23)
- `src/world/PathFind.ts` (A*, pull, LRU, queue), `PathFollower.ts`, `heap.ts` (shared with the fields); `nav.findPath/requestPath/onRoad/allySpeedAt`, `ROAD_SPEED` per CONTRACTS §S06. F2: TOGGLE ROAD TINT; the nav line shows path searches. Harness `H.watch(s)`, `H.run(dx, dy, s)`.
- **`dropoffFor(x, y)` lives on BuildingManager** (depot, else hall door). Workers haul there (see Open decisions), pick nodes by walking distance ≤ 760 from the camp door (cached per camp and node), steer straight when a 5.5 px lane is clear and path otherwise (re-asked after 1.5 s stuck); fleeing workers path to their door. Soldiers: sight of the anchor every ~0.3 s; without it a path to the anchor, re-asked every 1 s or 200 px; a slot in the water becomes the nearest ground.
- Cost: node, 136 claim-to-claim searches avg 0.5 ms, worst 8.8 ms, none past 20k nodes. Browser: worst search 0.6 ms, worst queue tick 0.6 ms (2 ms budget), cache hits outnumber searches ~2:1.
- Verify: farm5 + 2 farmers, 120 s (Ferrow camp burned, enemies cleared every 5 s): 8 deliveries, 144 food, 0 off-ground frames, 1,102 worker-frames on crossings. Uncleared nights 1–3, lumber1 + farm5, 150 s: 21 deliveries, 0 off-ground. 12 soldiers Downs → Greyfall 6.7 s, worst stall 0.5 s; hero across the river, army over the bridge in 7.8 s, stall 0.5 s. Hero 243–251 px/s on the King's Road vs 208–209 off it. Saves restored byte-identical; no console errors after a fresh load.
- Trips: `H.claim` does not burn camps; the Ferrow Muster razes farm5 in ~45 s (`g.camps.load(['campFerrow'])` to test in peace). A* ignores roads (speed only) and buildings (collision + the old detour handle them). A chasing soldier still goes straight and can end at a bank. `workers.incomePerSecond` (AFK catch-up) ignores walking and now overestimates. The two `glTexture` errors from S04 showed once before a reload, not after.
- No blueprint moves. New open decision: worker drop-off (above).

### S05 · NavGrid: done (2026-09-23)
- `src/world/NavGrid.ts` + `NavDebug.ts` per CONTRACTS §S05; `GameScene.nav` ticks after the pause check. Tests: Ferrow Muster → hall over `oldBridge`, a shut toy ring pays through a wall, sliced rebuilds, `slide` never ends off the ground, ford speed, sight lines.
- **How enemies pick a leg** (for S09's `via`): on each retarget (0.35–0.65 s) `EnemyManager.sight` sets `Enemy.los` from `nav.lineClear` to the target, stopping short of its body. `los` → steer straight (today's code); else step to `hallField.nextCell(cell)`'s centre. One field, `'hall'`, is read once per frame at `const hallField` (EnemyManager ~:176); S09 swaps in the enemy's leg there. A walled next cell latches that wall (`latch`, held 1.5 s). The blocker probe still sends sappers/non-walls to attack and flips `los` off on a wall.
- Walls: `BuildingManager.syncNav` (radius 40, pads 62 apart make one band; gates stay free). Built ring + gates: the south raid hit gates 217 and walls 95 samples, nothing stuck off-ground.
- Cost: first hall field 36 ms (boot); a rebuild is 5 slices, worst 5.7 ms in the browser (6.0 in node), ~35–42 ms wall time. 70 walls built in one frame = one rebuild.
- Verify (north gate moved to the Old Bridge through the module's `GATE_BY_ID`): three nights, 4,508 enemy samples at 1 s, **0 off-ground**, 127 on the bridge; hero stops at the river bank, crosses the bridge once Ferrow is claimed, ford speed 59 vs 98 px per 0.5 s (0.6). No console errors. v1/v2 saves and settings restored byte-identical.
- Deviations: collision radius is `min(body/2, 12)` so bosses fit 1-cell passages. Walls stay non-solid for everyone (as before); enemies are held by steering, so separation or knockback can still leak one through a wall band.
- Trips for S06: soldiers steer straight at the hero and snag on banks when he is across water (expected until A*); workers only slide + their old detour. No pad→field line in the data crosses water except quarry2→a greyfall tree field, so worker snags should be rare. The zone barrier (not the NavGrid) stops the hero at a locked region's crossing: claim it before testing a crossing. Early nights spawn at `north` (5000,1900), not the bridge.
- `balance.WORLD` re-export removed. No new open decisions; no blueprint moves.

### S04 · Move in: done (2026-09-23)
- The game runs on the 10240×9216 frontier from `src/config/world/index.ts` (`ZoneId` → `RegionId`, `zone` → `region`, `map.ts` gone); save v2 keys, v1 untouched; `SPAWN_GATES` TEMP until S09.

### S03 · Fog and culling: done (2026-09-23)
- Fog saves as `r:` runs or a `b:` bitset (ceiling `maxEncodedLength`); `FOG_SCALE` 8; `Culler` hides static sprites through `cameraFilter` (register new static objects with `scene.culler.add`).

### S02 · Chunked terrain: done (2026-09-23)
- `paintTerrainRect` + `TerrainChunks` stream 1024 px chunks in 256 px slices (≤4 ms/frame); call `prime` after any camera jump.

### S01 · Blueprint home: done (2026-09-23)
- Blueprint moved to `src/config/world/blueprint.ts`; shared `src/world/raster.ts` and `flow.ts` (options-bag `sealed`); `world:lint`, `world:map` and the blueprint test added; `.claude/` stays untracked.
