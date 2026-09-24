# World v2: status ledger

**Next: S10** ([card](sessions/S10-camps-and-lines.md)), then S11 · branch `world-v2` (created by S01 from `main` at df51e0f)

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

### S09b · Walls and panels: done (2026-09-24)
- C1–C2 (walls): `src/world/wallLine.ts` (`layWallLine`, `capDiscs`, `legacyRingPads`). The palisade is 92 pads: `palisade.0`–`palisade.87` (76 runs, 12 posts on corners and jambs) plus gateN/E/S/W. NavGrid capsules via `setBlockerDiscs` (discs every 16 px, r 28); `Building.boxDy/boxHW/boxHH`; end-on `bld_wall_v_*`, `bld_wallpost_*`, side-on `bld_gate_v_*`. Old `wall\d+` saves remap to the nearest piece. `H.wallGaps`: 0 nav and 0 body leaks at L1 and L3, and after an old-id load; `H.assault` from N, E, W and NE never got in unbroken.
- C3 (`f0cb901`): `src/ui/dock.ts`, re-exported by skin: `DOCK`, `DockSheet` (a bottom sheet in portrait, a right column otherwise; collapsed or expanded, remembered per page session; publishes `uiBands.dock`), `CostChips`, `StatLine`, compact `PlateButton`. The camera eases toward the dock's `focus` and back.
- C4: `BuildingPanel` draws the unchanged `PanelView` into a DockSheet (header: title and UPGRADE, or the funding bar on a site; body: stat, cost chips, unit chips, hint, hold-to-demolish). The border stone's card is its own sheet within 220 px of the stone, and the world label is just the name. `H.panel()`, `H.tap()`. API in CONTRACTS §S09b.
- Verify (375×812, one run): barracks collapsed frac 0.072, expanded 0.282; hall 0.169; wall piece 0.16; Downs stone 0.169 and 0.072 collapsed. No overlap with the building, stone or hero in any; every target ≥ 44×44; minFont 12. Synthesised taps fired upgrade (committed), pickUnit, raze (hold, then release), expand and collapse. Leaving a pad clears `uiBands.dock` and the camera shift eases to 0. Screenshot at L3: the west run reads as one stone wall through the gateW gatehouse and around the SW corner.
- Not measured (S20/S21): desktop fracs at 1280×800 and 1920×1080 (the token cap says ≤ 0.20), the right-side dock, L2 wall art by eye, and paying at a stone through the new card (the claim path itself is unchanged).
- Trips: the browser pane's localStorage was empty before the smoke run and now holds a dev `emberhold.save.v2` (5000 of each resource); clearing it was refused by the permission classifier, so delete it by hand if it matters. Locked unit chips fire `pickUnit`, but `setTrains` refuses them (by design). `BuildingManager.destroyPanel` has no caller (pre-existing; the UI scene's shutdown tears the sheets down). The minimap still draws the ring from `WALL_RING`.
- For S10: lay the other `WALLS` lines with `layWallLine` (ids `${line}.${k}`); `WALL_RING` can go once every line is laid. Later panels (S11, S13, S13b, S15) use only `DockSheet`, `CostChips`, `StatLine` and compact `PlateButton`.
- Deviations (from C1): capsules stay 48 px straight-line from a gate's centre; the remap is piece-centric (72 px, or 128 px beside a gate). No blueprint moves, no new open decisions.

### Plan amended after the playtest (2026-09-24)
- Inserted S09b (wall gaps; compact docked panel), and S13b and S13c (village buildings; a settled country). Pacing was slowed in 01, and S10, S14, S18, S20 and S21 were updated to match. No code changed.

### S09 · Nights 2.0: done (2026-09-24)
- `src/systems/Approaches.ts` (pure, tested on the real raster): musters along chains (camp → maw → closed), routes down each via field then the hall's, the 2400 px clamp, `live`/`tonight` (opens rules, fronts per night, one raid), `splitBudget`. Gates, `GateId` and the gate posts are gone; `WaveDef.approaches` is an optional preferred-fronts list. API in CONTRACTS §S09.
- Spawns scatter 120 px around `spawnPoint` and march at 2.4× down their legs, deaf until hit, until the first claimed cell. Muster-tier scaling; 30% of each approach is its camp's walker; a raid takes 30%. Fight window from the first arrival or 25 s; `day = 60 + 10 × claimed` (≤ 180). Warning: `night:warning`, "Tonight: …" banner, ember dotted routes (ground within 1200 px, above the lightmap; minimap).
- **Arrivals** (first on claimed ground, s after dusk, harness): wave 1 south 8.6–9.0 (three fresh runs); wave 5 + hollow: south 7.5–8.5, west 10.1–12.8 over Millford (barrowmoor › hollow › hold); wave 12, hold only: south 9.5, east 12.5 (Gorge Bridge), west 14.0 (Millford). 0 enemies off the ground in every run. Grunts walk 76 px/s on and off roads. `H.burn('campFerrow')` → south musters at Stairwarden (5904, 6288). Save → `H.start(true)` keeps wave and day; user saves restored byte-identical. 5 screenshots (one over budget: two were stale frames).
- Deviations: raids don't count against fronts per night. A hit ends the march (normal speed) but the walker keeps its via legs until claimed ground. Legs also switch on the crossing itself (NavGrid via fields target every crossing cell). Saved `phaseT` clamps at 0 (a long night went below the validator's −1). The terrain-chunk budget test now retries with backoff: it flaked ~1 run in 4 before S09 and 3 in 4 with the new test file.
- Trips: via fields build at scene create (~36 ms each, 3 of them), so every NavGrid version bump now rebuilds 4 fields in slices. Claiming a region with an awake raid camp inside it (downs → campDiggers) spawns that raid on claimed ground, so the fight starts at dusk. Ferrow is tier 2: wave 1 grunts have ×1.5 hp, ×1.3 damage (S20). Camp patrols still don't march or cap (S10). `H.claim` used S04 names and silently failed; fixed. Marching bosses skip their abilities until they arrive. No routes looked wrong in play. No blueprint moves, no new open decisions.

### S08 · Regions and claims: done (2026-09-24)
- `RegionManager` (`claimed/claimAt/claimMask/canClaim/claim`, events `region:claimed`, `camp:burned`, `camp:woke`), border stones, `world/claimTint.ts`; camps start asleep and wake on claim or hero ≤ 900 px (save `campAwake`); CONTRACTS §S08.

### S07 · Paint the frontier: done (2026-09-23)
- Painters `Terrain.ts` (wash, decals) and `TerrainFeatures.ts` (feature lines, `paintRoads`, `paintCrossings`); props via `world/scatter.ts` + `art/scatter.ts`; bake ~5.3 ms per chunk (CONTRACTS §S07).

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
