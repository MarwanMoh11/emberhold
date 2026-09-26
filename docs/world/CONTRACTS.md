# World v2: contracts between sessions

This file lists the public surface each session builds for the ones after it. A later session reads the entry here **instead of** reading the earlier session's code. Signatures and one line of meaning only: no bodies.

Each entry has a status line that reads *planned* until its session lands it; the session then changes it to *landed* with a `file:line`. Keep the headings unchanged, because the session cards link to them. If you have to change a signature, change it here in the same commit and note it in STATUS.md.

---

## S01: blueprint and raster

*Status: landed (S01). `rasterise` at [src/world/raster.ts:128](../../src/world/raster.ts#L128), `flowField` at [src/world/flow.ts:70](../../src/world/flow.ts#L70).*

- [`src/config/world/blueprint.ts`](../../src/config/world/blueprint.ts) holds the layout data, which is authoritative.
  - It exports `WORLD2, REGIONS, FEATURES, ROADS, WALLS, PADS, CAMPS, THRONE, MAWS, APPROACHES, NODES, POIS` and the types `RegionId, PadKey, CampBP, ApproachBP, …`.
  - It has no imports, so the tool can load it on its own. `src/config/world/check.ts` pins `Exclude<PadKey, 'outpost' | 'fishery' | 'tradingPost'>` to `BuildingKey` at compile time. Camp spawn keys are plain strings, so `tests/world-blueprint.test.mjs` pins them to `EnemyKey` or `name[EnemyKey]`.
- `src/world/raster.ts`: pure TypeScript, no Phaser, type-only imports.
  - `rasterise(bp: WorldBlueprint): WorldRaster` returns `{ W, H, C, GW, GH, N, terrain, under, crossing, region, road, bp }`. `WorldBlueprint` is `Pick<blueprint module, 'WORLD2' | 'REGIONS' | 'FEATURES' | 'ROADS'>`.
    - `terrain` and `under` (`Uint8Array`) use `T = { LAND: 0, SEA: 1, WATER: 2, CLIFF: 3, LAVA: 4 }`; `TNAME` names them.
    - `crossing` (`Int16Array`) holds an index into `FEATURES.crossings`, or -1.
    - `region` (`Int8Array`) holds an index into `REGIONS`, or -1.
    - `road` (`Uint8Array`) is 1 on cells whose centre is within `width / 2` of a road polyline. It never changes terrain.
  - Methods: `cell(x, y) → i | -1`, `xy(i) → [x, y]` (the cell centre), `passable(i, sealed?)`, `slowCost(i)`, `regionAt(x, y) → RegionId | null`.
  - `blockedWithin(r, x, y, max) → px`: distance to the nearest non-land cell centre within `max`.
  - Geometry: `hyp, segProj, inPoly, distToPolyline, polyArea, polyCentroid, samplePolyline`.
- `src/world/flow.ts`: pure.
  - `flowField(r, sources: number[], { sealed?, cost? }) → Float64Array` is an 8-way Dijkstra with no corner cutting, in px. `cost(i)` defaults to `r.slowCost`.
  - `descend(r, field, from, { sealed? }) → number[]` walks downhill to the source, `from` first.
  - `nearestPassable(r, x, y, { sealed? }) → i | -1` searches rings out to 8 cells.
  - `step(r, i, dx, dy, sealed?) → j | -1` and `NB8` (orthogonal four first) for custom walks.
- `docs/world/tools/render.mjs` imports these two modules through `loadTs` and re-exports `rasterise, flowField, inPoly`. The lint and the game share one raster.
- New scripts:
  - `npm run world:lint` runs the lint quietly and exits 1 on errors.
  - `npm run world:map` rewrites `docs/world/map.svg`.
  - `tests/world-blueprint.test.mjs` runs as part of `npm test`.

## S02: terrain chunks

*Status: landed (S02). `TerrainChunks` at [src/world/TerrainChunks.ts:78](../../src/world/TerrainChunks.ts#L78), `paintTerrainRect` at [src/world/Terrain.ts:452](../../src/world/Terrain.ts#L452).*

- `src/world/TerrainChunks.ts` (type-only Phaser import; node-testable with a fake scene):
  - `new TerrainChunks(scene, painter, { width, height, chunk = 1024, scale = 0.5, maxResident = 24, bakeBudgetMs = 4, depth, slice = 256, overdraw = 16 })`. `width`/`height` are the world's; edge chunks are cut to it.
  - `.update(camera)` plans the chunks in view (nearest first), then a 1-chunk margin (nearest first, trimmed to `maxResident`), and bakes `slice`-px slices until the budget. A chunk shows only when whole. Call it every frame.
  - `.prime(camera) → n` bakes every chunk in view synchronously. Call it after any camera jump (spawn now; fast travel in S11).
  - `.invalidate(rect?: { x, y, width, height })` re-bakes the chunks it meets (all without a rect); the old texture stays up until the new one is whole.
  - `.stats() → { resident, baked, queued, frameMs, worstFrameMs, chunkMs, worstChunkMs }` (`chunkMs`: a whole chunk's slices summed, S07). `GameScene.stats.chunks` carries it to the F2 panel.
  - `type ChunkCamera = Pick<Camera, 'scrollX' | 'scrollY' | 'width' | 'height' | 'zoom'>`.
- `type ChunkPainter = (ctx, wx, wy, size, scale) => void` paints world rect `[wx, wx+size)²`. `ctx` arrives already transformed world px → canvas px (`scale`, origin at world 0,0) and clipped; strokes may land past the rect. It must be a pure function of world position and static config, so slices and chunks agree at every join.
- `paintTerrainRect` in `src/world/Terrain.ts` is the painter; since S07 it draws in world px and its layers are listed under §S07. Only the old set pieces (plaza, camps, gates) still draw in texels at `S = 0.5`.

## S03: fog and culling

*Status: landed (S03). `FogMemory` at [src/core/FogMemory.ts](../../src/core/FogMemory.ts), `Culler` at [src/systems/Culler.ts](../../src/systems/Culler.ts).*

- `new FogMemory(width, height, cell = 64)`, sized from the world; `.cols`, `.rows`, `mark(x, y)`, `forEachMarked(fn)`, `load(encoded)` (ORs in; malformed or other-size strings load nothing).
  - `toJSON()` returns the shorter of `b:` + unpadded base64 bitset and `r:` + alternating run lengths (unexplored first) as base64url varints (5 value bits, bit 6 = more). Anything else, the old bare v1 bitset included, loads nothing (S19).
  - `static maxEncodedLength(width, height, cell = 64)` = the `b:` length (3842 new world, 398 old). `validShape` checks `exploredFog` against it.
  - `static fromJSON(encoded, width, height, cell = 64) → FogMemory`.
- `ZoneManager` exports `FOG_SCALE = 8`; the fog RenderTexture is `ceil(WORLD / 8)` and the brush scales by `2 / FOG_SCALE` (~960 px reveal).
- `src/systems/Culler.ts` (type-only Phaser import; node-testable):
  - `new Culler({ bucket = 1024, margin = 256, interval = 150, moveStep = 64 })`; `GameScene.culler`, updated every frame after `terrain.update`.
  - `culler.add(obj, x, y, radius)` (obj: anything with `cameraFilter`; the disc should cover the sprite at its largest) and `culler.remove(obj)`.
  - `culler.update(camera, now?)` hides objects whose disc misses the view plus 256 px by setting the camera's bit in `cameraFilter`. It never touches `visible` or `active`: game logic owns those.
  - `culler.stats() → { total, shown, movers }`; F2 shows it.
  - S21: `culler.addMover(obj)` (obj: `{ cameraFilter, x, y }`, pooled, registered once at construction; dropped on `destroy`): tested against the view plus `moverMargin` (128) **every frame** from its live x/y. Registered: enemy, soldier, worker and worker-load sprites, projectile and pickup pool sprites. Not registered: the player, fx, building bars (drawn in shared Graphics).
  - Registered: node sprites (`NodeManager.add`), building sprite and ghost (`BuildingManager.addPad`), camp labels. Enemies, allies, projectiles and pickups are movers (S21, below); TerrainChunks images are not registered.

## S04: world seam

*Status: landed (S04). `WORLD` at [src/config/world/index.ts:20](../../src/config/world/index.ts#L20), `raster()` at [:44](../../src/config/world/index.ts#L44), `ZoneManager.zoneAt` at [src/systems/ZoneManager.ts:280](../../src/systems/ZoneManager.ts#L280), save `KEY` at [src/systems/SaveManager.ts:13](../../src/systems/SaveManager.ts#L13).*

- `src/config/world/index.ts` replaces `src/config/map.ts`, which is deleted, and exports:
  - `WORLD = { width, height, centerX, centerY, tile }` (:20). `centerX/Y` is the map's middle, **not** home: use `HALL`. (`balance.ts` no longer re-exports it: S05.)
  - `HALL = { x, y }` (:40, from the `hall` pad), `REGIONS: RegionDef[]` (:34, `RegionBP & { index }`), `REGION_BY_ID`, and `type RegionId, Biome`.
  - `PADS: PadSpec[]` (:75; `region`, `requiresTownHall` from `hall`, `startLevel`) (every blueprint pad since S13; `FUTURE_PADS` was deleted in S13).
  - `CAMPS: CampSpec[]` (:146; `region`, `reward: ResourceBag`; `spawns.key` is a real `EnemyKey` since S16, `resolveSpawnKey` removed), `NODE_CLUSTERS: NodeCluster[]` (:167; `region`; fish fields since S13), `NODE_DEFS`.
  - `WALL_LINES: WallLineSpec[]` (`WallLineBP & { active }`; every line active since S10). `WALL_RING` was removed in S10 (the minimap strokes `WALL_LINES`).
  - `SPAWN_GATES`, `GATE_BY_ID`: removed by S09 (see §S09).
  - `APPROACHES`, `MAWS`, `CROSSINGS`, `ROADS`, `POIS`, `THRONE`, `FEATURES`, passed through from the blueprint.
  - `raster(): WorldRaster` (:44), built once and memoised.
- `ZoneId` is now `RegionId`. `PadSpec`, `CampSpec`, `NodeCluster`, `Building` and `ResourceNode` carry `region` (was `zone`).
- `ZoneManager` (renamed in S08, see §S08) keeps its method names: `zoneAt(x, y)` reads `raster().region` (:280), `lockedZoneAt → RegionDef | null`, `isUnlocked(id)`, `claimPoint(id)` (the blueprint's `claim.{x,y}`), `unlock(id, silent?)`, `canUnlockId(id)`. Locked regions were one `Graphics` each (fill + fence) until S08 replaced them with the painter's claim tint and border stones. The soft barrier (`exitToward`, :391) pushes toward the nearest border whose far side is claimed, else toward `HALL`.
- `src/world/Terrain.ts`: `biomeColour(b: Biome) → number` is the biome's base tone, used by the minimap. (`biomeAt` is internal since S07.)
- Dev harness ([src/dev/harness.ts](../../src/dev/harness.ts)):
  - `H.tp(x, y)` teleports, centres the camera and primes the chunks.
  - `H.claim(id)` calls `regions.claim(id, true)` (silent: no event, no bonus recompute; since S08 it still repaints). `H.world()` gained `campsAwake` (S08).
  - `H.reveal()` clears the fog.
  - `H.where()` returns `{ x, y, region }`.
  - `H.world()` returns `{ size, regions, claimed[], pads, built, camps, campsLive, nodes, enemies, wave, phase, chunks, cull }`.
- Save:
  - Keys `emberhold.save.v2` and `emberhold.save.backup.v2`, blob `v: 2`. The v1 keys are never read, written or deleted.
  - `validShape` rejects `v !== 2`, so a v1-shaped save or file is refused quietly and the game starts fresh.
  - `regions: RegionId[]` replaces `zones`; since S19 an id not in `REGION_BY_ID` is dropped, not refused.

## S05: NavGrid

*Status: landed (S05). `NavGrid` at [src/world/NavGrid.ts:109](../../src/world/NavGrid.ts#L109), `FlowField` at [:37](../../src/world/NavGrid.ts#L37); `GameScene.nav`, ticked every frame.*

- `src/world/NavGrid.ts` (pure, `loadTs`-testable): `new NavGrid(raster(), { hall, sliceMs = 6, now? })`. `WALL_COST = 40`; `walkRadius(body) = min(body / 2, 12)` is the collision circle every walker passes to `slide`.
  - Cells: `passable(i)` (land and not a sealed crossing's water), `passableAt(x, y)`, `blocked(i)` / `blockedAt(x, y)` (a wall covers it), `speedAt(x, y)` (a ford's `slow` in its water, else 1), `nearestPassable(x, y) → i | -1` (8 rings).
  - `setBlocker(id, x, y, radius, on)` marks cells whose centre is within `radius`; re-calling an id replaces it. `setSealed(crossingId, sealed)` and `isSealed(id)`; `sealedUntil` crossings start sealed. Both bump `version`.
  - `slide(x, y, dx, dy, radius) → { x, y }`: centre plus four circle points, x/y split on contact, steps under a third of a cell; an off-ground centre is put on the nearest passable cell. `clearAt(x, y, r)`; `lineClear(ax, ay, bx, by)` is false through impassable or walled cells.
  - `field(target: 'hall' | \`via:${crossingId}\`) → FlowField`: the first call builds synchronously (~36 ms); a stale one keeps serving while `tick(budgetMs?)` rebuilds it in slices. `building`, `flush()`, `sources(target)`, `stats() → { version, fields, building, frameMs, worstFrameMs, rebuilds, lastBuildMs }` (F2, `H.nav()`).
  - `FlowField`: `nextCell(i) → j | -1`, `dir(x, y) → { dx, dy }` (unit, toward the next cell's centre), `dist(x, y)`, raw `d: Float32Array` and `step: Int8Array` (NB8 index, -1 at the target or unreachable), `version`.
- `EnemyManager` checks `lineClear` to its target on each retarget (`Enemy.los`); without it, it steps along `field('hall')`. A walled next cell latches that wall as the target. S09: an enemy with a `route` steps along its current leg's field instead.
- `BuildingManager.syncNav` registers built `wall` pads on build, destroy, demolish and load (S09b: each piece's capsule, see §S09b). Gates and other buildings stay out of the grid.
- The hero, enemies, soldiers and workers move through `slide` (building push-out too). Projectiles ignore terrain.

## S06: ally pathing and roads

*Status: landed (S06). `findPath` at [src/world/NavGrid.ts:297](../../src/world/NavGrid.ts#L297), `PathFinder` at [src/world/PathFind.ts:105](../../src/world/PathFind.ts#L105), `PathFollower` at [src/world/PathFollower.ts:11](../../src/world/PathFollower.ts#L11), `dropoffFor` at [src/systems/BuildingManager.ts:181](../../src/systems/BuildingManager.ts#L181).*

- `nav.findPath(ax, ay, bx, by, maxLen?) → Pt[] | null`: 8-way A*, octile heuristic, the fields' cost rules (fords `slow`, walls `WALL_COST`), string-pulled with 12 px clearance. Start to goal inclusive; ends snapped onto passable ground. Null past 20,000 expansions or unreachable (remembered). With `maxLen`, gives up once every path left is longer (not remembered).
- `nav.requestPath(ax, ay, bx, by) → PathTicket { done, path }`: queued, worked at 2 ms a tick inside `nav.tick()`; the same coarse ends share a ticket; a full queue (64) answers null at once. A cache hit comes back done.
- Cache: LRU 256 keyed by the 4×4-cell blocks of start and goal; a hit is re-ended at the caller's points after both end legs pass `segClear`; emptied on a `version` bump.
- `nav.paths: PathFinder`: `segClear(ax, ay, bx, by, rad)` (a walker of radius `rad` fits the segment, centre off walls), `stats() → { searches, cacheHits, failed, queued, frameMs, worstFrameMs, lastMs, worstMs, lastExpanded }` (also `nav.stats().paths`), `flush()`. `pathLength(path)` is exported beside it.
- `PathFollower`: `set(path | null)`, `clear()`, `active`, `goal`, `step(x, y, dt, reach = 22) → { x, y, done }` (the waypoint to steer at; it moves nothing), `stuck` (seconds without closing on the waypoint).
- `ROAD_SPEED = 1.2`, `nav.onRoad(x, y)`, `nav.allySpeedAt(x, y)` (`speedAt` × road bonus) for the hero, soldiers and workers; enemies keep `speedAt`.
- `buildings.dropoffFor(x, y) → { x, y }`: where a hauler unloads (the depot, else the hall's door). The only drop-off chooser.
- Workers: `NodeManager.candidates(resource, x, y, radius, claimer | null)` (nearest first); node choice by walking distance ≤ 760 from the camp door, cached per camp and node. `workers.delivered` counts drop-offs. `findAny` is gone.
- Harness: `H.watch(s)` → deliveries, off-ground frames, workers on crossings, worst soldier stall, path stats; `H.run(dx, dy, s)` → hero px/s and road share.

## S07: terrain art

*Status: landed (S07). `paintTerrainRect` at [src/world/Terrain.ts:499](../../src/world/Terrain.ts#L499), `terrainFields` at [src/world/terrainField.ts:45](../../src/world/terrainField.ts#L45), `scatterProps` at [src/world/scatter.ts:52](../../src/world/scatter.ts#L52).*

- `warmTerrain()` builds the fields, the blended palette and every feature layout (~140 ms, once); GameScene calls it before `TerrainChunks`.
- `paintTerrainRect` layers, in order: `paintWash` (per-sample, every 8 px: biome recipe `BIOME[biome]` blended per cell, then cliff, water, lava from the fields), `paintDecals` (per 128 px cell, batched), then from `TerrainFeatures.ts` `paintFeatureLines`, `paintRoads`, `paintCrossings`, then plaza, camps, gates, grain and vignette. A claim tint (S08) belongs after the crossings, before the set pieces.
- `src/world/terrainField.ts` (pure): `terrainFields() → { r, wet, cliff, lava, cliffS, sea, contours: { wet, cliff, lava } }`. Per-cell `Float32Array`s: signed px distances from `under` (negative inside, blurred; drawn shores may stray ≤ 16 px from the NavGrid's), `cliffS` (-1 crest … +1 foot), `sea` (0–1). `sample(f, grid, x, y)` is bilinear, `cellValue` is the cell's own value. `downhill(a, b) → [nx, ny]`, `contours(sd, …) → Contour[] { pts, box, side }`.
- `src/world/noise.ts`: `hash32, hash, vnoise, fbm, Mulberry, smooth` (moved out of Terrain.ts).
- `TerrainFeatures.ts`: `Batch` (`fill(c, a)`, `stroke(c, a, w, op?)` → a `Path2D` per style, `flush(ctx)`), `type Rect { x0, y0, x1, y1 }` in world px.
- `src/world/scatter.ts`: `scatterProps() → PropSpot[] { key, x, y, flip, scale }` (memoised, deterministic per 1024 px chunk), `PROP_BUDGET = 1500`, `PROP_CLEAR` (distances kept from pads, fields, camps, POIs, claim stones, roads, crossings), `addScatter(scene)` (depth y, culled). Textures `sc_*` from `buildScatterTextures` in `src/art/scatter.ts`; `props.ts` now exports `groundShadow, trunk, pine, boulder`.

## S08: regions and claims

*Status: landed (S08). `RegionManager` at [src/systems/RegionManager.ts:268](../../src/systems/RegionManager.ts#L268) (`canClaim` :314, `claim` :336), `CampManager.wake` at [src/systems/CampManager.ts:66](../../src/systems/CampManager.ts#L66), the painter's claim state at [src/world/claimTint.ts:41](../../src/world/claimTint.ts#L41).*

- `RegionManager` is `ZoneManager` renamed; the scene field is `regions`. `scene.zones` was removed in S09.
  - `claimed(id)` (unknown ids read as claimed) and `claimedAt(x, y)` (off the raster: false).
  - `claimMask(): Uint8Array`: one byte per raster cell, 1 if claimed; rebuilt lazily after a claim. Read only.
  - `canClaim(id) → { ok, reason, why }`: `reason` is `'hall' | 'adjacent' | 'camps' | 'cost' | null`, checked in that order; `why` is the stone's tooltip line ("Needs a Stone Hall", "Claim Hollow Village first", "Burn the Ferrow Muster first", "Not enough yet"). Already claimed: `{ ok: false, reason: null }`.
  - `claim(id, silent?)` sets the flag, pushes it to the painter, invalidates the region's box (`claimRect`) and lights the stone; unless silent: fanfare, `region:claimed { id }`, `recomputeBonuses`. Paying stays in `update` (stand on the stone).
  - Renamed from S04: `zoneAt → regionAt(x, y): RegionDef | null`, `lockedZoneAt → unclaimedAt`, `isUnlocked → claimed`, `unlock → claim`, `canUnlockId(id) → canClaim(id).ok`, `unlockedCount → claimedCount`. `claimPoint`, fog methods unchanged. `lastClaimMs` is the last claim's own cost.
- `src/world/claimTint.ts`: `setClaimed(flags by REGIONS index)`, `claimRect(k)`, `paintClaimTint(ctx, rect)` (called by `paintTerrainRect` after the crossings), `CLAIM_DESAT` 0.35, `CLAIM_DARK` 0.15.
- Camps: `CampRec.state: CampState = 'asleep' | 'awake' | 'burned'` (`destroyed` is now a getter for `burned`). `CampManager.wake(id, silent?) → boolean`, `isBurned(id)`, `awakeJSON()`, `load(burned, awake?)`, `WAKE_RADIUS = 900`. A sleeping camp has no `Enemy` (untargetable), only a dimmed sprite (`sleeper`). Events: `camp:woke { id }` (new, for S10's first-wake boss) and `camp:burned { id }` (was `camp:destroyed`).
- Events renamed: `zone:unlocked → region:claimed`, `camp:destroyed → camp:burned`. The HUD plays the region banner (name + blurb) on `region:claimed`.

## S09: approaches

*Status: landed (S09). `Approaches` at [src/systems/Approaches.ts:88](../../src/systems/Approaches.ts#L88) (`splitBudget` :251), the march at [src/systems/EnemyManager.ts:395](../../src/systems/EnemyManager.ts#L395), the night plan in [src/systems/WaveManager.ts:53](../../src/systems/WaveManager.ts#L53), route dots in [src/world/RouteMarks.ts](../../src/world/RouteMarks.ts).*

- `src/systems/Approaches.ts` (pure; `new Approaches({ nav, claimMask(), claimed(id), campState(id) })`, scene field `approaches`). `ApproachId = string` (blueprint `APPROACHES` ids).
  - `muster(id) → { id, x, y, kind: 'camp' | 'maw', region } | null`: the first standing (asleep or awake) camp in the chain, else its maw, else null (closed for good).
  - `legs(id) → FieldTarget[]` (`via:<crossing>`… then `'hall'`); `routeCells(id)` / `route(id) → Pt[]` descend those NavGrid fields from the muster (walls, seals included); `toClaimed(id) → { d, cells, at }` path px to the first claimed cell.
  - `spawnPoint(id) → Pt` (the muster, or the route point `SPAWN_CLAMP` 2400 px of path before claimed ground; `[NaN, NaN]` when closed); `marchRoute(id)` the route from there; `tier(id)`; `campKey(id)` the muster camp's resolved walker (null at a maw); `name(id)`, `isRaid(id)`.
  - `live(wave) → ApproachId[]`: mains open by `OPENS` (south 1; west 5 or hollow; east 8 or greyfall; southeast 11 or kettle/ferrow), raids while their muster camp is awake. `tonight(wave, prefer?) → NightPlan { wave, fronts, raid }`: `frontsFor(wave)` mains (south first, then prefer, the rest rotating by wave), plus at most one raid. `splitBudget(plan, total)`: raid 30%, fronts by weight (south 1, others 0.8).
  - Constants: `MARCH_SPEED` 2.4, `SPAWN_SCATTER` 120, `VIA_REACH` 96, `RAID_SHARE` 0.3, `CAMP_MIX` 0.3; `viaMid(crossingId)`.
- `WaveDef.gates` is gone; `WaveDef.approaches?: ApproachId[]` is an optional preferred-fronts list (no scripted wave sets it). `SPAWN_GATES`, `GATE_BY_ID` and `GateId` are deleted.
- `Enemy`: `marching` (2.4×, no targets, cleared by any hit in `applyDamage` or the first claimed cell), `approach`, `route: FieldTarget[] | null` (legs until claimed ground; used by the field step even after a hit), `leg`. Leg switch: on the crossing, within 96 px of its midpoint, or nearer the hall than it on the hall field. A wall or unreachable cell ends the march.
- `WaveManager`: `plan`, `tonight: TonightRoute[] { id, name, raid, x, y, route }`, `arrivals` (first arrival per approach, s after dusk), `fighting` / `marching`, `arrived(e)` (EnemyManager calls it), `dayLength`, `nextApproaches()` (replaces `nextGates`). Fight window (`phaseT = nightSeconds`) starts on the first arrival or `DAYNIGHT.marchMax` 25 s after dusk; the end-of-night timeout counts from it.
- `DAYNIGHT.daySeconds` is gone: `dayBase` 60, `dayPerRegion` 10, `dayMax` 180, `marchMax` 25; `dayLength(claimedBeyondHold)` in `config/balance.ts`.
- Event `night:warning { approaches: string[], routes: Pt[][] }` at the warning. `CampManager.stateOf(id)`, `burn(id)` (reward and `camp:burned`). Harness: `H.burn`, `H.night(wave?)`, `H.march(s)`.
- No new save fields: the plan, queue and marches are transient (an interrupted night restarts at its warning).

## S09b: walls and panels

*Status: landed (S09b). `layWallLine` at [src/world/wallLine.ts](../../src/world/wallLine.ts); the dock at [src/ui/dock.ts](../../src/ui/dock.ts), re-exported by `skin.ts`.*

- `src/world/wallLine.ts` (pure): `layWallLine(line: WallLineBP) → WallPiece[] { id, key: 'wall' | 'gate', part: 'run' | 'post', dir: 'h' | 'v', x, y, len, ux, uy, cap? }` in order along the line. Posts on every vertex (not one a gate swallows) and on both jambs of every gate; `ceil(run / step)` runs spaced evenly between stops. Ids `${line}.${k}`; gates keep their blueprint ids. `ux, uy`: unit vector along the line. `cap`: the NavGrid capsule `[ax, ay, bx, by]`, kept `GATE_W / 2 + GATE_CLEAR` (48) px straight-line from every gate centre; absent when that swallows it.
  - Constants: `GATE_W` 64, `POST_LEN` 20, `WALL_CAP_R` 28, `WALL_CAP_STEP` 16, `GATE_CLEAR` 16. `capDiscs(cap) → number[]` (flat x, y pairs, ≤ 16 px apart). `legacyRingPads(line)`: the pre-S09b `wall${i}` layout.
- `NavGrid.setBlockerDiscs(id, discs: ArrayLike<number>, radius, on)`: one blocker from many discs (a cell counts once); `setBlocker` now calls it. `BuildingManager.syncNav` registers each built wall piece's `cap` at `WALL_CAP_R`. Gates stay out of the grid.
- `PadSpec.piece?: { part, dir, len, ux, uy, cap? }` on wall and gate pads. `BuildingManager.generateWalls` lays every `WALL_LINES` entry with `active` (only the palisade until S10).
- `Building.boxDy / boxHW / boxHH`: the solid box `blockerAt` and `resolveCollision` use (a wall piece's is centred on the line and covers its share + 2 px; turned for slants). `Building.depth` (posts y + 33, a `v` gate y + 34, `h` runs y + x·1e-4), `Building.texKey(scene, lvl)`.
- Art: `pieceTextureKey(key, lvl, piece) → string | null` (`bld_wall_v_${lvl}`, `bld_wallpost_${lvl}`, `bld_gate_v_${lvl}`; lvl 0 → `blueprint_wall_v` / `blueprint_wallpost` / `blueprint_gate_v`); `textureFoot(texKey)` (px from a texture's bottom to its pad point; 16 unless registered). Horizontal `bld_wall_${lvl}` is 72 px wide.
- Saves: a record may name any piece or gate `layWallLine` lays for a `WALL_LINES` line (since S19 a piece past a line's end is dropped), and still `wall\d+`; `BuildingManager.load` remaps old `wall\d+` entries (Save fields).
- Harness: `H.buildLine(id = 'palisade', lvl)` (through the loader; also lowers), `H.wallGaps(lineId = 'palisade') → { pieces, built, navLeaks, bodyLeaks }` (samples every 4 px; a nav leak is ground neither walled nor under a standing gate's box, a body leak is `blockerAt(x, y, 8)` null), `H.assault(key, x, y, seconds, lineId) → { struck, firstBroken, inside, insideUnbroken, target }`.
- The dock, for every panel from here on (fishery, trading post, relics, S13b's buildings use only these):
  - `DOCK` tokens: `gutter` 16, `pad` 10, `touch` 44, `rowH` 28, `collapsedH` 64, `sideW` 300, `phoneMaxFrac` 0.30, `deskMaxFrac` 0.20, `titleSize` 15, `bodySize` 13, `depth`. `compactH(viewW) → 44 | 36`.
  - `new DockSheet(uiScene, bands: DockBands)`: `layout(head: DockHead { title, level?, levelColour?, primaryW? }, rows: DockRow[]) → DockRect` every frame it is shown; the owner places its primary action in `primary`. `hide()`, `toggle()`, `contains(x, y)` (CSS px), `targets()`, `fonts()`, `destroy()`; fields `collapsed`, `side: 'bottom' | 'right'`, `rect`, `focus?: {x, y}` (world point the camera frames), `isShown`, `dead` (its UI scene shut down: make a new one). Collapsed state is shared per page session; phones start collapsed.
  - `DockRow { measure(w), place(x, y, w), setVisible(v), objects() }`. `CostChips.set(CostChip { tex, have, need, short? }[])`, `StatLine.set(text, colour?, icon?)`; both are rows.
  - `GameScene.uiBands: DockBands { top, bottom, dock?: DockBand { x, y, w, h, side, focus? } | null }`. A sheet clears `dock` only if it is still its own rect. The camera eases its follow offset toward `dock.focus`; the HUD's combo and hint lines sit above a bottom sheet.
  - `PlateButton({ size: 'compact' })`: 44 px tall on touch, 36 with a mouse.
  - `PanelRow.short?` (red cost chip). `BuildingPanel.inspect()`, `RegionManager.inspectDock()` for the harness.
- Harness: `H.panel() → { about, side, rect, viewport, frac, collapsed, building, hero, overlapsBuilding, overlapsHero, targets: { name, cx, cy, w, h }[], minFont }` (CSS px; the build card, else the nearest stone's card), `H.tap(x, y, holdS = 0)` (real DOM mouse events on the canvas).

## S10: camps and lines

*Status: landed (S10). Camps in [src/systems/CampManager.ts](../../src/systems/CampManager.ts), patrol AI in `EnemyManager.acquirePatrol / strayed / wanderGoal / patrolWay`, the fire in [src/world/CausewayFire.ts](../../src/world/CausewayFire.ts), lines in `BuildingManager.generateWalls`.*

- `CampSpec` adds `tier: CampTier` (`'warcamp' | 'stronghold' | 'fortress'`), `leash` (`CAMP_LEASH` 700), `wakeRadius` (`CAMP_WAKE` 900), `siegeRadius` (`CAMP_SIEGE` 600), `boss?` (blueprint key). `WAKE_RADIUS` = `CAMP_WAKE`.
- `Enemy.home: CampHome { id, x, y, leash, siege } | null` (patrols and guards), `returning`, `wanderX/Y/T`, `guard` (skipped by `clearWalkers`), `shielded` (`applyDamage` and burn ticks do nothing; `damageEnemy` pops WARDED), `path/pathX/pathY/pathI`. A patrol targets the hero within its leash and 520 px, allies inside the leash, else (melee only) `nearestStructure(camp, siege)`; with nothing, it strolls inside 0.45 × leash; past leash + 60 it walks home. No line of sight: `nav.requestPath`, never the hall field.
- `CampManager`: `CampRec.patrols` (≤ 2 × `spawns.count`), `CampRec.guards`, `CampRec.home`; `guardIds(spec)` (`['boss']` for a stronghold with a boss, `brazier0..2` for the fortress), `guardsUp(id)`, `guardsDown: Set<'${campId}.${guardId}'>`, `guardsJSON()`, `load(burned, awake?, guardsDown?)`. `BRAZIERS { count 3, ring 260, hp 2000 }`; `STAND_IN { hp ×8, dmg ×1.6, leash 420, dy 90 }`; `bossName(key)`.
  - **Swapped in S17:** `spawnGuard` stands `spec.boss` (its own `EnemyKey`) at `(camp.x, camp.y + BOSS_POST.dy)`, leash `BOSS_POST.leash` 420; `STAND_IN` is gone.
- `EnemyManager.spawn(key, x, y, hpMult?, dmgMult?, def = ENEMIES[key])`. New `EnemyKey` `'brazier'` (structure, texture `enm_brazier`).
- Events: `camp:burned { id, tier?, boss? }` (the boss key is for S15's relic); new `crossing:opened { id }` (the HUD banners "The fire on the causeway dies.").
- `CausewayFire` (scene field `causeway`): `sync()` at boot after load (sealed unless `campAshgate` burned), `douse()`, `lit`, `update(dt)`. `CAUSEWAY`, `CAUSEWAY_KEEPER`. `nav.setSealed` / `isSealed` are S05's.
- Every `WALLS` line is laid by `layWallLine` (ids `${line}.${k}`, gates by blueprint id); pads carry `requiresTownHall: line.hall` above 1. Pads: palisade 92, bridgehead 23, millfordLine 19, gorgeLine 18, stairLine 21, passLine 15. `buildings.lineComplete(lineId) → boolean` (every piece and gate built and standing).
- Harness: `H.camp(id)`, `H.leash(id, s, away)`, `H.siege(id, key, d, s)` (a dev pad `siegeTest.${id}` on open ground in sight of the camp).

## S11: outposts and waystones

*Status: landed (S11). [src/systems/Waystones.ts](../../src/systems/Waystones.ts), `respawnPoint` in `GameScene`, `dropoffFor` / `outposts` in `BuildingManager`.*

- `BuildingKey` gains `'outpost'` (2 levels; Lv.2 stat `aura: 1`). `FUTURE_PADS` then held only fishery and tradingPost pads (deleted in S13). Constants `OUTPOST { heal 5, healRadius 220, calmRadius 420, light 600, safeRadius 600, stoneDx 44, stoneDy 8 }` and `WAYSTONE { touch 56, channel 1.2, escort 500, hallStone 'wsHall' }` in `config/balance.ts`; **S14** raises `OUTPOST.heal` (Kettle Springs).
- `buildings.outposts() → Building[]`: built, standing outposts. `buildings.dropoffFor(x, y)`: the depot (hall door while it is down) or the standing outpost nearest by path (`nav.findPath` + `pathLength`), cached per 256 px block until a drop site rises or falls or `nav.version` moves. The hero banks the pack at an outpost as at the depot (not while committed to its upgrade).
- `scene.respawnPoint() → { x, y, padId }`: the standing outpost nearest the hero's fall with no enemy within `safeRadius` and `damageT <= 0` (not struck in 6 s), if nearer than the hall; else the hall (`padId: 'hall'`). A built outpost reveals ~600 px of fog on build and on load; Lv.2 heals allies within `healRadius` each second while no enemy is within `calmRadius`.
- `scene.waystones: Waystones`: stone ids are outpost pad ids plus the POIs `wsHall`, `wsIsle` (`LONE_STONES`, drawn with `ws_stone`). `stones() → Stone { id, name, x, y, region, lone }[]` (standing now), `stone(id)`, `list() → StoneInfo (Stone + active)[]`, `isActive(id)`, `activate(id, silent?)` (also on touch within `touch`; `wsHall` starts lit), `here` (the lit stone the hero stands on), `canTravel(to) → { ok, why }`, `travel(to) → boolean` (starts the channel; `lastWhy` on refusal), `channel: { from, to, t } | null`, `progress`, `cancel(why)`, `toJSON()`, `load(ids)`. Night: only `wsHall`. The channel breaks on any hp loss, stepping off the stone, a fall, or nightfall. Soldiers within `escort` arrive in rings of 10 round (stone.x, stone.y + 40).
- Events: `waystone:lit { id }`, `waystone:travelled { from, to, escort }`.
- S12 replaced the stopgap `ui/TravelList.ts` with the atlas (travel calls `canTravel` / `travel`). `DockBands.card?: number | null` stays (nothing sets it now); `GameScene.updateCamera` still frames the hero between it and the dock.
- Harness: `H.stones() → { here, channel, list: ['id*@x,y'], offers }`, `H.travel(from, to, s = 1.6) → { ok, why, here, hero, dest, escort, escortAtDest }`.

## S12: minimap and atlas

*Status: landed (S12). [src/ui/Atlas.ts](../../src/ui/Atlas.ts), [src/ui/Minimap.ts](../../src/ui/Minimap.ts), pure parts in [src/ui/chart.ts](../../src/ui/chart.ts), marks in [src/ui/chartMarks.ts](../../src/ui/chartMarks.ts), the bake in [src/world/AtlasBake.ts](../../src/world/AtlasBake.ts).*

- `paintAtlasRect(ctx, wx, wy, size)` (Terrain.ts): the painter's low-detail pass (wash every `ATLAS_STEP` 16 px, feature lines, roads, crossings, claim tint; no decals, set pieces or grain). `paintWash` takes a `step`.
- `scene.atlasBake: AtlasBake`: canvas texture `ATLAS_KEY` = `'atlas_bake'`, `ATLAS_W × ATLAS_H` = 640 × 576 (`ATLAS_SCALE` 16 world px per texel), painted in `ATLAS_BLOCK` 1024 px blocks after the chunk queue empties (or 3 s), 2.5 ms a frame. `invalidate(rect?)` (RegionManager calls it with `claimRect` on every claim), `update(dt)`, `flush()`, `done`, `version`, `stats() → { done, queued, bakeMs, wallMs, worstFrameMs }` (also in `scene.stats.atlas`). `atlasBlocks(rect?)` is pure.
- The world fog page is saved as texture `FOG_KEY` = `'fog_live'` (RegionManager; the last run's page lives on as `fog_live_prev` for one restart). Charts crop or scale it; they never keep their own shroud.
- `ui/chart.ts` (pure): `ChartMemory` (256 px seen grid: `reveal(x, y, r = 480)`, `revealPoly`, `seenAt`, `anySeenIn(poly, min)`, `version`), `AtlasView` (`z, ox, oy, vp, zMin, zMax`, `resize`, `centre`, `pan`, `zoomAt`, `toScreen`, `toWorld`), `pickStone`, `travelOrder` (Hall first, then nearest), `windowCrop`.
- `ui/chartMarks.ts`: `CHART` inks, `drawCamp`, `drawStone`, `drawOutpost`. **S14 hooks:** `POI_GLYPH[kind]` (every kind a generic ring until S14 draws its own) and `poiState(gs, memory, poi)`, which already answers from `gs.pois.state(id)` once a `pois` field exists (else seen = its cell seen).
- `Minimap(ui, gs, openAtlas)`: `MINI_RADIUS` 2400, north up; crops `atlas_bake` and `fog_live`; marks at 9 Hz (pads, seen camps and POIs, stones, bodies, tonight's routes in the warning and the march, the view box, the hero). `memory` is the shared `ChartMemory`. The chip and a tap on the map open the atlas. `inspect()`.
- `Atlas(ui, gs, memory, onClose)` in `UIScene.atlas`: `show()`, `hide()`, `close()`, `open`, `cycle(±1)`, `confirm()`, `travelTo(id) → boolean`, `tap(x, y)`, `focus`, `openMs`, `inspect()`. `UIScene.openAtlas()` pauses the Game scene (no save), `toggleAtlas()`; `M`, the Map chip, the minimap, the Travel chip and gamepad Back (8) open it; M, Close, ESC/P/Start, B or Back close it; d-pad cycles the lit stones, A or Enter travels. The atlas counts as a modal (`anyModalOpen`).
- `TravelChip` (`UIScene.travel`): a plate at the bottom of the view while the hero stands on a lit stone; opens the atlas and shows the channel's progress.
- `GameScene.questRoute: Pt[] | null`: the nav path to an off-screen quest target (`nav.requestPath`, re-asked on a new target, 400 px of drift or 4 s); the objective arrow aims at its first point 260 px ahead, the atlas draws it.
- Harness: `H.atlas(open?)`, `H.mini()`; `H.stones().offers` now lists every other lit stone with `canTravel`.

## S13: fish and trade

*Status: landed (S13). [src/world/fish.ts](../../src/world/fish.ts), `NodeManager`, `tickTrade` in `BuildingManager`.*

- `NodeType` gains `'fish'` (`NODE_DEFS.fish`, yields food). `placeFish(r, field, anchor, rand) → FishSpot[]` puts shoals on cells where `fishable(r, i)` (under is water or sea, never a crossing deck); every node now carries a gather point `gx, gy` (fish: the nearest land cell within `FISH_BANK` 160 px, reachable from the field's fishery). Workers walk to `gx, gy`, never to `x, y`.
- `nodes.candidates(res, x, y, radius, claimer, fish = false)`: fishers (`WorkerDef.fishes`) take shoals only; other crews never do. Search is 760 px of path (`SEARCH_RADIUS`).
- `BuildingKey` gains `'fishery'` (3 levels, `fisher` crew, the farm's rates) and `'tradingPost'` (3 levels, stat `income` 0.6 / 1.2 / 2.0 coins a second).
- `buildings.tradeIncome() → number`: the `trade.income` multiplier, 1 for now; **S14** returns `mods.value('trade.income', 1)` there (Saltmere Light +20%). `buildings.tradeRateOf(b)`, `buildings.tradeRate()`: coins a second now. Trade coins bank straight to stores (`res.addStored`).

## S13b and S13c: a settled country

*Status: S13b landed (keys, effects, art; `BuildingManager`, pure parts in [src/systems/village.ts](../../src/systems/village.ts); looks in [src/art/looks.ts](../../src/art/looks.ts) and [src/systems/BuildingLooks.ts](../../src/systems/BuildingLooks.ts)). S13c landed (244 pads).*

- `BuildingKey` and `PadKey` gain `'cottage' | 'granary' | 'mill' | 'market' | 'chapel' | 'watchPost' | 'docks'` ([05 §A settled country](design/05-content.md#a-settled-country-s13b-s13c)). Stats: cottage `pop`; granary `reach`, Lv.2 `haul`; mill and docks `bonus`, `reach`; market `sell`; chapel `mend`, `radius`, `blessing` (never `heal`: that is the infirmary's aura); watchPost `light`, Lv.2 `dmg rate range splash`.
- `VILLAGE` (config/balance): `cottagePopMax` (open decision; `Infinity`), `market { sells (open decision; true), floor 300, goodsPerCoin 3, perHome 0.05, homeMax 0.5, homeRadius 600 }`, `chapel.blessingMax` 0.5, `watchPost.warnEarly` 4, `docks { slots 1, slotRadius 800 }`.
- `buildings.dropoffFor(x, y, res?)`: with `res` `'food'` (farm and fishery crews), the nearest standing granary whose `reach` (straight line) covers (x, y) comes first. `granaryFor(x, y) → Building | null`.
- `buildings.localBonus(key, x, y) → number`: 1 + the best `bonus` among standing `key` buildings whose `reach` covers (x, y); never stacks. Mills on farm and lumber camp crews, docks on `tradeRateOf`.
- `buildings.haulMultiplier(home, res, x, y)`: mill × Lv.2 granary, applied to each delivery (and sheltered output). `slotsOf(b)` (worker slots; docks add to fisheries): use it, not `stats.workers`. `standing(key)`, `homesNear(x, y, r)`, `marketRateOf(b)`, `nightBlessing()` (WaveManager.endNight multiplies the reward), `watchCovers(routes)` (WaveManager rings the warning `warnEarly` s early; `beginWarning(extra)`).
- `buildings.auras(dt)`: the infirmary, outpost Lv.2 and chapel heals; GameScene calls it after `army.update`.
- Pure (`systems/village.ts`): `bestBonus(sources, x, y)`, `marketRate(sell, homes)`, `marketGood(food, wood)`, `blessingMultiplier(blessings)`, `routeNear(route, x, y, r)`.
- Art: painters read `VL: VillageLook { wall, wallC, footing, roof, roofMat, wheel, snow, touch }` and the palette `let`s (`WOOD … SLATE, SHUTTER, GLASS`) in art/buildings.ts; `setLook(look)` sets both per bake and restores the hold's after.
- Looks (pure, art/looks.ts): `Style`, `STYLE_BY_BIOME`, `STYLED` (cottage house granary market chapel mill docks farm lumberCamp fishery tradingPost), `TONED` (cottage house granary market chapel), `Look { style, tone, wheel, snow }`, `lookFor(key, padId, biome, nearWater?)`, `variantTextureKey(key, lvl, look)` (`bld_${key}_${lvl}_${style}${tone}[w][s]`; base look = the boot key), `isVariantKey`, `yardFor(key, padId) → { props, mirror } | null`, `padSeed(id, salt)`, `BLD_TEXTURE_CAP` 160.
- `ensureBuildingTexture(scene, key, lvl, look) → string` (art/buildings.ts): bakes now if missing. Only `BuildingLooks` calls it, from its idle slice. Yard textures `yard_${prop}` (8, boot), `YARD { w, h, foot }`.
- `buildings.looks: BuildingLooks` (a `BuildingSkin`, passed to `new Building(scene, spec, skin?)`): `texture(b, lvl)` (the variant once baked, else base; queues), `dress(b)` (yard), `prebake(b, lvl)` (on reveal, and at `startRaise` for the next level), `update()` (idle slice, ≤4 ms after the first bake), `look(b)`, `stats()`, `inspect(b)`. Variants are refcounted and removed when no pad holds them; past the cap a pad takes tone 0, then the base.
- Harness: `H.cottages(region, n, at?, key?, lvl?)`, `H.looks(id?)`.
- Harness: `H.lvl(id, lvl)` sets a pad's level through the loader.
- S13c added pads only (101 → 244). Pad ids are new; no existing id or position changes.
- `render.mjs --free <region> [--near x,y] [--key k] [--n 12]` and `freeSpots(bp, r, region, { near, key, n }) → { near, key, spots: { x, y, d, road }[] }`: spots that pass every pad rule, plus 70 px (or half the road + 40) off roads, 120 px off claim stones and `RULES.campSiege` (600, the game's `CAMP_SIEGE`) off camps the region doesn't need burned (towers exempt); greedy, so a whole list can go in.
- Harness: `H.buildAll(lvl)` raises every blueprint pad (not wall pieces or gates) to `lvl`, capped per key, through the loader, and drains the variant bakes; returns `{ pads, standing, textures }`.

## S14: points of interest

*Status: landed (S14). [src/systems/PoiManager.ts](../../src/systems/PoiManager.ts), [src/systems/Modifiers.ts](../../src/systems/Modifiers.ts), art in [src/art/pois.ts](../../src/art/pois.ts).*

- `scene.pois: PoiManager`: `state(id) → 'unseen' | 'seen' | 'done'`, `interact(id) → boolean` (use it now: false when done, locked, unaffordable, or a kind not in `LIVE`), `lockedBy(id) → campId | poiId | null`, `count(kind)`, `popBonus()` (added in `recomputeBonuses`), `revealAt(x, y)` (called by `RegionManager.eraseFog`), `here`, `toJSON() → string[]` (done ids, blueprint order), `load(ids?)` (silent; shrines re-register; call before `buildings.load`), `inspect()`. `LIVE` = cache, lore, shrine, survivors, landmark, and (S15) barrow and relic. `POI_BY_ID`, `SHRINE_MODS`, `SURVIVORS` exported.
- Constants `POI { seeR 420, landmarkSeeR 1300, touch 50, landmarkTouch 220, loreDwell 1, loreShow 5.5, cardRange 280, cache { perTier, coins, wood, stone, metal, crystal }, coastStep 256 }` (config/balance).
- Events: `poi:seen { id, kind }`, `poi:done { id, kind }`, `poi:lore { id, name, text }` (every read; the HUD's parchment page).
- `scene.mods: Modifiers` (built before BuildingManager): `add(sourceId, ...mods: Mod[])` (replaces that source), `remove(id)`, `has(id)`, `value(stat, base)` = (base + Σadd) × Πmult (`mult` is a factor: +15% is 1.15), `list()`, `version`. `MOD_STATS`, `ModStat`, `Mod { stat, mult?, add? }`.
- Wired readers: `buildings.haulMultiplier` × `buildings.yieldMod(home)` (food.yield on farm/fishery, wood.yield on lumberCamp), `tradeIncome()`, `Building.hpMod(key, hp)` static (wall.hp on wall/gate; `levelHp(lvl?)`, `buildings.refreshWallHp()`), `Player.addXp` (hero.xp), Player regen (hero.regen), `ArmyManager` spawn hpMult (soldier.hp), infirmary aura (infirmary.heal), outpost aura (outpost.heal: base `OUTPOST.heal` at Lv.2, else 0). The other eight were wired in S15 (§S15).
- `scene.openChest(x, y, regionTier?)`: with a tier, the cache table (`POI.cache`), else the wave's.
- Deeds `a9` Loremaster (`loreRead` 12), `a10` Pilgrim (`shrinesRestored` 6) in `achievementStats()`.
- Charts: `POI_GLYPH` draws a shape per kind; `poiState` answers from `gs.pois`. Atlas names seen landmarks and shrines; `inspect()` adds `pois`, `named`.
- `FogMemory.anyWithin(x, y, r)`, `regions.exploredNear(x, y, r)`. Harness: `H.pois()`, `H.poi(id, seconds = 2)`.

## S15: relics

*Status: landed (S15). [src/systems/Relics.ts](../../src/systems/Relics.ts); barrows in `PoiManager` (`tickBarrow`, `breakOpen`, `watchGuards`, `plunder`); seals in [src/art/pois.ts](../../src/art/pois.ts); the strip in `PauseMenu.layoutRelics`.*

- `scene.relics: Relics` (built right after `scene.mods`): `grant(id) → boolean` (false when unknown or held; registers `mods.add(id, ...def.mods)`, lights its marker, emits `relic:granted { id, name }`), `has(id)`, `list() → RelicId[]` (`RELICS` order), `toJSON()`, `load(ids?, burnedCamps?)` (silent; also grants what a burned stronghold's boss held). Grants on `camp:burned` with `boss` via `BOSS_RELICS` (thornmother → thornCrown + heartOakSeed).
- `RELICS: RelicDef { id, name, source, effect, mods, colour, marker? }`, `RELIC_BY_ID`, `BOSS_RELICS`, `BARROW_RELICS` (barrowKing → barrowCrown, barrowMoor3 → captainsHorn). Ids: barrowCrown, captainsHorn, gallowsBell, thornCrown, heartOakSeed, overseersLash, wardensAegis.
- Barrows (`LIVE` now includes barrow and relic): struck by the hero's gathering blow every `POI.barrow.strike` within `reach` 70; hp `POI.barrow.hp` × (1 + 0.5 × (tier − 1)); breaks open to an `elite` guardian (`guard = true`, `home { id: barrowId, leash 460, siege 0 }`, hp × (1 + 0.8 tier), dmg × (1 + 0.2 tier)); its fall drops `POI.barrow.bag` and the relic; done then. `interact(barrowId)` breaks it open now. Taken off the field unbeaten → resealed. Unfinished barrows are not saved (full hp on load). `pois.relicHeld(markerId, silent?)`; relic markers are never stood on.
- **Every `MOD_STATS` stat now has a reader.** New: `res.mods` → `carryCapacity` (pack.size), `army.damageOf(def)` (soldier.damage), soldier move speed (army.speed), `abilities.cooldownOf(key)` (rally.cooldown; the HUD's sweep uses it), `workers.speedMod()` / `gatherMod()` (worker.speed / worker.gather, cycle time and the income estimate), `buildings.towerRange(b)` (tower.range), the hero's shots (hero.pierce, main attack only).
- Deed `a11` Reliquary (`relicsHeld` 7). Harness: `H.relics()`, `H.relic(id)`, `H.relicCheck()` (each relic's readers before and after).

## S16 and S17: enemies

*Status: S16 landed (walkers); S17 landed (bosses, the finale). Kits in [src/systems/bosses.ts](../../src/systems/bosses.ts) (pure) and [src/systems/BossKits.ts](../../src/systems/BossKits.ts); art in [src/art/bosses.ts](../../src/art/bosses.ts).*

- `EnemyKey` gains the walkers `'bogWretch' | 'thornling' | 'ashPriest' | 'cinderHound'` (S16), and the bosses `'gallowsKnight' | 'thornmother' | 'seamOverseer' | 'stairwarden'` (S17).
- `EnemyDef` (S16) gains `slows { mult, seconds }`, `pack`, `deathFx: 'splinters'`, `deathPatch { radius, dps, seconds }`, `projectileTex/Tint`, and `aura.heal` (hp/s to the others) / `aura.tint`.
- `systems/walkers.ts` (pure): `Slow`, `noSlow`, `applySlow(s, mult, sec)` (never stacks: strongest holds, clock refreshes), `tickSlow`, `slowMult`; `mergeAura(fx, src, self)` (each effect takes the strongest source; no self-heal), `auraHealed`; `WALKER_MIX`, `mixHand(hand, {own, region, tier}, campMix, packs)`.
- `Player.slow`, `Soldier.slow` (a `Slow`); `Enemy.auraHeal`. `EnemyManager.addPatch(x, y, deathPatch)`, `enemies.patches` (hound embers, 0.5 s bites on the hero and soldiers).
- Camp spawns are the real keys: campDrowned `bogWretch`, campThornmother `thornling` (5 a band), campStairwarden `ashPriest`, campForges `cinderHound`. Textures `enm_<key>`.
- S17 bosses (`boss: true`): gallowsKnight 3500, thornmother 3000, seamOverseer 4200 (range 180, aura speed ×1.2 at 280), stairwarden 5000. `bosses.ts`: `STRONGHOLD_BOSSES`, `isStrongholdBoss`, `BOSS_POST { dy 90, leash 420 }`, `BOSS_BAR_RANGE` 1100, `KITS` (S20's numbers), `crossed(prev, now, at)`, `due(s, dt, every)`, `newBinding / tickBinding(b, alive, dt) / wardenImmune(alive)`, `nearSegment`, `inArc`, `KitState`, `newKit`.
- `Enemy.kit: KitState | null`; `bossAttack` adds `'cleave' | 'rootLash' | 'whipcrack' | 'bash'`. `enemies.kits: BossKits` (`handles/tick/choose/release/onStrike`), `enemies.telegraphCharge(e)` (the warlord's, shared). Summons take the boss's `home`; bound priests are `guard`s.
- A boss with a `home` takes the HUD bar only within `BOSS_BAR_RANGE` of the hero. `CampManager.bossHp: Map<bossKey, hp>` (hurt standing bosses; saved in `campHealth` under the key). `CombatSystem.god` (dev).
- `Relics` also grants `BOSS_RELICS[key]` on `enemy:killed` with `boss` (the camp's burning still grants too).
- The finale: `onCauseway(x, y)` in `CausewayFire.ts`; `GameScene.updateFinale` raises the Regent at `THRONE` (guard, home `throne`, leash 820) once the causeway is unsealed and the hero stands on it; risen = `quests.finalBossHp > 0` after load. `ApproachWorld.ended?()` (GameScene: `quests.finalBossDefeated`): `muster` is null for every non-raid approach. `QuestManager.stampVictory()` on her fall emits `campaign:complete` once.

## S18: campaign

*Status: landed (S18). Goals in [src/config/quests.ts](../../src/config/quests.ts), evaluation and `targetFor` at [src/systems/QuestManager.ts:234](../../src/systems/QuestManager.ts#L234), static targets in [src/systems/questAnchors.ts:57](../../src/systems/questAnchors.ts#L57).*

- `QuestGoal` gains `{ claim, region }`, `{ burn, camp }`, `{ restore, amount }` (shrines restored; was planned as `shrine`), `{ relic, amount }` (held), `{ reach, poi }` (POI done), `{ travel }` (a `waystone:travelled` this session), `{ line, line }` (pieces standing / all), `{ settle, region, count }` (standing buildings, walls and gates excluded). `build` takes `region?`. `zone` counts `regions.claimedCount` (the hold included). `boss` also reads a burned stronghold or its `guardsDown` slot.
- `QUESTS` (53: 06's 46 plus 7 village quests), ids `a1…e5`: the letter is the act. `ACTS: { roman, name, blurb }[]`, `actOf(q) → 1..5`, `CAMP_BANNERS[campId] → [title, sub]` (campFerrow, campIrontooth). Deeds `a12` Heartwood (`thornmother`), `a13` Slagbreaker (`forges`), `a14` Surveyor (`regionsSeen`, a fog scan every ~90 updates), `a15` Wayfarer (`waystonesLit` of every outpost pad + lone stone).
- Event `act:begun { act, roman, name, blurb }` as the chain enters an act (a new game plays Act I; a load plays none). The HUD ribbons it; `HUD.toast` now queues up to 3 while one is up.
- `questAnchors.ts` (pure): `goalAnchors(goal) → Anchor { id, x, y, region? }[]` (empty for live-only goals), `claimAnchor`, `lineAnchors`, `waystoneAnchors`, `relicAnchors`, `bossCamp(key)`, `NOT_SETTLED`, `HALL_ANCHOR`. `buildings.linePads(lineId) → Building[]` (in order, gates included).
- Save: the quest blob's shape is unchanged. A save whose `done` holds ids not in `QUESTS` (the old `q1…`) restarts at a1 and, on the first update, walks the chain silently past goals already met.
- The arrow: S12's `questRoute` already follows the nav route when the target is off-screen; S18 adds nothing there. The quest log shows the current act only.
- Harness: `H.quests()`, `H.questStep(n)`.

## S19: save v2

*Status: landed (S19). [src/systems/SaveManager.ts](../../src/systems/SaveManager.ts), [src/config/version.ts](../../src/config/version.ts).*

- `SaveBlobV2` is the one schema (`SaveBlob` is gone). `parseSave(text, warn = false) → SaveBlobV2 | null` (exported): over `SAVE_LIMIT_BYTES` (64 KB, also `MAX_SAVE_FILE_BYTES`) or bad JSON → null; `validShape` (types and ranges, strict) → null; then `tolerate` drops ids the world no longer has, keeps each id once, and with `warn` logs one `console.warn('[save] dropped ids …', { field: ids })`. `load()` and `inspectImport` warn; `hasSave`, `peek` and the autosave's check do not.
- Known ids: pads are `PADS` plus `layWallLine(line)` pieces and gates for every `WALL_LINES` line (a piece past a line's end is unknown), and legacy `wall\d{1,3}` (remapped on load). A known pad keeps its key's level range; an unknown pad's record is dropped whatever its level.
- `save()` writes `compact(blob)`: worker and soldier x/y rounded, their hp `max(1, ceil)`, building hp `ceil`; `progress` only if non-empty, `peakWorkers` only if > 0, `trains` only if set; a worker's `carrying` (2 dp) only if > 0, `sheltered` only if true, `carryType` never (the load never read it). Over 64 KB it writes `lean`: workers `{ key, homeId }` only, `army` without `units`. Still over → not written, `save()` false, the last slot kept.
- `GAME_VERSION = 'Beta 1'` (`config/version.ts`): the only place the build's name lives. The title shows it top right; every save writes `meta: { version }`.
- v1: no key named `*.v1` for saves is ever read, written or deleted (settings stay `emberhold.settings.v1`).

## S20: balance

*Status: landed (S20). [src/config/waves.ts](../../src/config/waves.ts), [src/config/balance.ts](../../src/config/balance.ts), [src/dev/probe.ts](../../src/dev/probe.ts).*

- `WAVE_PACE = 1.5`; `waveDef(n)`: night n threatens like first-pass night n / 1.5 (scripted `WAVES` land on 1, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18; between them counts are interpolated, no banner or boss; procedural past 18, a boss every 8 nights, a Warlord every 16).
- `NIGHT_REWARD { base, perWave }`, `nightReward(wave) → coins` before chapels bless it; `WaveManager.endNight` reads it.
- `OPENS` (8 / 12 / 17) and `frontsFor` (1 / 2 / 3 / all from 1 / 8 / 15 / 30) in `systems/Approaches.ts`.
- `VILLAGE.cottagePopMax = 150`, `VILLAGE.market.sells = true`, `goodsPerCoin = 4`.
- Dev: `H.probe.start(opts?) / run(untilWave, wallMs) / report()`; `H.pump(s, stepMs, headless)` steps without drawing. `run` returns `{ paused }` if the Game scene stops (the hall's fall).

## S21: performance

*Status: landed (S21). [src/dev/bench.ts](../../src/dev/bench.ts); measured table in [04 §Performance budgets](design/04-systems.md#performance-budgets-checked-in-s21).*

- Dev: `H.bench(opts?) → Promise<report>` (`seconds` 60, `stepMs` 16.7, `wave` 30, `tier` 3, `level` 5, `workers` 500, `soldiers` 150, `keep`, `prof`, `paced` true); `H.bench.fixture(opts?)`, `H.bench.last()`. Paced runs take `seconds` of wall, so kick off with `.then(r => window.__b = r)` and poll. The fixture puts back the saves a new game writes.
- `RouteMarks` draws only on-screen dots, one per 14 px cell where routes overlap. `PathFinder.tick` stops 0.4 ms short of its slice.

## Save fields

`SaveBlobV2` in `SaveManager.ts`, consolidated by S19. "Ids" means unknown ones are dropped by `tolerate` (one warning), not refused; a wrong type or range still refuses the whole save. A session that adds persistent state adds a row here, the field to `SaveBlobV2`, `validShape`, `tolerate` (if it holds ids) and `load`, a row in design 07 §Schema, and a round trip in `tests/save-portability.test.mjs`.

| Field | Owner | Shape |
|---|---|---|
| `v` | S04 | `2`, the schema (not the build). Anything else refuses the save |
| `meta` | S19 | `{ version: string }` (≤ 64 chars), `GAME_VERSION` of the build that wrote it. Optional (older v2 saves) |
| `savedAt`, `playtime` | v1 | ms since epoch, seconds played; finite, ≥ 0 |
| `res` | v1 | `{ carried, stored, totalGathered }` bags of every `RESOURCE_ORDER` key (finite, ≥ 0), `discovered: string[]` |
| `player` | v1, S04 | `{ level 1–999, xp ≥ 0, hp, x, y }`, x/y inside `WORLD` |
| `upgrades` | v1 | `[id, rank 0–10000][]`; ids in `UPGRADE_BY_ID`, once each |
| `buildings` | v1, S09b | `{ padId, level, hp, progress?, peakWorkers? (0–500), trains? }[]`; pads from `PADS`, laid wall pieces `${line}.${k}`, gates, legacy `wall\d+` (remapped on load, S09b); level ≤ the key's levels; once per pad |
| `workers` | v1 | `{ key, homeId, x?, y?, hp?, carrying?, carryType?, sheltered? }[]` ≤ 500; `key` in `WORKERS`, `homeId` a known pad |
| `army` | v1 | `{ counts: Record<SoldierKey, 0–500>, units?: { key, x, y, hp }[] ≤ 500, totalRecruited?, holding? }`; soldier keys in `SOLDIERS` |
| `waves` | v1, S09 | `{ wave ≥ 0, wavesCleared ≥ 0, phase, phaseT? (−1 … max(dayMax, nightSeconds) + 1) }` |
| `quests` | v1, S18 | `{ index 0–QUESTS.length, done, achievements: string[], kills?, bossKills?, campsCleared?, zonesClaimed?, defeatedBosses?, finalBossHp? (0–100000), victoryAt?, victoryWave?, victoryPlaytime? }`; unknown `done` ids restart the chain at a1 and walk it silently (S18) |
| `regions` | S04, S08 | `RegionId[]` claimed, `hold` included (`RegionManager.toJSON`, in `REGIONS` order); ids |
| `exploredFog` | S03 | `FogMemory.toJSON()`: `r:` runs or `b:` bitset only, length ≤ `FogMemory.maxEncodedLength(WORLD.width, WORLD.height)` (3842) |
| `camps` | v1, S04 | burned camp ids (`CAMPS`); ids |
| `campAwake` | S08 | camp ids awake and standing (optional); ids. Load also wakes any camp with a `campHealth` entry |
| `campHealth` | S04, S17 | `Record<id, hp 0–100000>`: standing camps' hp and, from S17, hurt stronghold bosses' hp under the boss key; ids from `CAMPS` ids and `boss` keys |
| `campGuards` | S10 | fallen guards `${campId}.boss` / `${campId}.brazier${k}` (optional); ids from `guardIds(camp)`. Guards not listed respawn at full hp on an awake camp |
| `waystones` | S11 | lit waystone ids: outpost pad ids, `wsHall`, `wsIsle` (optional); ids. `wsHall` is lit whether listed or not |
| `pois` | S14 | done POI ids (optional); ids from `POIS`. Seen is not saved: it is rebuilt from `exploredFog` |
| `relics` | S15 | `RelicId[]` held (optional); ids from `RELICS`. Loaded right after `pois`; burned strongholds in `camps` also grant their boss's relics |
| `abilities` | v1 | `{ slots: { key, unlocked }[], ultimate: boolean }`; unknown slot keys are ignored by the load |
| `combat` | v1 | `{ kills?, bossKills? }` lifetime, whole numbers ≥ 0 |
| `coreLost` | v1 | `boolean` (optional; derived from a level-0 hall if absent) |
