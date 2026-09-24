# World v2: status ledger

**Next: S09b** ([card](sessions/S09b-walls-and-panels.md)), then S10 · branch `world-v2` (created by S01 from `main` at df51e0f)

Keep this file short. The newest entry goes on top. Each entry is 12 lines or fewer, and entries that are 3+ sessions old collapse to one line.

## Decisions

These bind every session. Add a line when one is made, with the date and who decided.

- 2026-09-23 (design): the world is 10240×9216. Nav and region raster cells are 32 px; streaming chunks are 1024 px. The blueprint is the single source of truth, and moving anything more than 120 px is a design change.
- 2026-09-23 (design): enemies never use roads. Roads give +20% speed to the hero, soldiers and workers only.
- 2026-09-23 (design): night spawns clamp to 2400 px of path from claimed ground. Enemies force-march at 2.4× until they reach claimed ground.
- 2026-09-23 (design): development happens on `world-v2`. `main` stays the live v1 game until S22.
- 2026-09-24 (human): slow the macro pace to about 1.5× (acts end near waves 8, 18, 33 and 45; the Regent near wave 50, about 2.5–3 h of game clock), but keep the micro loop tight: a reward every 30–60 s, a quest or milestone every 3–5 min, and every night a clear win with a reward. Targets are in [01 §Pacing](design/01-world.md#pacing-targets); S18 and S20 honour them.
- 2026-09-24 (human): by the endgame every region, the hold included, is dense with buildings and reads as one settled country. Seven village building types, regional styles, and pads from 94 to ~238 ([05 §A settled country](design/05-content.md#a-settled-country-s13b-s13c)); S13c may add pads, and `world:lint` must stay clean.

## Open decisions

These need the human. Don't guess them. Use the default and flag it in your handoff.

- **v1 saves** ([07-save.md §Migration](design/07-save.md#migration)): the options are the Veteran's charter (default), a clean slate, or keeping v1 playable. Blocks S19 only. Until then, S04's guard keeps v1 saves untouched and starts v2 fresh.
- **Worker drop-off** (raised by S06): v1 crews stocked their own camp ("the short loop makes the settlement look busy"); design 04 §S06, the blueprint's depot and S06's card send every haul to the depot. Default (landed): the depot, via `buildings.dropoffFor`. Hold crews now walk ~500 px each way; Ferrow farmers ~1,550 px over the bridge until S11 outposts. Returning to v1 is a one-line change in `dropoffFor` (take the worker's camp). Tune in S20 either way.
- **Day length** ([03 §Day and night](design/03-nights-and-camps.md#day-and-night)): default `day = 60 + 10 × claimed regions`, capped at 180 s (landed in S09 as `dayLength` in `config/balance.ts`). Tuned in S20.

## Log

### Plan amended after the playtest (2026-09-24)
- Inserted S09b (wall gaps; compact docked panel), and S13b and S13c (village buildings; a settled country). Pacing was slowed in 01, and S10, S14, S18, S20 and S21 were updated to match. No code changed.

### S09 · Nights 2.0: done (2026-09-24)
- `src/systems/Approaches.ts` (pure, tested on the real raster): musters along chains (camp → maw → closed), routes down each via field then the hall's, the 2400 px clamp, `live`/`tonight` (opens rules, fronts per night, one raid), `splitBudget`. Gates, `GateId` and the gate posts are gone; `WaveDef.approaches` is an optional preferred-fronts list. API in CONTRACTS §S09.
- Spawns scatter 120 px around `spawnPoint` and march at 2.4× down their legs, deaf until hit, until the first claimed cell. Muster-tier scaling; 30% of each approach is its camp's walker; a raid takes 30%. Fight window from the first arrival or 25 s; `day = 60 + 10 × claimed` (≤ 180). Warning: `night:warning`, "Tonight: …" banner, ember dotted routes (ground within 1200 px, above the lightmap; minimap).
- **Arrivals** (first on claimed ground, s after dusk, harness): wave 1 south 8.6–9.0 (three fresh runs); wave 5 + hollow: south 7.5–8.5, west 10.1–12.8 over Millford (barrowmoor › hollow › hold); wave 12, hold only: south 9.5, east 12.5 (Gorge Bridge), west 14.0 (Millford). 0 enemies off the ground in every run. Grunts walk 76 px/s on and off roads. `H.burn('campFerrow')` → south musters at Stairwarden (5904, 6288). Save → `H.start(true)` keeps wave and day; user saves restored byte-identical. 5 screenshots (one over budget: two were stale frames).
- Deviations: raids don't count against fronts per night. A hit ends the march (normal speed) but the walker keeps its via legs until claimed ground. Legs also switch on the crossing itself (NavGrid via fields target every crossing cell). Saved `phaseT` clamps at 0 (a long night went below the validator's −1). The terrain-chunk budget test now retries with backoff: it flaked ~1 run in 4 before S09 and 3 in 4 with the new test file.
- Trips: via fields build at scene create (~36 ms each, 3 of them), so every NavGrid version bump now rebuilds 4 fields in slices. Claiming a region with an awake raid camp inside it (downs → campDiggers) spawns that raid on claimed ground, so the fight starts at dusk. Ferrow is tier 2: wave 1 grunts have ×1.5 hp, ×1.3 damage (S20). Camp patrols still don't march or cap (S10). `H.claim` used S04 names and silently failed; fixed. Marching bosses skip their abilities until they arrive. No routes looked wrong in play. No blueprint moves, no new open decisions.

### S08 · Regions and claims: done (2026-09-24)
- `RegionManager` (was ZoneManager; scene field `regions`, `zones` getter alias only for S09 to delete, no caller left): `claimed/claimedAt/claimMask/canClaim/claim`, reasons hall → adjacent → camps → cost with tooltip lines; `region:claimed`, `camp:burned` (renamed events), new `camp:woke`. API in CONTRACTS §S08.
- Border stones (`claim_stone`, lit gold once claimed; the hold has none) replace the flag, dark overlay and rope fence. Claim = fanfare + HUD region banner (name + blurb) + repaint. `src/world/claimTint.ts`: one Path2D fill of unclaimed polygons (saturation blend 0.35, black 0.15) and dotted polygon borders, after the crossings. Measured on Downs ground: saturation ×0.61, lightness ×0.90 (after grain and vignette).
- **Claim cost:** the claim's own work (flags, mask of 92k cells, `invalidate(claimRect)`) 0.1–0.3 ms, 1.8 ms on the first. Ferrow's box re-baked 12 wanted chunks in 39 frames (~1.3 s), frame ≤ 4.2 ms, chunk median 5.5 ms (tint cost is noise). Old chunk images stay until the new bake publishes, so colour arrives chunk by chunk.
- Camps: all 15 start `asleep` (no Enemy, so untargetable; a dimmed `enm_camp` sprite, banked fire light). Wake on claim or hero ≤ 900 px, for good. Save `campAwake`; any camp with `campHealth` loads awake.
- Verify (harness): ferrow `hall` at hall 1; claimed after the hall upgrade, 5 pads available; rim `camps` until campFerrow burns; Kettle asleep at 956 px, awake at 856 px; claims and awake camps survived save + `H.start(true)`. 4 screenshots (stone tooltip; hold–downs contrast + sleeping Rotwood as a composite). Saves restored byte-identical.
- Deviations: node "fields" stay visible in unclaimed ground (unharvestable, as before); only the ground is tinted, not props or nodes. Unexplored borders draw too but sit under the fog.
- Trips: a woken camp spawns uncapped patrols (every `spawns.every`) even in unclaimed ground: S10 owns the 2× cap and leash. `H.tp` near a camp wakes it for good. Upgrading the hall in the harness: `H.tp` to the hall and `buildings.commitUpgrade(hall)` each pump (`H.build` doesn't commit upgrades). `zonesNextTarget` skips regions failing `adjacent`/`camps`. No blueprint moves, no new open decisions.

### S07 · Paint the frontier: done (2026-09-23)
- Painters: `Terrain.ts` holds the wash (`BIOME` recipes blended per cell and warped, ~96 px borders; water, ice, banks, cliff face and cast shadow, lava core, crust and glow, per 8 px sample) and the decals (`paintDecals`, batched). `TerrainFeatures.ts` holds feature lines (flow, ripples, cracks, cliff hatching, rubble, shore, crest and lava ink, foam), `paintRoads` and `paintCrossings`. `terrainField.ts` holds the signed distance fields, `cliffS` and contours built from `under`. Props: `world/scatter.ts` (placement) and `art/scatter.ts` (20 `sc_` textures). Map in CONTRACTS §S07.
- Bake cost: steady 5.3 ms per 1024 px chunk (median), p95 6.4, slices ≤ 4.6 ms. Over 528 in-game bakes (two full pans), 3 were over 12 ms: 21.9 on the first chunk after a map-wide jump, plus 12.3 and 12.4. Different chunks spike on each run (GC). A cold boot prime reaches ~15 ms, and `warmTerrain` takes ~140 ms once at scene create. Direct painter passes: max 8.3 ms. The old flat painter took 13–28 ms per chunk.
- 1,019 props (cap 1,500), placed deterministically per chunk, ≥ 100 px from pads and clear of fields, camps (240), POIs and claim stones (90), roads (40) and crossings (96). Highland pines are snow-dusted so nobody tries to chop them.
- For S14's landmarks: use the `bake()` ink style with a 1.6–2 px outline, `groundShadow`, feet 8 px up, depth y, and `culler.add`. Pick tones from the region's `BIOME` recipe. Props leave 90 px around every POI.
- Deviations: roads are Chaikin-smoothed, so they run ≤ ~10 px off the raster's road cells at bends. Drawn shores can sit ≤ 16 px from the nav edge (blurred signed distance fields). The wash is sampled every 8 px (was 4). Any bridge over lava draws as obsidian. `TerrainChunks.stats` gained `chunkMs` and `worstChunkMs` (F2). Verify used 4 screenshots, all composites: 2 of the painter alone, and 2 in-game covering all six card locations. No seams.
- Trips: the TEMP spawn-gate posts still stand by the bridges (S09). HMR reloads sometimes throw S04's `glTexture` null error; a clean load plus a full pan throws none. The claim tint goes after `paintCrossings` and before the set pieces. Saves restored byte-identical. No blueprint moves, no new open decisions.

### S06 · Ally pathing and roads: done (2026-09-23)
- `PathFind` (A*, LRU, queue) + `PathFollower`; `nav.findPath/requestPath/onRoad/allySpeedAt`, `ROAD_SPEED`; `buildings.dropoffFor` (depot) per CONTRACTS §S06; harness `H.watch`, `H.run`.

### S05 · NavGrid: done (2026-09-23)
- `NavGrid` + `NavDebug` (CONTRACTS §S05): walls via `BuildingManager.syncNav`, enemies steer on `los` else `hallField.nextCell` (EnemyManager ~:176, S09 swaps the leg there).

### S04 · Move in: done (2026-09-23)
- The game runs on the 10240×9216 frontier from `src/config/world/index.ts` (`ZoneId` → `RegionId`, `zone` → `region`, `map.ts` gone); save v2 keys, v1 untouched; `SPAWN_GATES` TEMP until S09.

### S03 · Fog and culling: done (2026-09-23)
- Fog saves as `r:` runs or a `b:` bitset (ceiling `maxEncodedLength`); `FOG_SCALE` 8; `Culler` hides static sprites through `cameraFilter` (register new static objects with `scene.culler.add`).

### S02 · Chunked terrain: done (2026-09-23)
- `paintTerrainRect` + `TerrainChunks` stream 1024 px chunks in 256 px slices (≤4 ms/frame); call `prime` after any camera jump.

### S01 · Blueprint home: done (2026-09-23)
- Blueprint moved to `src/config/world/blueprint.ts`; shared `src/world/raster.ts` and `flow.ts` (options-bag `sealed`); `world:lint`, `world:map` and the blueprint test added; `.claude/` stays untracked.
