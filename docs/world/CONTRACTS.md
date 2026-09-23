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
  - `.stats() → { resident, baked, queued, frameMs, worstFrameMs }`. `GameScene.stats.chunks` carries it to the F2 panel.
  - `type ChunkCamera = Pick<Camera, 'scrollX' | 'scrollY' | 'width' | 'height' | 'zoom'>`.
- `type ChunkPainter = (ctx, wx, wy, size, scale) => void` paints world rect `[wx, wx+size)²`. `ctx` arrives already transformed world px → canvas px (`scale`, origin at world 0,0) and clipped; strokes may land past the rect. It must be a pure function of world position and static config, so slices and chunks agree at every join.
- `paintTerrainRect` in `src/world/Terrain.ts` is the painter. Its brushwork draws in texels at `S = 0.5` after `ctx.scale(1/S)`. Per-biome colour: `biomeAt` (which biome), `TONES` (palette per biome), `toneAt` (wash colour), `markAt` (per-biome marks). Scatter is dealt per 128 px cell with `strokeRng(cell, k, seed)`; set pieces (roads, plaza, camps, gates) are laid out once and drawn where their box meets the rect.

## S03: fog and culling

*Status: planned.*

- `FogMemory(width, height, cell = 64)`, sized from the world.
  - `toJSON()` returns a compact string.
  - The static `FogMemory.maxEncodedLength(width, height, cell)` is what save validation uses in place of the old hard limit of 10000.
- `src/systems/Culler.ts`:
  - `culler.add(obj, x, y, radius)` and `culler.remove(obj)`.
  - `culler.update(camera)` makes objects whose bounds miss the view (plus a 256 px margin) invisible and inactive.
  - Nodes, building sprites and props register with it. Enemies do not: they are few and they move.

## S04: world seam

*Status: planned.*

- `src/config/world/index.ts` replaces `src/config/map.ts`, which is deleted, and exports:
  - `WORLD = { width, height, centerX, centerY, tile }`: the old `balance.WORLD` shape, which moves here.
  - `HALL = { x, y }` and `REGIONS: RegionDef[]`, where `RegionDef` is the blueprint's `RegionBP` plus `index`.
  - `PADS: PadSpec[]`, `CAMPS: CampSpec[]`, `NODE_CLUSTERS: NodeCluster[]`. These keep the old field names, with `zone` becoming `region`.
  - `WALL_LINES: WallLineSpec[]` (only the palisade is active until S10).
  - `APPROACHES`, `MAWS`, `CROSSINGS`, `ROADS`, `POIS`, all passed through from the blueprint.
  - `raster(): WorldRaster`, built once and memoised.
- `ZoneId` becomes `RegionId`. `ZoneManager` keeps its method names (`zoneAt`, `isUnlocked`, `claimPoint`, `unlock`), backed by the region raster.
- New dev-harness helpers:
  - `H.tp(x, y)` teleports.
  - `H.claim(id)` claims without paying.
  - `H.reveal()` clears the fog.
  - `H.where()` returns `{ x, y, region }`.
  - `H.world()` returns counts.
- Save:
  - The storage key becomes `emberhold.save.v2`, with `version: 2`. The v1 key is never written or deleted.
  - Loading a v1-shaped save into v2 is refused quietly: the game starts fresh.

## S05: NavGrid

*Status: planned.*

- `src/world/NavGrid.ts`: `class NavGrid`, built from `raster()`.
  - `blocked(i)`
  - `passableAt(x, y)`
  - `setBlocker(id, x, y, radius, on)` for wall pads and built walls. A blocker costs `WALL_COST` rather than being infinite, so a sealed hold is still reachable.
  - `slide(x, y, dx, dy, radius) → { x, y }` is collision for any walker.
  - `field(target: 'hall' | \`via:${crossingId}\`) → FlowField`. Fields are cached and rebuilt lazily when `version` changes. Rebuilds are spread across frames, up to 6 ms per frame.
  - `FlowField.dir(x, y) → { dx, dy }` and `FlowField.dist(x, y)`.
- `EnemyManager` steers with `nav.field(leg)` instead of straight lines toward `WALL_RING` gates.
- The hero, enemies and allies collide through `slide`. Projectiles ignore terrain: arrows over the river are the point of towers at fords.

## S06: ally pathing and roads

*Status: planned.*

- `nav.findPath(ax, ay, bx, by) → Pt[] | null` is an A* search with an LRU cache keyed by coarse start and end cells.
- `src/world/PathFollower.ts`: `follower.set(path)` and `.step(dt, speed) → { x, y, done }`.
- `nav.onRoad(x, y) → boolean` and `ROAD_SPEED = 1.2`, applied to the hero, soldiers and workers.
- Workers pick nodes by **path** distance of 760 px or less, not straight-line distance.

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
- `buildings.nearestDropoff(x, y)` returns the depot or an outpost.
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
| `version` | S04 | `2` |
| `exploredFog` | S03 | FogMemory string, length ≤ `maxEncodedLength` |
| _(add rows as they land)_ | | |
