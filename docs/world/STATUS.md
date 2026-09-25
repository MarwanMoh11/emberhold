# World v2: status ledger

**Next: S18** ([card](sessions/S18-campaign.md)) · branch `world-v2` (created by S01 from `main` at df51e0f)

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

### S17 · Bosses and the finale: done (2026-09-25)
- C1 (`67220cc`) kits, C2 (`cc4b308`) art, C3 (`76adce6`) finale. Real bosses stand at the strongholds (S10's elite stand-ins gone): gallowsKnight 3500 hp / 30 dmg (every swing cleaves ±66°; telegraphed cleave 150 px ×1.6; 4 grunts at 50%, once), thornmother 3000 / 22, speed 14 (5 thornlings every 6 s, cap 15; root lash 460×64 px ×1.5 + snare ×0.4 1.4 s), seamOverseer 4200 / 24 (whip 180 px, aura +20% speed at 280; whipcrack 180 px ×1.3), stairwarden 5000 / 34 (immune while a bound ash priest lives; the pair rises once, 12 s after the last falls; charge from >180 px, shield bash 120 px ×1.2 up close). All numbers in `KITS` (`systems/bosses.ts`) for S20. Every boss keeps the generic ENRAGED flip at 50%.
- Boss hp persists in `campHealth` under the boss key; the relic drops on the boss's fall (camp burning still grants). The HUD bar takes a boss at its post only within 1100 px of the hero.
- Finale: Ashgate's burning no longer summons the Regent. She rises at `THRONE` when the hero first stands on the unsealed causeway, leashed to the island (820 px), a guard; a reload stands her again with her hp. Her fall: "The maws close", every main approach ends (raids still muster), the victory card plays (`stampVictory`), then free play.
- Verify (harness, one run each): `H.boss` on all four: bar on, camp warded then open, kit move seen (cleave, root lash, whipcrack; bash, and a charge from 300 px), hanged rose, packs 5 → 10 by 8 s, warden 5000 → 5000 while bound, 4500 once broken, rebound 2 after 13 s, not after; relics gallowsBell, thornCrown + heartOakSeed, overseersLash, wardensAegis. `H.regent`: sealed, hero stopped at y 7473; after the burn she rose (hp 9400, bar); fell → `defeated`, live approaches [] (was south), tonight empty, victory card open. Reload: knight 1900 and Regent 6400 hp kept. 2 screenshots (gallery, Regent risen; the second a stale frame, state checked in JSON). User saves restored byte-identical.
- Deviations: the Regent's leash and a risen-flag derived from `finalBossHp` (no new save field). The warden's binding resets on reload (priests rise again). The warden's shield bash is not in the design (it gave the charge a set-up in melee). Relic on the boss's fall, not only the camp's burning. Maws have no sprite, so "closing" is logic and a banner.
- Trips: the victory card pauses the Game scene, so pump nothing after `H.regent` without closing it (`H.ui().closeScreen()`). Unclaimed ground's soft barrier walks the hero out of any fight there; `H.boss`/`H.regent` claim the region first.
- Not measured: fights without god mode, boss damage vs a real army, the knight's cleave on soldiers, art at night. No blueprint moves, no new open decisions.

### S16 · New walkers: done (2026-09-25)
- C1 (`3d77721`) defs and behaviours, C2 (`c519264`) art, C3 (`9425f46`) wiring. bogWretch (hits slow the hero and soldiers to ×0.7 for 1.5 s), thornling (pack 5, splinter burst), ashPriest (ranged 200, aura 220 px: +25% dmg, 10 hp/s to the others), cinderHound (3 s burning patch, 56 px, 14 dps). Pure rules in `systems/walkers.ts`; API in CONTRACTS §S16.
- Blueprint placeholders resolved (campDrowned, campThornmother, campStairwarden, campForges); `resolveSpawnKey` removed; tests reject any bracket.
- **Wave mix for S20** (`WALKER_MIX`, dealt by `mixHand` in WaveManager): the camp's own walker is `CAMP_MIX` 0.3 of its approach; bogWretch tops up to 1 in 4 at Saltmere and Barrowmoor musters; cinderHound 1 in 5 at tier 5+; ashPriest 1 in 12 at tier 4+ and capped there (own share included); thornlings only as the Thornmother's own, each card opening into 5.
- Verify (harness, one run): woke each camp, 13 s: Drowned 2 wretches, Thornmother 5 thornlings, Stairwarden 1 priest, Forges 3 hounds. Wretch hit: hero slow t 1.5, ×0.7, refreshed per hit, lifted after. Priest: grunt 5.7 → 15.6 hp in 1 s, auraDamage 1.25; grunt 600 px off untouched; priest heals 0 itself. Hound death: patch r 56, 14 dps, gone after 3 s. Gallery: all four `enm_` textures (1 screenshot, plus one retaken at a smaller zoom). User saves restored byte-identical.
- Deviations: overlapping auras now take the strongest of each effect (before: the last writer won), which also applies to warlord and commander auras. The priest's aura reuses `aura` with `heal`/`tint` added.
- For S17: a Stairwarden guard stand-in is still `elite`, beside the priests; S15's barrow guardian is also a renamed `elite`.
- Not measured: wave-mix counts over real nights (unit test only), the slow on soldiers in play, hound patches on soldiers, thornling splinters by eye. No blueprint moves, no new open decisions.

### S15 · Points of interest II: done (2026-09-25)
- C1–C2 (`3ac9f3e`), C3 (`48f0cb3`). `Relics` (`scene.relics`: grant/has/list, save `relics`, `relic:granted`), seven relics per 05 with `BOSS_RELICS` on `camp:burned` and `BARROW_RELICS`; relic markers are plinths lit when held. Barrows: hp 220 × tier step, struck by the hero's gathering blow within 70 px, open to a leashed `elite` guardian (tier-scaled), whose fall drops the grave goods (and the relic). Deed a11 Reliquary. Pause page: a Relics strip of wax seals with tooltips. API in CONTRACTS §S15.
- **Every `MOD_STATS` stat now has a reader** (pack.size, soldier.damage, army.speed, rally.cooldown, worker.speed, worker.gather, tower.range, hero.pierce new; wood.yield was S14's).
- Verify (harness, one run): barrowKing opened after ~7.4 s of pumping (18 blows of 12), "BARROW KING" 756 hp / 28.8 dmg, leash 460; its fall gave the Barrow Crown and carry 120 → 138 (×1.15). `H.relicCheck()`: soldier dmg ×1.1, army speed ×1.15, rally cd 34 → 27.2, pierce +1, wood ×1.25, worker speed and gather ×1.15, tower range 250 → 275. Saved, reloaded: 7 relics, markers done, Reliquary earned. 2 screenshots (the strip, 4/7 with a tooltip). User saves restored byte-identical.
- Deviations: relic ids are names (`barrowCrown`…), markers map by `marker`. The Heart-Oak Seed comes with the Thornmother's camp burning, not at the Heart Oak. hero.pierce is the main attack only. The barrow runs its own blow cadence in PoiManager (not `tryHarvest`). A barrow broken open but unplundered is not saved: it reseals at full hp on load, as does one whose guardian leaves the field alive.
- For S16/S17: the guardian is a renamed `elite` (`breakOpen`); a barrow walker could replace it. Real bosses must keep `boss` on `camp:burned`, or the relics stop flowing. A load with burned strongholds and no `relics` grants their relics silently.
- Trips: `H.start` again left the Game scene paused in the hidden pane; `H.ui().togglePause()` before pumping. The unit test opens the barrow in 5.8 s at dt 0.1; the harness took ~7.4 s (S20: `POI.barrow.hp`).
- Not measured: guardian fights by tier, grave-goods values in play, the strip on a landscape phone (compact layout computed, not shot). No blueprint moves, no new open decisions.

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
