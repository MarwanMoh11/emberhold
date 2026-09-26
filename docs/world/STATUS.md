# World v2: status ledger

**S22 partial: ready for cutover, awaiting the human's go** ([card](sessions/S22-cutover.md): C1 and C2 done, C3 the merge left) · branch `world-v2` (created by S01 from `main` at df51e0f)

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

- **Cutover (S22 C3):** "Playthrough green. Merge world-v2 → main and deploy?" Only the human says yes; then `git checkout main && git merge --no-ff world-v2`, push, check Pages.
- **The `/v2/` preview after the merge:** `deploy.yml` still builds `world-v2` at `/emberhold/v2/`, a copy of the live game. Default: drop that step (and the branch) in a small commit on `main` after the merge. The preview shares the origin and the `emberhold.save.v2` keys with the live game, so a preview save loads in the live game.
- **Late-game ease (S22):** `FRONTS` and `GROWTH` in `waves.ts` were eased once each; the hold now keeps its hall at w35–48, but w28–34 still had 2–4% nights in the probe. Accept, or ease `GROWTH` again (0.12/0.08) before the merge. Default: accept, and let a human run judge w25–35.

## Log

### S22 · Playthrough and cutover: partial, ready for cutover (2026-09-26)
- C1 (`759dd0a`, S22 hand-over commit) `H.play` (`src/dev/playthrough.ts`): S20's probe plus real fights at every quest camp and the Regent (hero and army set down, the walk shortcut), lost nights, deaths, stuck units, console errors. Probe taught towers (hold first, from w9, climbing with the hall), rubble refunds, village growth from w12, regionless build quests (c2's mine: it sat at c2 from w21, which is why S20's hold "fell" there), saving in full for the Crown.
- **Run D (fresh): the Regent fell at w35, 103 min.** Acts end I w7/13 min, II w14/29, III w19/43, IV w28/77; 0 lost nights, 0 console errors. Run E (fresh, Regent held to w48): w28–34 at 2–4% hall, army wiped 3 nights → `GROWTH` eased; resumed from its w34 save: w35–48 no losses, hall ≥ 76% from w38, **the Regent fell at w48, ~149 min** (9400 hp, 16 s, all 26 soldiers lost).
- **Checks:** Ashgate burnable: 24000 hp (braziers + 18000) in 42–44 s by 20–30 soldiers, none lost. Ferrow Muster: burned on the day Ferrow is claimed (4800 hp, 14 s); act II's longest milestone gap 4.3–5 min (S20: 9–10, an artefact of its burn formula, which asked 1 swordsman per 120 hp; a real fight is ~1000 hp per soldier a minute). Tier-3–5 rise: holds (no stall); claims come w14–20 (tier 3), w23–34 (deepvein, rim, ashgate), crown w32–38, ahead of 21–48: the probe walks nowhere and skips POIs. Act IV–V gaps 13–15 min are the Crown's 16000 coins saved for.
- **Tuned:** `FRONTS` per muster tier hp 0.25 → 0.12, dmg 0.15 → 0.08, 3+ fronts send 85% of the deck; `GROWTH` hp 0.22 → 0.16, dmg 0.13 → 0.1 (tests updated).
- C2: no v1 leftovers to delete (the grep hits are save-key comments and `settings.v1`, the live settings key); root README: atlas and travel rows, "The frontier" with `map.svg`, campaign line; `docs/world/README.md` status banner; `npm run build` green; the harness stays out of `dist`.
- Follow-ups: soldiers whose formation slot lands in a building stand still (~190 stuck samples in 20 min, no blocker); farmers pause in `travel` at (4750, 2160); towers rarely climb past Lv 1 in the probe (wrecked nightly); a real human run of w25–35 and act IV pacing. Not measured: real walking time, POIs.

### S21 · Performance and mobile: done (2026-09-26)
- C1 (`cd81f62`) `H.bench()` (`src/dev/bench.ts`): tiers 1–3 claimed, every pad at top level plus walls, 297 workers (every slot), 150 soldiers, wave 30 from dusk (three fronts, ~210 walkers), 60 s paced at 60 fps; frame p50/p95/max, bakes, flow, A*, drawn objects, heap; `prof` per system. C2 (`0e892c8`), C3 (`S21 hand-over` commit).
- **Fixes:** off-screen movers culled (`Culler.addMover`: walkers, soldiers, workers and loads, shots, pickups; drawn 1808 → ≤ 605); route dots drawn only on screen and once where routes share a road (render 2.8 → ~0.1 ms); A* stops 0.4 ms short (max 2.1 → 1.7 ms). Render per frame 3.2–3.7 → 1.3 ms.
- **Measured** (table in [04 §Performance budgets](design/04-systems.md#performance-budgets-checked-in-s21)): desktop 1280×720 p95 4.7 ms (max 16.5); phone 375×812 p95 4.6 ms, ×4 ≈ 18 ms (≤ 22); chunks 24, ≤ 3.6 ms/frame, worst in play 7.3 ms; flow ≤ 5.7 ms, ~4 frames a rebuild; JS heap ≤ 186 MB. Every row met except the first bake after a `prime` (13–14 ms, cold, on a load frame).
- Phone checks (one run): docked panel bottom 343×64 (7%), 44×44 target, font ≥ 13, clear of building and hero; a press on it does not start the joystick; a joystick drag moved the hero 79 px in 1 s; atlas opens. 1 screenshot.
- **Deviations:** 4× CPU throttling is emulated by scaling frame times (the pane has none). Frames are paced by busy-wait: unpaced, the GPU queue filled and the CPU stalled in the flush (10–30 ms spikes no player sees). ~210 walkers, not 250.
- Trips: the hidden pane re-opens the pause on each visibility change; `H.bench` unpauses every frame, ad-hoc scripts must too (`u.pause.hide(); u.resumeGame()`; `closeScreen` re-opens the pause). A new game saves as it starts; the bench puts the saves back.
- Not measured: boot delta, memory and GPU on a device, touch travel from the atlas (S12 verified it). No blueprint moves, no new open decisions.

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
- `SaveBlobV2` one schema, strict `validShape`, `tolerate` drops unknown ids, 64 KB enforced (compact form), v1 keys untouched, `GAME_VERSION = 'Beta 1'`; CONTRACTS §S19.

### S18 · Campaign 2.0: done (2026-09-25)
- 53 quests (goals claim, burn, restore, relic, reach, travel, line, settle), `targetFor`, `systems/questAnchors.ts`, act banners and deeds a12–a15; CONTRACTS §S18.

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
