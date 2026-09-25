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
  - `toJSON()` returns the shorter of `b:` + unpadded base64 bitset and `r:` + alternating run lengths (unexplored first) as base64url varints (5 value bits, bit 6 = more). A bare base64 string is the v1 bitset, still read until S19.
  - `static maxEncodedLength(width, height, cell = 64)` = the `b:` length (3842 new world, 398 old). `validSave` checks `exploredFog` against it.
  - `static fromJSON(encoded, width, height, cell = 64) → FogMemory`.
- `ZoneManager` exports `FOG_SCALE = 8`; the fog RenderTexture is `ceil(WORLD / 8)` and the brush scales by `2 / FOG_SCALE` (~960 px reveal).
- `src/systems/Culler.ts` (type-only Phaser import; node-testable):
  - `new Culler({ bucket = 1024, margin = 256, interval = 150, moveStep = 64 })`; `GameScene.culler`, updated every frame after `terrain.update`.
  - `culler.add(obj, x, y, radius)` (obj: anything with `cameraFilter`; the disc should cover the sprite at its largest) and `culler.remove(obj)`.
  - `culler.update(camera, now?)` hides objects whose disc misses the view plus 256 px by setting the camera's bit in `cameraFilter`. It never touches `visible` or `active`: game logic owns those.
  - `culler.stats() → { total, shown }`; F2 shows it.
  - Registered: node sprites (`NodeManager.add`), building sprite and ghost (`BuildingManager.addPad`), camp labels. Enemies, allies, projectiles and TerrainChunks images are not.

## S04: world seam

*Status: landed (S04). `WORLD` at [src/config/world/index.ts:20](../../src/config/world/index.ts#L20), `raster()` at [:44](../../src/config/world/index.ts#L44), `ZoneManager.zoneAt` at [src/systems/ZoneManager.ts:280](../../src/systems/ZoneManager.ts#L280), save `KEY` at [src/systems/SaveManager.ts:13](../../src/systems/SaveManager.ts#L13).*

- `src/config/world/index.ts` replaces `src/config/map.ts`, which is deleted, and exports:
  - `WORLD = { width, height, centerX, centerY, tile }` (:20). `centerX/Y` is the map's middle, **not** home: use `HALL`. (`balance.ts` no longer re-exports it: S05.)
  - `HALL = { x, y }` (:40, from the `hall` pad), `REGIONS: RegionDef[]` (:34, `RegionBP & { index }`), `REGION_BY_ID`, and `type RegionId, Biome`.
  - `PADS: PadSpec[]` (:75; `region`, `requiresTownHall` from `hall`, `startLevel`) (every blueprint pad since S13; `FUTURE_PADS` was deleted in S13).
  - `CAMPS: CampSpec[]` (:146; `region`, `reward: ResourceBag`, bracketed spawn keys resolved by `resolveSpawnKey`), `NODE_CLUSTERS: NodeCluster[]` (:167; `region`; fish fields since S13), `NODE_DEFS`.
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
  - `validSave` rejects `v !== 2`, so a v1-shaped save or file is refused quietly and the game starts fresh.
  - `regions: RegionId[]` replaces `zones`; every id must be in `REGION_BY_ID`.

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
- Saves: `maxLevelForPad` accepts `${line}.${k}` for any `WALL_LINES` id, every `WALL_LINES` gate id, and still `wall\d+`; `BuildingManager.load` remaps old `wall\d+` entries (Save fields).
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
  - **S17 swap point:** `CampManager.spawnGuard`, the `gid === 'boss'` branch: it spawns `'elite'` with a renamed def at `(camp.x, camp.y + 90)`. Spawn the boss's own `EnemyKey` there instead; keep `e.guard = true` and `e.home`.
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

*Status: planned.*

- `BuildingKey` and `PadKey` gain `'cottage' | 'granary' | 'mill' | 'market' | 'chapel' | 'watchPost' | 'docks'` ([05 §A settled country](design/05-content.md#a-settled-country-s13b-s13c)).
- `buildings.dropoffFor(x, y, res?)`: with `res` of food or fish, the nearest standing granary within 900 px comes first.
- `buildings.localBonus(key, x, y) → number`: 1 plus the best in-range mill bonus (docks use the same shape for the trading post).
- Art: `STYLE_BY_BIOME` (`'timber' | 'woodland' | 'fen' | 'stone' | 'ash'`) and `ensureBuildingTexture(key, lvl, style, variant) → string`, baked lazily; the variant is seeded from the pad id.
- S13c adds pads only (about 238 in all). Pad ids are new; no existing id or position changes.

## S14: points of interest

*Status: planned.*

- `src/systems/PoiManager.ts`:
  - `state(id) → 'unseen' | 'seen' | 'done'` and `interact(id)`.
  - Events: `poi:seen` and `poi:done`.
- `src/systems/Modifiers.ts`:
  - `mods.add(sourceId, { stat, mult?, add? })` and `mods.value(stat, base)`.
  - Stats are listed in [05-content.md §Modifiers](design/05-content.md#modifiers).

## S15: relics

*Status: planned.*

- `relics.grant(id)`, `relics.has(id)` and `relics.list()`. Each relic registers its modifiers through `Modifiers`.

## S16 and S17: enemies

*Status: planned.*

- `EnemyKey` gains:
  - the walkers `'bogWretch' | 'thornling' | 'ashPriest' | 'cinderHound'`;
  - the bosses `'gallowsKnight' | 'thornmother' | 'seamOverseer' | 'stairwarden'`.
- The blueprint's bracketed placeholder spawns (such as `'bogWretch[shield]'`) are resolved in S16.

## S18: campaign

*Status: planned.*

- `QuestGoal` gains:
  - `{ type: 'claim', region }`
  - `{ type: 'burn', camp }`
  - `{ type: 'restore', shrine }`
  - `{ type: 'relic', amount }`
  - `{ type: 'reach', poi }`
  - `{ type: 'travel' }`
  - `{ type: 'line', line }`
  - `{ type: 'settle', region, count }` (buildings standing in a region)

## Save fields

Each session that adds persistent state lists its field here: the owner, then a one-line shape. S19 consolidates them.

| Field | Owner | Shape |
|---|---|---|
| `v` | S04 | `2` (the blob field is `v`, not `version`) |
| `regions` | S04 | `RegionId[]` claimed, `hold` included; replaces v1 `zones` |
| `exploredFog` | S03 | `FogMemory.toJSON()`: `r:` runs or `b:` bitset (v1 bare base64 still read), length ≤ `FogMemory.maxEncodedLength(WORLD.width, WORLD.height)` |
| `regions` | S04, S08 | unchanged shape; S08 owns the rules (`RegionManager.toJSON`, in `REGIONS` order) |
| `campAwake` | S08 | `string[]` of camp ids awake and standing (optional; every id in `CAMPS`). Load also wakes any camp with a `campHealth` entry |
| `buildings[].padId` | S09b | wall pieces are `${line}.${k}` (`palisade.0`–`palisade.87`), gates their blueprint ids. Old `wall\d+` still validates; on load each new palisade piece the save does not name takes the level and hp of the nearest old pad within 72 px (128 px within 130 px of a gate). The next save writes the new ids |
| `campGuards` | S10 | `string[]` of fallen camp guards, `${campId}.boss` or `${campId}.brazier${k}` (optional; ≤ 64; camp ids from `CAMPS`). Guards not listed respawn at full hp on an awake camp |
| `waystones` | S11 | `string[]` of lit waystone ids: outpost pad ids, `wsHall`, `wsIsle` (optional; ≤ 64; unknown ids refuse the save). `wsHall` is lit whether listed or not |
| _(add rows as they land)_ | | |
