# World v2: status ledger

**Next: S06** ([card](sessions/S06-ally-pathing.md)) · branch `world-v2` (created by S01 from `main` at df51e0f)

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
- The game runs on the 10240×9216 frontier from `src/config/world/index.ts` (CONTRACTS §S04); `map.ts` deleted. `ZoneId` → `RegionId`, and every `zone` field (pads, camps, clusters, `Building`, `ResourceNode`) is `region`. The hero starts at `HALL` + 340 px south.
- Files: config/{balance, world/index, world/blueprint (header comment only)}, entities/{Building, Player}, scenes/GameScene, systems/{Building, Camp, Enemy, Node, Quest, Save, Wave, Zone}Manager, ui/{Minimap, RunSummary}, world/Terrain, dev/harness; tests/{world-module (new), save-portability}.
- **`balance.ts` re-exports `WORLD`** for this card only: S05 removes the line. `WORLD.centerX/Y` is now the map's middle (5120, 4608), not home; every old use moved to `HALL`.
- **`SPAWN_GATES` are TEMP until S09**: the six card positions, all inside still-locked regions (ferrow, barrowmoor, irontooth, downs, greyfall, saltmere). Terrain still draws the gate posts.
- ZoneManager: `zoneAt` reads the region raster; locked regions are one filled polygon plus a fence on shared borders, both culled. Claim points are the blueprint's `claim` (no more margin projection). The soft barrier aims at the nearest border with claimed ground behind it, else the hall (so `H.tp` into the wild walks you home).
- Terrain is flat v2: atlas biome colours dimmed for a lit scene, water/sea/cliff/lava straight from the raster (sample jittered ±14 px so 32 px cell stairs read as a ragged shore), crossings on top, blueprint roads at 60% plus the hold's footpaths. Marks borrow the old sets per biome (`MARK`). Vellum sketches and names each region; its page noise is sampled 2× coarser and smoothed. Minimap bakes 320×288 and fills region polygons (S12 replaces it).
- Save v2 per CONTRACTS; a v1 save is never touched. Browser: `H.start()` boots at the hall in ~0.4 s, lumber1 → quest q5 by night 1, nights 1–4 with no console errors while the hero defends (idle, the six seed grunts plus night 1 raze the hall), v2 save → `H.start(true)` restored regions/wave/buildings, v1 and settings byte-identical throughout (test save removed afterwards).
- Trips for S05: enemies walk over water and cliffs, and EnemyManager still steers at `WALL_RING` gates (gateN/S/E/W now). The Old Bridge is the first night's route only by coincidence of the south gate. Quest guidance ignores enemies in locked regions, which is where every gate is.
- Watch: two `glTexture` null errors appeared once in the session's first page load and never again (fresh load, four nights, teleports corner to corner with chunk eviction, zoom-out). Not traced. No new open decisions; no blueprint moves.

### S03 · Fog and culling: done (2026-09-23)
- Fog encoding: the shorter of `r:` runs (base64url varints) and `b:` unpadded base64 bitset; bare base64 (v1) still loads. Measured on 10240×9216: 30% explored in blobs 799 chars, a walked trail clearing 30% of the view 1,040. Fully explored: every cell marked is 6 chars, but a walk that clears the whole map marks ~28% of cells in trails and falls back to the bitset, the 3,842 ceiling (`maxEncodedLength`). Old map ceiling is 398, and a v1 save's 396-char fog still validates and loads.
- `validSave` uses `FogMemory.maxEncodedLength(WORLD…)` in place of 10000. Tests cover both world sizes, the legacy string and damaged strings. Browser: new game, walk, save, reload, `H.start(true)` restored the fog string exactly (189 chars, `r:`).
- `FOG_SCALE` 4 → 8 (RT 426×350 now, 1280×1152 after S04); brush `2 / FOG_SCALE`. Edge ramp measured at ~240 world px, as before. The vellum keeps its noise at world scale and deals its ink marks a quarter as often; its names and symbols read blurrier at 8 px/texel (S07 may want to repaint it).
- `Culler` per CONTRACTS §S03: nodes, building sprites and ghosts, camp labels; F2 "static N drawn N culled". Old map: 391 static, ~270 drawn at the hall, ~60 in a corner. A 1,560-step walk corner to corner never had a culled object inside the view.
- Deviation: the culler hides through `cameraFilter`, not `visible`/`active`, because game logic sets `visible` (felled rocks, ghosts) and would get it clobbered. No game logic reads a culled sprite's `visible`; `Building.visible` is the manager's own flag.
- Trips for S04: register anything new and static (POIs, border stones, region labels) with `scene.culler.add`; ZoneManager's zone banners and post graphics are not registered. Rebuild the vellum from regions. No new open decisions.

### S02 · Chunked terrain: done (2026-09-23)
- `paintTerrainRect` + `TerrainChunks` stream 1024 px chunks in 256 px slices (≤4 ms/frame); call `prime` after any camera jump.

### S01 · Blueprint home: done (2026-09-23)
- Blueprint moved to `src/config/world/blueprint.ts`; shared `src/world/raster.ts` and `flow.ts` (options-bag `sealed`); `world:lint`, `world:map` and the blueprint test added; `.claude/` stays untracked.
