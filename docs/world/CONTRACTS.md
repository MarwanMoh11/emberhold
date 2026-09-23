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
  - `PADS: PadSpec[]` (:75; `region`, `requiresTownHall` from `hall`, `startLevel`) and `FUTURE_PADS: PadBP[]` (:78; outpost, fishery, tradingPost).
  - `CAMPS: CampSpec[]` (:146; `region`, `reward: ResourceBag`, bracketed spawn keys resolved by `resolveSpawnKey`), `NODE_CLUSTERS: NodeCluster[]` (:167; `region`, no fish), `NODE_DEFS`.
  - `WALL_LINES: WallLineSpec[]` (:87; `WallLineBP & { active }`, only the palisade active) and `WALL_RING` (:94; the palisade's bounds, `step` and gates `gateN/S/E/W`).
  - `SPAWN_GATES`, `GATE_BY_ID` (:116): **TEMP until S09**, six `GateId`s at the hold's edge.
  - `APPROACHES`, `MAWS`, `CROSSINGS`, `ROADS`, `POIS`, `THRONE`, `FEATURES`, passed through from the blueprint.
  - `raster(): WorldRaster` (:44), built once and memoised.
- `ZoneId` is now `RegionId`. `PadSpec`, `CampSpec`, `NodeCluster`, `Building` and `ResourceNode` carry `region` (was `zone`).
- `ZoneManager` keeps its method names: `zoneAt(x, y)` reads `raster().region` (:280), `lockedZoneAt → RegionDef | null`, `isUnlocked(id)`, `claimPoint(id)` (the blueprint's `claim.{x,y}`), `unlock(id, silent?)`, `canUnlockId(id)`. Locked regions are one `Graphics` each (fill + fence), registered with the culler. The soft barrier (`exitToward`, :391) pushes toward the nearest border whose far side is claimed, else toward `HALL`.
- `src/world/Terrain.ts`: `biomeColour(b: Biome) → number` is the biome's base tone, used by the minimap. (`biomeAt` is internal since S07.)
- Dev harness ([src/dev/harness.ts](../../src/dev/harness.ts)):
  - `H.tp(x, y)` teleports, centres the camera and primes the chunks.
  - `H.claim(id)` calls `zones.unlock(id, true)` (silent: no event, no bonus recompute).
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
- `EnemyManager` checks `lineClear` to its target on each retarget (`Enemy.los`); without it, it steps along `field('hall')`. A walled next cell latches that wall as the target. S09 swaps `'hall'` for the enemy's leg.
- `BuildingManager.syncNav` registers built `wall` pads (radius 40) on build, destroy, demolish and load. Gates and other buildings stay out of the grid.
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

*Status: planned.*

- `RegionManager` is `ZoneManager` renamed. `zones` is aliased as `regions` on the scene for one session and then removed.
  - `claimed(id)` and `claimedAt(x, y)`.
  - `claimMask(): Uint8Array` gives one byte per raster cell, 1 if claimed.
  - `canClaim(id) → { ok, reason }`, where `reason` is one of `'hall' | 'camps' | 'cost' | 'adjacent'`.
  - `claim(id)` emits `region:claimed` with `{ id }`.
- Camps gain `state: 'asleep' | 'awake' | 'burned'`. `CampManager.wake(id)` exists, and a camp emits `camp:burned` with `{ id }`.

## S09: approaches

*Status: planned.*

- `src/systems/Approaches.ts`:
  - `muster(id) → { id, x, y, kind: 'camp' | 'maw' } | null`
  - `route(id) → Pt[]`, the path from the muster through `via` to the hall.
  - `spawnPoint(id) → Pt`, which applies the 2400 px clamp.
  - `live(wave) → ApproachId[]`
- `WaveDef.gates` becomes `WaveDef.approaches`.
- Enemies gain `marching: boolean`: 2.4× speed and no aggro until they stand on claimed ground.
- Event `night:warning` fires with `{ approaches, routes }`, during the `warningSeconds` before dusk.

## S10: camps and lines

*Status: planned.*

- `CampSpec.tier` (`'warcamp' | 'stronghold' | 'fortress'`), plus `leash` and `wakeRadius`.
- `nav.setSealed(crossingId, sealed)`. The Regent's Causeway is sealed until `campAshgate` burns.
- Every blueprint `WALLS` line becomes pads with ids `${lineId}.${k}`, and its gates. Each line is buildable from `hall`.

## S11: outposts and waystones

*Status: planned.*

- `BuildingKey` gains `'outpost'`.
- `buildings.dropoffFor(x, y)` (landed in S06) extends to return the depot or the nearest outpost by path.
- `scene.respawnPoint()` returns the hall or the nearest safe outpost.
- `waystones.list() → { id, x, y, active }[]`, `waystones.travel(id)` (daytime only) and `waystones.activate(id)`.

## S12: minimap and atlas

*Status: planned.*

- `Minimap` shows a local window of 2400 px radius.
- `Atlas` is full-screen on `M` or Back. It shows regions, claims, discovered POIs and tonight's routes, and clicking a waystone travels there.

## S13: fish and trade

*Status: planned.*

- `NodeType` gains `'fish'`. Fish nodes are placed on **water** cells inside their field.
- `BuildingKey` gains `'fishery'` (fish becomes food) and `'tradingPost'` (passive coins per level).

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

## Save fields

Each session that adds persistent state lists its field here: the owner, then a one-line shape. S19 consolidates them.

| Field | Owner | Shape |
|---|---|---|
| `v` | S04 | `2` (the blob field is `v`, not `version`) |
| `regions` | S04 | `RegionId[]` claimed, `hold` included; replaces v1 `zones` |
| `exploredFog` | S03 | `FogMemory.toJSON()`: `r:` runs or `b:` bitset (v1 bare base64 still read), length ≤ `FogMemory.maxEncodedLength(WORLD.width, WORLD.height)` |
| _(add rows as they land)_ | | |
