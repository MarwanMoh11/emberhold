# World v2: status ledger

**Next: S15** ([card](sessions/S15-poi-two.md)) · branch `world-v2` (created by S01 from `main` at df51e0f)

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

### S14 · Points of interest I: done (2026-09-25)
- C1–C3 in one commit (`66fd6fd`) plus the lore page's placement. `PoiManager` (`scene.pois`): seen when fog clears within `POI.seeR` 420 (hook in `RegionManager.eraseFog`; landmarks also within 1300 of the hero), done on use, save `pois` (done ids; seen rebuilt from fog). `Modifiers` (`scene.mods`). Atlas glyph per kind; names under seen landmarks and shrines. Deeds a9 Loremaster, a10 Pilgrim. Art in `art/pois.ts`. Harness `H.pois()`, `H.poi(id, s)`.
- **Wired stats:** food.yield (farm, fishery) and wood.yield (lumber camp) in `haulMultiplier` after mill × granary, and in `incomePerSecond`; trade.income (`tradeIncome`); wall.hp (`Building.hpMod`, set by GameScene; `refreshWallHp` on restore); hero.xp; hero.regen; soldier.hp (new recruits; standing soldiers bumped on restore); infirmary.heal; outpost.heal. **Pending for S15:** hero.pierce, soldier.damage, army.speed, rally.cooldown, worker.speed, worker.gather, pack.size, tower.range.
- Verify (harness, one run): Harvest restored by standing (drip): farm1 income 3.444 → 3.961 food/s (×1.150), haul ×1.00 → ×1.15. survHollow locked (`campRotwood`) until the burn, then +6 pop; survFerrow put 2 free farmers on farm1; survSalt waited on the Light. Cache, lore, landmark (Vents), Springs, Light all done; saved and reloaded: same counts, 3 mods, pop +10, trade ×1.2. 2 screenshots (lore page; Light restored); user saves restored byte-identical.
- Deviations: a landmark is **done** when the hero reaches its foot (220 px) — the card wants every kind doable. Lore: stand 1 s (05), the page stays 5.5 s (a 1 s toast is unreadable). **survSalt's "free trader"**: no trader crew exists, so the lamp-keeper takes a crew slot (fishery first). Free crew need a camp with room, else they are lost (popup). Kettle Springs adds the infirmary Lv.1 heal (9) to every outpost, Lv.1 included. A half-paid shrine refunds on stepping off; its drip (~1.5 s) is not saved.
- Barrows and relics: tracked (seen, atlas glyph) but no sprite or verb; S15 adds them to `LIVE` in PoiManager.
- Trips: right after `H.start`, the Game scene can sit paused (the hidden pane's auto-pause), so `H.poi` pumps nothing; unpause (`H.ui().togglePause()`) or call `gs().pois.update(dt)`. Card's third screenshot (a landmark through the fog) not taken (README cap): the silhouette's state was checked in JSON; the portrait pane's view (~900 × 630 world px) barely holds a fogged landmark, since the hero's brush clears ~480 px.
- Not measured: delivery counts with the shrine (60 s windows crossed dusk), loot per tier in play, landmark art at night, the coast reveal on the atlas by eye. No blueprint moves, no new open decisions.

### S13c · A settled country: done (2026-09-25)
- C1 (`7b2779f`): `render.mjs --free <region> [--near] [--key] [--n]` (`freeSpots`): greedy spots passing every pad rule, plus road 70 px, claim stones 120 px and camp siege 600 px (CONTRACTS §S13b). C2–C4: pads 101 → **244**, every one from `--free`, lint 0/0. Built vs 05: hold 34/34, downs 16/16, whisperwood 12/12, hollow 17/16, greyfall 12/12, ferrow 18/18, frostmere 16/15, saltmere 16/16, irontooth 14/14, barrowmoor 13/12, kettle 12/12, deepwood 11/10, deepvein 12/12, rim 11/10, ashgate 12/12, crown 9/8, cinderfall 9/9. About a third open at the next hall. Tests pin the targets (±2) and the village rule. Props 1018 → 975. `H.buildAll(lvl)` added.
- Villages stand at the claim stones (the card's rule: 6+ pads within 600 px), so the West Gate green runs on into Hollow's and Whisperwood's hamlets. 05's named villages at the outposts get the outlying pads (Rimewatch, the harbour market and docks, Rustgate). **Ashgate and Cinderfall:** the maws at their pass mouths leave 4 and 1 spots near the stones, so their villages stand round Ashfall and Slagwatch.
- Snapshot for S21 (harness, all 17 claimed, all 244 pads Lv.1, 60 s from dawn; the last seconds crossed dusk): 244 standing, 26 workers, Culler 2969 static (349 shown), harness step p50 1.3 ms / p95 5.1 ms (CPU per step in the desktop pane, not fps), paths 53 searches, 0 failed, worst 0.4 ms; 784 nodes (farms add fields).
- Texture cap: 52 variants at Lv.1 and at max in one run, **0 fallbacks**, 148 of 160 `bld_`. Cap unchanged, so no new memory; 12 slots of headroom.
- Trips: the lint lets a cottage stand 450 px from a camp, but `CAMP_SIEGE` is 600, and 2 first-pass pads fell in 60 s; `--free` keeps non-tower pads 600 px off camps the region doesn't need burned (6 moved). `cottageR1`/`chapelR` stand 456 px from campFerrow, which Rim needs burned. Deepvein's and Ashgate's granaries (05 asks for them) have no farms in reach (S20).
- Not measured: fps with the pane visible or on a phone, the texture peak during ordinary upgrades, loading a real save with the new pads (load skips pads it doesn't list). 2 screenshots (Downs village; Ferrow's east farmstead and windmill); map.svg redrawn, not shot. User saves restored byte-identical.
- No moves of existing pads, no new open decisions.

### S13b · Village buildings: done (2026-09-25)
- C1–C3 (`dbf7794`): the seven keys, defs, first-pass costs and `VILLAGE`; 7 pads (101 now: the West Gate green in the hold, `watchDowns`, `docks1`); effects per CONTRACTS §S13b (`dropoffFor(x, y, res?)`, `localBonus`, `haulMultiplier`, `slotsOf`, `marketRateOf`, `nightBlessing`, `watchCovers`); ink art for all seven; healing auras moved to `buildings.auras(dt)`. Each type verified in the harness (numbers in `30d4a7b`).
- C4 (`f6acc67`): `art/looks.ts` (`STYLE_BY_BIOME`, `STYLED`, `TONED`, `lookFor`, `yardFor`, cap 160); palette `let`s set per bake by `setLook`: five styles' walls, three roofs and touch, ember windows (ash), snow (highland), a waterwheel mill within 200 px of river water; houses wear the look outside the hold's timber. `systems/BuildingLooks.ts`: variants baked lazily in an idle slice (on reveal, and at `startRaise` for the next level), refcounted and removed when unused, falling back to tone 0 then the base at the cap; yards of 1–2 of 8 `yard_*` props on non-military pads, seeded side, off roads and other pads, depth by y, culled.
- Verify (harness, one run): 12 Greyfall dev cottages: 3 tones, 12 yard layouts; five rows of six cottages in the five styles, 2 screenshots. Late game (17 claimed, all 289 pads at max): **109 `bld_` textures** (96 boot + 13 variants), 16 bakes, mean 8 ms; **the first bake of a session costs 80–105 ms** (warm-up, S21). A restarted game drops the last one's variants. Same id, same look: a pure hash (unit test). User saves restored byte-identical.
- Deviations: `ensureBuildingTexture(scene, key, lvl, look)` takes a `Look`, not `(style, variant)`. No `flipX` on buildings (their light comes from the upper left). Outposts, pits, delves, the hold's core, military and defence keep one look. The card's docks and market-square screenshots not taken (README cap).
- For S13c: today's pads use 13 variants, leaving 51. A dense country can exceed that (5 toned keys × 5 styles × 3 tones = 75 combos at max level); past the cap pads quietly fall back (`H.looks().fallbacks`). Raising the cap or dropping tones is S21's call.
- Not measured: the wheel mill and snow in play (no river mill or Frostmere village pad yet), bake ms on a phone.
- For S20: every cost past Lv.1, the market's 3 goods a coin, chapel mend 2/4 hp/s. Trips: granary reach is straight-line (farm1's haulers walk round the West wall); `waves.skipToDay` from the warning leaves `phase` as `warning` (harness only).

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
