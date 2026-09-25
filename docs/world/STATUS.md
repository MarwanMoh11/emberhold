# World v2: status ledger

**Next: S13b, resume at C4** ([card](sessions/S13b-village-buildings.md)), then S13c · branch `world-v2` (created by S01 from `main` at df51e0f)

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
- **Cottage population cap** (raised 2026-09-25, orchestrator): default (landed) none. `VILLAGE.cottagePopMax` in `config/balance.ts` (`Infinity`); a number there caps all cottages together.
- **Markets sell surplus for coins** (raised 2026-09-25, orchestrator): default (landed) yes, above 300 food and wood, 3 goods a coin. `VILLAGE.market.sells` (and `floor`, `goodsPerCoin`) in `config/balance.ts`; `false` idles every market.
- **Day length** ([03 §Day and night](design/03-nights-and-camps.md#day-and-night)): default `day = 60 + 10 × claimed regions`, capped at 180 s (landed in S09 as `dayLength` in `config/balance.ts`). Tuned in S20.

## Log

### S13b · Village buildings: partial, done through C3 (2026-09-25)
- C1–C3 (`dbf7794`, one commit): keys, defs and first-pass costs for `cottage granary mill market chapel watchPost docks` (05's Lv.1 costs; later levels, hp and footprints mine). `VILLAGE` in balance: radii, caps, the two open decisions. Pads (101 now): `market1 chapel1 cottage1 granary1 mill1` on the West Gate green (hold, outside the palisade where the West and Wood Roads part), `watchDowns` on the King's Road, `docks1` by `fishery1`. Lint: `watchPost` in `DEFENCE`, `NEEDS.docks = 'fish'`; 0/0.
- Effects (CONTRACTS §S13b): `dropoffFor(x, y, res?)` (granary within its `reach` 900 straight line, first), `localBonus`, `haulMultiplier` (applied at delivery and to sheltered output), `slotsOf`, `marketRateOf`, `nightBlessing`, `watchCovers`; WaveManager rings the warning early (`beginWarning(extra)`). Dock hints via `villageHint`. Ink art for all seven (a `wheel` look for mills, unused until C4 sets it). Harness `H.lvl(id, lvl)`.
- Fix: healing auras (infirmary, outpost Lv.2, chapels) moved to `buildings.auras(dt)`, called after `army.update`: `healAllies` inside `update` only ever found the hero.
- Verify (harness, one run each, day held): cottage +2/+3 pop; `farm1`'s 2 farmers unload at `granary1` (4380, 3434), mean haul 422 → 330 px, 16 → 23 deliveries in 120 s; mill credited/raw ×1.167 at Lv.1 (want 1.15), ×1.333 at Lv.3, granary Lv.2 ×1.111; market 18 coins in 60 s at 0.3/s, stopped at food 300 / wood 301; night reward 140 → 154 → 168 (chapel Lv.1, Lv.2); swordsman 10 → 18 hp in 4 s by the chapel, none without; `watchDowns` lit (reveal disc 200 = 600 px) and `night:warning` at 11.99 s left vs 8.00 without (routes south + north); docks: `fishery1` slots 2 → 3. 1 screenshot (the green). User saves restored byte-identical.
- **C4 left for the resumed session**: `STYLE_BY_BIOME`, palette per bake, roof tones, yard props, lazy `ensureBuildingTexture`, the 12-cottage dev helper, the `bld_` count, and the card's other 2 screenshots (styles; the docks). The painters read `VL` (`VillageLook` in `art/buildings.ts`), which C4 sets per bake; everything else still uses the `const` palette.
- Trips: the green's granary sits outside the palisade, farm1 inside: with the West wall built, farm1's haulers still pick it (straight-line reach) and walk round by the West Gate. Mill rounding is per delivery (±0.5 of ~18). `waves.skipToDay` from the warning leaves `phase` as `warning` (harness only).
- For S20: every cost past Lv.1, the market's 3 goods a coin, chapel mend 2/4 hp/s.

### S13 · Fish and trade: done (2026-09-25)
- C1+C2 (`e08d5a6`, one commit; a cut-off session never logged it): `world/fish.ts` `placeFish` puts shoals on water/sea cells (never a deck), each with a bank gather point `gx, gy` reachable from its fishery; every node has `gx, gy`. `NODE_DEFS.fish` (food), `fishery` (3 levels, 100c 80w, the farm's rates and hp), `fisher` crew (a farmer's numbers, `fishes: true`); fish fields and fishery pads joined the game.
- C3 (`5bcd635`): `tradingPost` (0.6 / 1.2 / 2.0 coins/s; costs 400c 300w 120s → 900c 500w 300s → 2000c 700s 200m), quay warehouse art with a lit lamp; `buildings.tradeIncome()` (1; **S14 wires `trade.income` there**), `tradeRateOf`, `tradeRate`; panel hint and Coins/s upgrade line. `FUTURE_PADS` deleted; `check.ts` pins every `PadKey`.
- Verify (harness, one run each): Hollow claimed, `fishery1` Lv.1, 2 fishers: +72 food and 4 deliveries in 60 s of day, 0 of 120 samples on water, gathering at (3691, 4320) and (3775, 4302) on the bank. Saltmere claimed, `trade1`: exactly 18 / 36 / 60 coins in 30 s at Lv.1 / 2 / 3 (counted at `tickTrade`); panel read "+2.0 coins a second". 2 screenshots (one behind the auto-pause menu; one of the jetty with both fishers on the bank). User saves restored byte-identical.
- S20: fisheries haul to the depot until an outpost stands (`fishery1` → depot is ~1,700 px; ~1 delivery per fisher a minute), so food per fisher is well under a farmer's; trade 2.0/s at Lv.3 against its 2000c cost, and the 6 s coin popup.
- Trips: claiming a far region on day 1 by harness (`H.claim`) makes night 1 take the hall of an idle hero (baseline without claims holds); pump in day windows. The auto-pause on a hidden pane opens the pause menu: `H.ui().togglePause()`.
- Not measured: a fishery on the lake or harbour fields in play, the Lv.2–3 art in play, trade with the hall down.
- No blueprint moves, no new open decisions.

### S12 · Minimap and atlas: done (2026-09-25)
- C1: `Minimap` is a local 2400 px window, north up: crops of `atlas_bake` and the world's own fog page (`fog_live`, saved by RegionManager), marks at 9 Hz (pads, seen camps/POIs, stones, bodies, tonight's routes, hero). Seen ground is `ChartMemory` (256 px), shared with the atlas.
- C2: `AtlasBake` paints the world at 1/16 (640 × 576) through `paintAtlasRect` (low detail) after the visible chunks, ≤2.5 ms a frame; a claim re-queues its box (9 blocks for Downs). **Bake: 79–93 ms of painting over ~100–116 ms wall, worst frame 3–4 ms.**
- C3: `Atlas` (full screen, pauses the game): explored borders and names (≥6 seen cells), claim state, camps (burned crossed), POIs, outposts, stones, routes, the quest walk, the hero; drag, pinch, wheel. Tap a lit stone to travel; controller Back opens, d-pad cycles, A travels, B closes. `TravelList` deleted; a Travel chip opens the atlas from a stone. The quest arrow follows `questRoute` (nav path) off screen. API in CONTRACTS §S12.
- Verify (harness, one run each): atlas opens in 0.9–3.9 ms; desktop click wsHall → wsIsle travelled; mobile (375×812) synthetic touch: pinch ×2.3, drag pans, tap on wsIsle started the channel and closed the atlas; gamepad Back/right/A travelled wsIsle → wsHall, B and ESC close. Minimap marks rebuild 0.1–0.3 ms (at 9 Hz; the old per-tick RT bake is gone). Fog crop checked by pixel sample (clear at the hero, vellum at the edge). User saves restored byte-identical. 2 screenshots (the game with its minimap at 1280×800; the mobile atlas zoomed out), not the card's 3: the README caps it at 2.
- Deviations: the Map chip opens the atlas (the minimap no longer folds away; on a phone it is 127 px). The old world's footprint (optional) is not drawn. Region names show after 6 seen cells, so the hold's neighbours are named once looked into, not at boot.
- Trips: a render-texture crop in Phaser 3.90 is top-down like any texture (don't mirror y). `DockBands.card` has no writer now. After a waystone arrival `here` was sometimes null on the phone run (S11 arrival ring vs `touch` 56; not investigated). S14: set `POI_GLYPH[kind]` and add `gs.pois` (`poiState` picks it up).
- Not measured: old-vs-new minimap frame cost side by side, a river-bending quest route by eye, landscape phone layout.
- No blueprint moves, no new open decisions.

### S11 · Outposts and waystones: done (2026-09-24)
- `outpost` building, `dropoffFor` to the nearest outpost by path, `respawnPoint`, `Waystones` (save `waystones`), fog light; CONTRACTS §S11.

### S10 · Camps 2.0 and fortification lines: done (2026-09-24)
- `CampSpec.tier/leash/wakeRadius/siegeRadius/boss`, patrols and stand-in bosses (`CampManager.spawnGuard`, **S17 swaps them**), `CausewayFire`, every `WALLS` line laid, `buildings.lineComplete(id)`; save `campGuards`.

### S09b · Walls and panels: done (2026-09-24)
- `layWallLine` (palisade 92 pads, NavGrid capsules, `H.wallGaps` 0 leaks) and the docked panel (`DockSheet`, `CostChips`, `StatLine`, compact `PlateButton`; CONTRACTS §S09b).

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
