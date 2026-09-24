# World v2: status ledger

**Next: S12** ([card](sessions/S12-minimap-and-atlas.md)), then S13 · branch `world-v2` (created by S01 from `main` at df51e0f)

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
- **Worker drop-off** (raised by S06): v1 crews stocked their own camp ("the short loop makes the settlement look busy"); design 04 §S06, the blueprint's depot and S06's card send every haul to the depot. Default (landed): the depot, via `buildings.dropoffFor`. Hold crews now walk ~500 px each way; Ferrow farmers ~1,550 px over the bridge until `outFerrow` stands (S11: `dropoffFor` takes the nearest outpost by path). Returning to v1 is a one-line change in `dropoffFor` (take the worker's camp). Tune in S20 either way.
- **Day length** ([03 §Day and night](design/03-nights-and-camps.md#day-and-night)): default `day = 60 + 10 × claimed regions`, capped at 180 s (landed in S09 as `dayLength` in `config/balance.ts`). Tuned in S20.

## Log

### S11 · Outposts and waystones: done (2026-09-24)
- C1: `outpost` building (150c 100w; Lv.2 300c 150 stone, 800 → 1200 hp): log blockhouse, lantern pole, standing stone; `ws_stone` for the lone stones. The 17 outpost pads left `FUTURE_PADS`. `dropoffFor` = depot or nearest standing outpost by path (cached per 256 px block). The hero banks the pack at an outpost.
- C2: `scene.respawnPoint()`; outposts clear ~600 px of fog; Lv.2 heals 5/s within 220 px while no enemy is within 420 (`OUTPOST.heal`, for S14).
- C3: `Waystones` (`scene.waystones`, save `waystones`), travel list `ui/TravelList.ts` in `UIScene` (**S12 replaces it**; see CONTRACTS §S11). Harness `H.stones()`, `H.travel()`.
- Verify (harness, one run, 294×714 pane): lumber2's crew dropped at the depot (5120, 3344) before `outDowns`, at `outDowns` (5000, 1514) after, 8 deliveries in 60 s. Night: outDowns → wsIsle refused ("Night: only the Hall Stone"), → wsHall ok. Day: outDowns → wsHall with 4 of 4 soldiers in 500 px (a 5th at 900 px stayed). Died by outDowns: woke there; with a grunt pinned 220 px from it: woke at the hall. Save → `H.start(true)` kept `[wsHall, outDowns, wsIsle]`. User saves restored byte-identical. 3 screenshots (one over budget: the first two had the list covering the outpost, which led to the fix below).
- Deviations: the Hall Stone starts lit (the night rush home must work before you walk past it). Respawn picks the nearest *safe* outpost, and only if nearer than the hall. "Burning" = struck in the last 6 s (`damageT`) or down. Outpost stones are named after their region. Warning (dusk) still counts as day for travel. The channel also breaks on stepping off the stone. On a narrow screen the list sets `uiBands.card` and the camera frames the hero below it, keeping 150 px, so a 714 px tall pane shows 1 row and "+k more".
- Trips: `dropoffFor` runs a sync `findPath` on each cache miss (only once an outpost stands); cost with many crews far out is S21's. The pickup sweep (`PickupManager`) still only pulls toward the depot. Not measured: the Lv.2 art and aura in play, landscape list placement, travel with a big army.
- No blueprint moves, no new open decisions.

### S10 · Camps 2.0 and fortification lines: done (2026-09-24)
- C1: `CampSpec.tier/leash/wakeRadius/siegeRadius/boss`; patrols (`Enemy.home`) capped at 2 × `spawns.count`, fight only inside the leash, stroll, walk home past it, path round obstacles (never the hall field). Melee patrols besiege structures within 600 px. Strongholds raise a stand-in boss (scaled `elite`, "GALLOWS KNIGHT" etc.) at camp + (0, 90) in `CampManager.spawnGuard` (**S17 swaps it there**); Ashgate rings itself with 3 braziers (`enm_brazier`, 2000 hp, 260 px). The camp is `shielded` (WARDED) until its guards fall. Save `campGuards`; `camp:burned { id, tier, boss }`.
- C2: `src/world/CausewayFire.ts`: 15 flickering flames seal `calderaCauseway` (S05's `setSealed`) until Ashgate burns, then fade; `crossing:opened` → banner "The fire on the causeway dies."
- C3: every `WALLS` line laid by `layWallLine`, gated by region claim and `line.hall`. Pads: bridgehead 23, millfordLine 19, gorgeLine 18, stairLine 21, passLine 15 (palisade 92). `buildings.lineComplete(id)`. `WALL_RING` removed; the minimap strokes the lines.
- Verify (harness, one run): Diggers' patrols chased the hero, then stayed ≤ 302 px of camp after he left (leash 700); a dev farm 420 px from Rotwood was razed by its runners; Ashgate took 0 damage with braziers up (guardsUp 3→2→1→0), then 3000; Gallows warded by its knight; `passableAt(6500, 7655)` false → true on burn, banner fired. All five new lines: `H.wallGaps` 0 nav / 0 body leaks, `lineComplete` true; bridgehead hidden at hall 1, shown at 2; stair hidden at 2. User saves restored byte-identical.
- Deviations: the south route already ran through the bridgehead gate's spot before the line was built (16 px from its centre both ways, 0 wall cells after), so "reroutes" is "still goes through the gate". Archer bands never besiege (arrows sail over structures). Patrols of a burned camp keep strolling its ruin. The stand-in boss has no HUD boss bar (not `def.boss`). 3 screenshots (bridgehead, causeway fire, one hidden-pane miss); no stronghold screenshot.
- Trips: burning Ashgate still spawns the Cinder Regent at the fortress after 1.6 s (v1 `scheduleFinalBoss`; S17 moves her to the island). A fresh-game hero tp'd onto lava is slid ~500 px to ground. Not measured: patrol path cost with many camps awake (S21), assault through each new gate (the gap check stands in).
- No blueprint moves, no new open decisions.

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
- `systems/Approaches.ts` (musters, via legs, 2400 px clamp, `tonight`), forced march 2.4× to claimed ground, `night:warning` routes, `dayLength` (CONTRACTS §S09); first arrivals ~8–14 s after dusk.

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
