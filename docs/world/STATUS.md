# World v2: status ledger

**Next: S21** ([card](sessions/S21-performance.md)) · branch `world-v2` (created by S01 from `main` at df51e0f)

Keep this file short. The newest entry goes on top. Each entry is 12 lines or fewer, and entries that are 3+ sessions old collapse to one line.

## Decisions

These bind every session. Add a line when one is made, with the date and who decided.

- 2026-09-23 (design): the world is 10240×9216. Nav and region raster cells are 32 px; streaming chunks are 1024 px. The blueprint is the single source of truth, and moving anything more than 120 px is a design change.
- 2026-09-23 (design): enemies never use roads. Roads give +20% speed to the hero, soldiers and workers only.
- 2026-09-23 (design): night spawns clamp to 2400 px of path from claimed ground. Enemies force-march at 2.4× until they reach claimed ground.
- 2026-09-23 (design): development happens on `world-v2`. `main` stays the live v1 game until S22.
- 2026-09-24 (human): slow the macro pace to about 1.5× (acts end near waves 8, 18, 33 and 45; the Regent near wave 50, about 2.5–3 h of game clock), but keep the micro loop tight: a reward every 30–60 s, a quest or milestone every 3–5 min, and every night a clear win with a reward. Targets are in [01 §Pacing](design/01-world.md#pacing-targets); S18 and S20 honour them.
- 2026-09-24 (human): by the endgame every region, the hold included, is dense with buildings and reads as one settled country. Seven village building types, regional styles, and pads from 94 to ~238 ([05 §A settled country](design/05-content.md#a-settled-country-s13b-s13c)); S13c may add pads, and `world:lint` must stay clean.
- 2026-09-25 (human): **let go of v1 completely.** v2 is the main game. There is no migration, no Veteran's charter and no "old frontier": v2 ignores every v1 key (it never reads, migrates or deletes them) and every player starts fresh. S19 drops design 07's migration options and keeps the schema consolidation and portability. When the work is complete, the game ships as **Beta 1**: a version label on the title screen and in the save's metadata, landed by S19 and shipped by S22. **Landed (S19):** v1 keys untouched (tested), design 07 §Migration closed, `GAME_VERSION` on the title and in `meta.version`.
- 2026-09-25 (human): run length stays as landed: more waves, the Regent near wave 50, and `day = 60 + 10 × claimed` capped at 180 s. Longer days were declined. This settles S20's C3 (day length): no new formula proposed.
- 2026-09-25 (human): worker drop-off (depot, outpost or granary), the cottage population cap (`VILLAGE.cottagePopMax`, none today) and markets selling surplus (`VILLAGE.market.sells`, on today) are **S20's call**. Choose whatever balances best against the pacing decision above, and record the choice in S20's entry. **Landed (S20):** depot/outpost/granary drop-off kept; `cottagePopMax` 150; markets sell, as a trickle.
- 2026-09-26 (human): **keep the dawn rout.** A night ends 40 s into the fight (`DAYNIGHT.fightGrace`), and any walkers still out flee at dawn and drop their loot; bosses stay.
- 2026-09-26 (human): S20's acceptance missed twice on the late game, and the human accepted the tuning as it stands and moved on to S21. **S22 owns the late-game check:** its real playthrough must confirm the hold survives waves 15–50 (towers included, three or more fronts), that Ashgate's 18000 hp fortress is burnable for d10, that the tier-3–5 claim cost rise holds past w21, and that act II's 9–10 min gap before the Ferrow Muster burns closes. Tune whatever breaks before the merge.

## Open decisions

These need the human. Don't guess them. Use the default and flag it in your handoff.

_(none open)_

## Log

### S20 · Balance and pacing: done (2026-09-26, two passes)
- Pass 1 (`3f3e090`, `c8a4cf6`, `452ae61`): `H.probe` (`src/dev/probe.ts`, headless ~50×); region/hall costs ~1.6×, camp hp 1.5×, `WAVE_PACE` 1.5, `OPENS` 8/12/17, `nightReward = 50 + 17w`; village calls: drop-off at depot/outpost/granary, `cottagePopMax` 150, markets sell a trickle.
- Pass 2 (`743e556` … `047847b`): tier-1/2 claims cost wood (downs 250c 700w … ferrow 1600c 2400w 400f); act I–II quest coins cut ~35%; tier 3 ×2.2, tier 4 ×3, tier 5 ×2.5 coins. **Survive gates resolved** (human's 6-min cap, balance delegated): b8 "Three fronts" builds 2 Watch Posts, c8 "Old lights" restores 3 shrines. **Night length:** `fightGrace` 40 plus the dawn rout (see Open decisions). Probe: keeps pop room for its army, rebuilds and upgrades barracks.

| Probe (wave, clock) | Target | Pass 1 | Pass 2 |
|---|---|---|---|
| downs · whisperwood · hollow | 3 · 6 · 9 | 1 · 1 · 2 | 2–3 · 7 · 9–12 |
| greyfall · ferrow | 12 · 16 | 5 · 14 | 12–15 · 13–16 |
| act II · act III from | w9 16 min · w19 42 min | w2 · w19 58 min | w8 15–16 min · w18–21 41–47 min |
| act IV · crown (old tier-3–5 costs) | w34 90 min · w48 | not run | w25 62 min · w32 (w33 at 91 min) |
| night length | ~50 s | ~85 s | 51–59 s |
| longest quest/milestone gap, act II | ≤ 6 min | 13 min (b8) | 9–10 min (b10 burn waits on army) |

- **Hold and acts III–V:** with the old tier-3–5 costs the probe held to w36 and stalled on d10 (Ashgate fortress, 18000 hp, beyond the probe's army). After the price rise, the hold fell from w23: 13–17 level-1 swordsmen and no towers against three fronts. So the rise is measured only to w21, and the Regent was never reached. Earlier runs fell at w8, w11–16 and w20. The probe varies a lot from run to run.
- For S21/S22: in the probe the hold is a coin flip from w15 (fronts 3, up to 300 walkers out at dawn). Check it with a real playthrough, then ease `waves.ts` at 3+ fronts or teach the probe to build towers. Probe trips: a visibility pause stops `run` (resume the Game scene). `run` longer than ~27 s of wall time times out `javascript_tool`. The probe saves over the real save, so back it up.

### S19 · Save v2: done (2026-09-25)
- C1 (`6765c87`) schema, limits, tests; C2 (`21636cb`) Beta 1 on the title, docs. **Implemented the decision: v1 let go** (no migration, charter, chest or old frontier; the card's C2 dropped). v1 keys are never read, written or deleted; a test holds it.
- `SaveBlobV2` is the one schema. `validShape` is strict on types and ranges; `tolerate` drops unknown ids (pads incl. laid wall pieces, worker homes, soldiers, upgrades, regions, camps, guards, boss hp, waystones, POIs, relics), keeps each once, one `console.warn`. Fog `r:`/`b:` only (v1 bare bitset gone), ≤ 3842. CONTRACTS §S19; save-fields table consolidated with owners.
- **64 KB enforced on read and write.** Raw, a maxed frontier (every pad, 343 workers, 150 soldiers, full fog) was ~105 KB, so `save()` writes a compact form (whole px and hp, defaults and `carryType` left out): ~56 KB. Past 64 KB workers and soldiers lose their places (walk out from home) before a save is refused.
- `GAME_VERSION = 'Beta 1'` (`config/version.ts`): top right of the title, `meta.version` in every save. S22 ships it.
- Tests: every field round-trips, a blueprint edit drops ids, v1 untouched, oversized refused, maxed fits, download → import. POI and relic tests now expect drops, not refusals.
- Verify (browser, one run; the pane's storage was empty and is restored empty): title shows BETA 1 (1 screenshot); new game → save (18.4 KB, meta Beta 1) → reload → load at the same x/y, coins, quest a2; a planted v1 key untouched; `H.buildAll` save 19.5 KB.
- Deviations: unknown ids in `regions`, `camps`, `waystones`, `pois`, `relics` etc. no longer refuse a save (CONTRACTS said they did). Workers and soldiers reload within 0.5 px of where they stood.
- For S20: save size grows ~80 B per worker; a cottage cap far past ~340 workers makes saves go lean (places lost), not fail. Not measured: a real late-game save's size, import on a phone. No blueprint moves, no new open decisions.

### S18 · Campaign 2.0: done (2026-09-25)
- C1–C2 (`fe79a1e`), C3 (`a4c5fca`). Goals claim, burn, restore, relic, reach, travel, line, settle (+ `build.region`); `zone` = regions held incl. the hold. All read world state, not events, so dev claims and loads agree. `targetFor` per card; pure candidates in `systems/questAnchors.ts`; a test puts every quest's targets on passable ground. `act:begun` banners, ribbons queue, deeds a12–a15, quest log shows the current act. CONTRACTS §S18.
- **Chain: 53 quests** (06's 46 + 7 village: a11 cottages, b11 Ferrow granary, c9 Saltmere market, d2 Kettle watch post, d5 Deepvein market, e2 settle Ashgate 4, e4 settle Crown 3). **Deviations:** ids renumbered in chain order within each act; "Three fronts" moved up to b8 (after Greyfall opens the gorge) and acts III–V reordered so a quest waits on at most one claim (III: shrine, mine, Irontooth burned, gorge line, then zone 8; IV opens on the Kettle); survive waves moved to the 1.5× pace: "Three fronts" night 14 (was 10), "Thirty nights" night 30 (06: "Twenty nights", 20). Banners on campFerrow/campIrontooth burning (`CAMP_BANNERS`), not on the quest.
- Verify (harness, one run): new game plays "Act I · The Rise" (1 screenshot); `H.questStep(27)` finished a2…b13 and c1, banners II and III; the arrow's route to Irontooth 10 points. The user's v2 save (old `q1`) loaded at a2 with no banners or rewards. Saves restored byte-identical.
- **For S20, rewards (first pass, `QUESTS[].reward`):** act I 30–500 coins (xp 5–150), II 250–1000 (60–200), III 600–1500 (110–320), IV 600–2500 (120–600), V 1500–7000 (300–1400); wood/stone/metal/crystal grow alongside. **Likely slow:** survive goals (b8, c8) and zone goals (c5, c10) only wait; a14 bridgehead (23 pads, ~1.4k wood) in act I; a5 night 1 comes before the barracks; e2/e4 settle counts.
- Trips: `H.start` pumps 0.6 s, so a1 (30 coins) is done before a script reads the chain; hook banners via `H.quests()` before stepping. `travel` counts journeys this session only (not saved). `QuestManager.load` no longer has the v1 q20→Regent patch; S19's migration owns v1.
- Not measured: real-play pacing per act (S20), the arrow over long routes by eye, the quest log on a phone. No blueprint moves, no new open decisions.

### S17 · Bosses and the finale: done (2026-09-25)
- Stronghold bosses (`KITS` in `systems/bosses.ts`, hp in `campHealth`), the Regent at `THRONE` on the unsealed causeway, victory card, maws close; CONTRACTS §S16 and S17.

### S16 · New walkers: done (2026-09-25)
- bogWretch, thornling, ashPriest, cinderHound (`systems/walkers.ts`), wave mix `WALKER_MIX`/`CAMP_MIX` for S20; overlapping auras take the strongest of each effect; CONTRACTS §S16.

### S15 · Points of interest II: done (2026-09-25)
- `Relics` (`scene.relics`, save `relics`), barrows with leashed guardians, deed a11, every `MOD_STATS` stat read, the pause page's relic strip; CONTRACTS §S15.

### S14 · Points of interest I: done (2026-09-25)
- `PoiManager` (`scene.pois`, save `pois`), `Modifiers` (`scene.mods`), caches, lore, shrines, landmarks, survivors; deeds a9, a10; CONTRACTS §S14.

### S13c · A settled country: done (2026-09-25)
- Pads 101 → 244 via `render.mjs --free` (`freeSpots`), villages at the claim stones, lint 0/0; `H.buildAll(lvl)`; texture cap 160 holds with 0 fallbacks.

### S13b · Village buildings: done (2026-09-25)
- Seven village keys (`cottage`, `granary`, `mill`, `market`, `chapel`, `watchPost`, `docks`) and their effects, regional looks (`art/looks.ts`, `systems/BuildingLooks.ts`, cap 160 `bld_` textures); CONTRACTS §S13b.

### S13 · Fish and trade: done (2026-09-25)
- `world/fish.ts` shoals and bank points, `fishery` + `fisher`, `tradingPost` (`tradeIncome`, `tradeRateOf`, `tradeRate`); CONTRACTS §S13.

### S12 · Minimap and atlas: done (2026-09-25)
- Local `Minimap` (2400 px, `ChartMemory`), `AtlasBake` (1/16), full-screen `Atlas` with travel from lit stones; API in CONTRACTS §S12.

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
