# 04 · Systems

The technical specs. Each section names the session that builds it, and [CONTRACTS.md](../CONTRACTS.md) has the resulting API.

## One raster (S01)

- **What it is.** `src/world/raster.ts` turns the blueprint into 32 px cells: 320 × 288 = 92,160 cells. Each cell has:
  - a terrain code (land, sea, water, cliff or lava);
  - `under`, the terrain code before crossings were carved;
  - a crossing index;
  - a region index;
  - a road flag.
- **Who uses it.** The lint tool, the NavGrid, the region map, road speed and the atlas all read this **one** module. The game and the lint can't disagree about what is passable.
- **How it is built.** Paint order, later overwriting earlier:
  1. regions;
  2. sea;
  3. rivers (width interpolated along each segment);
  4. lakes (the isle cut back to land);
  5. cliffs;
  6. lava rivers;
  7. the caldera ring;
  8. pools;
  9. crossings, carved last. Each is a strip of `width` from `a` to `b`, marked land, and keeps its `under` so fords can slow walkers.
- **Sealed crossings** (`sealedUntil`) count as impassable while they are sealed.

## Chunked terrain (S02)

Today `buildTerrain` paints one canvas the size of the world at `SCALE 0.5`, from a noise field at `FIELD 0.25`. At 10240 × 9216 that canvas would be 5120 × 4608: over the 4096 texture limit on most phones, and about 94 MB.

- **Chunks** are 1024 px of world, baked to 512 × 512 canvases, which gives 10 × 9 = 90 chunks. At most **24** are resident at once (about 24 MB), kept in an LRU.
- **Baking.** Bake the chunks in the camera view plus a margin of one, nearest first. Stay within **4 ms per frame**, spilling to the next frame when over. The first frame after boot bakes everything visible before the title fades.
- **Painter.** A `ChunkPainter` paints any world rect **deterministically**. Noise is sampled from world coordinates with a seeded hash; there is no global field array. Paint each chunk with a 16 px overdraw and clip it, so seams never show.
- **What goes in the texture:** ground (biome), features (water, cliff, lava), crossings, roads, and ground decals. Trees, rocks and props stay sprites, because they are culled.
- **Claim tint** (S08) is painted by the painter too, reading the claim state. Claiming a region calls `invalidate(regionBBox)`.

## Fog and culling (S03)

- **Fog.**
  - `FOG_SCALE` goes from 4 to **8**, giving a RenderTexture of 1280 × 1152.
  - FogMemory keeps 64 px cells (160 × 144 = 23,040), sized from the world, not from constants.
  - The save encoding is S03's choice, as long as it is compact: a bitset or run-length encoding. Validation uses `FogMemory.maxEncodedLength(...)` in place of the old hard limit of 10000 characters.
- **Culling.**
  - `Culler` keeps a spatial hash (1024 px buckets) of static display objects: nodes, building sprites, pads, props and labels.
  - Every 150 ms, or when the camera moves more than 64 px, it hides and deactivates objects that are more than 256 px outside the view.
  - Enemies, allies and projectiles are not culled. They are few, they move, and they have to keep simulating.
  - Game logic must **never** read `visible`.

## NavGrid and the horde (S05)

- **The grid.** `NavGrid` wraps the raster.
  - **Blockers.** Built wall pads mark their cells at `WALL_COST = 40` (40× a normal step). Gates are always free. Other buildings don't block pathing; they block by collision, as they do today.
  - **Flow fields.** There is one field for `'hall'` and one per via crossing, each an 8-way Dijkstra from its target.
  - **Storage.** Each cell stores its distance and an **Int8 direction** (0–7) to the best neighbour. Enemies read the direction, which is O(1).
  - **Rebuilds.** They happen only when blockers change (a wall built or destroyed) or a crossing unseals. A rebuild is sliced at **6 ms per frame**, and the old field keeps serving until the new one is ready.
- **Steering.** Enemies take the direction from their leg's field, blend it with today's separation and avoidance, and move with `slide`.
  - An enemy whose next cell is a blocker attacks the wall pad there. This reproduces today's "attack the ring" behaviour without the nearest-gate special case.
  - Fords multiply speed by the crossing's `slow` while `under` is water.
- **Collision.** `slide(x, y, dx, dy, r)` samples four points on the walker's circle. When the move would enter an impassable cell, it tries the x and y components separately, which slides the walker along the edge. The hero, enemies and allies all use it.
- **Projectiles ignore terrain.** Arrows over the river are the whole point of towers at fords.

## Ally pathing and roads (S06)

- **Pathfinding.**
  - `findPath` is an 8-way A* with an octile heuristic, followed by string-pulling (line-of-sight checks on the raster).
  - Paths are cached in an LRU of 256, keyed by `(startCell >> 2, goalCell >> 2)`, and the cache is cleared when `version` changes.
  - Each search may explore at most 20,000 nodes and returns null past that. The caller then falls back to walking straight.
- **Workers** path from home to node to drop-off. Node choice uses path distance within `SEARCH_RADIUS` (760). The drop-off is the nearest depot, or an outpost after S11.
- **The army.** When there is line of sight to the hero, soldiers steer straight there. Otherwise they path to the hero and repath every second, or whenever the hero moves more than 200 px.
- **The hero** steers directly and collides with `slide`. There is no pathing.
- **Roads.**
  - The raster's `road` flag comes from `ROADS`, using each road's `width`.
  - The hero, soldiers and workers move at `ROAD_SPEED` (1.2×) on road cells. Enemies never get the bonus.
  - Roads are painted into the terrain in S07.

## Regions and claims (S08)

- **Membership.** Region membership comes from the raster. `claimMask` holds one byte per cell and is rebuilt on claim.
- **Border stones.** The old zone banner, standing at `claim.{x, y}`. The hero pays by standing on it, like funding a build today.
- **`canClaim(id)`** requires all of these:
  - the hall is at or above the region's level;
  - the `claim.from` region is claimed;
  - every camp in `requiresCamps` is burned;
  - the player can afford the cost.

  Each failure has a reason string for the tooltip.
- **Before a region is claimed:**
  - its pads, lines and outposts are hidden;
  - its camps sleep (see [03](03-nights-and-camps.md#camps-20));
  - its ground is painted desaturated and darker.
- **After it is claimed:**
  - a region banner plays;
  - its pads appear (subject to each pad's `hall`);
  - its camps wake;
  - its chunks are invalidated and repainted.
- **The fog sketch.**
  - Unexplored ground is vellum, as today.
  - Explored but unclaimed ground is sketched: desaturated, with borders drawn.
  - Claimed ground is full colour.

## Outposts and waystones (S11)

**The outpost** is a new building, and every non-hold region has exactly one outpost pad.

| Level | Cost | Gives |
|---|---|---|
| 1 | 150 coins, 100 wood | a **drop-off** for the hero and workers; a **waystone**; a **respawn** point; a 600 px fog light |
| 2 | 300 coins, 150 stone | + 50% hp; heals allies within 220 px out of combat (Kettle Springs makes it a Lv.1 infirmary) |

- **Respawn.** The hero respawns at the outpost nearest to where they died, as long as no enemy is within 600 px of it and it isn't burning. Otherwise they respawn at the hall.

**Waystones** stand on every built outpost, plus `wsHall` and `wsIsle`.
- **Activating.** Walk into a waystone once.
- **Travelling.** Stand on an active stone, then pick a destination from the atlas (or a list, on a phone).
  - The trip takes a 1.2 s channel, which damage interrupts.
  - **By day** you can go to any active stone. **At night** you can only go to the Hall Stone, which is the "rush home" button.
  - Soldiers within 500 px come with you and are placed in a ring at the destination.

## Minimap and atlas (S12)

- **Minimap.** Stays in the HUD but shows a **local** window, 2400 px around the hero. It shows the terrain thumbnail, fog, pads, enemies and tonight's routes.
- **Atlas.** `M` or Back opens it full screen.
  - The base is a one-time bake of the world at 1/16 scale (640 × 576) from the chunk painter at low detail.
  - Over it go:
    - fog;
    - region borders and names, for explored regions;
    - claim state;
    - camps and POIs, once seen;
    - outposts and waystones;
    - tonight's routes;
    - the hero.
  - Pan and zoom by drag and pinch. Clicking a waystone travels, when the hero stands on one.

## Performance budgets (checked in S21)

Measured by `H.bench()` (S21, `src/dev/bench.ts`): tiers 1–3 claimed, every pad at its top level (walls laid), 297 workers, 150 soldiers, wave 30 with three fronts (south, west, southeast; ~210 walkers at most), 60 s from dusk, frames paced to 60 fps, CPU time per `game.loop.step`. Desktop is 1280×720; the phone profile is the 375×812 preset (touch, DPR 2), with 4× CPU throttling emulated by scaling its frame times (the pane has no throttle).

| | Budget | Measured (S21) |
|---|---|---|
| Frame rate | 60 fps on desktop. At least 45 fps on a mid-range phone during a three-front night (about 250 enemies) | desktop p50 2.9, **p95 4.7**, max 16.5 ms. Phone viewport p95 4.6 ms, **×4 ≈ 18 ms** (≤ 22) |
| Terrain | at most 24 resident chunks (24 MB); ≤ 4 ms of baking per frame; ≤ 12 ms for any single chunk bake | 24 resident; ≤ 3.6 ms a frame; worst bake in play 7.3 ms. The first bake after a boot or a camera jump (`prime`) runs 13–14 ms, cold, on a load frame |
| Flow fields | ≤ 6 ms per frame while rebuilding; a full rebuild in ≤ 30 frames | ≤ 5.7 ms a slice; 13 rebuilds in 50 slice frames (~4 each) |
| Pathing | ≤ 2 ms per frame for all A* searches (queue the rest) | ≤ 1.7 ms a frame (was 2.1; the slice now stops 0.4 ms short); worst single search 2.1 ms |
| Display objects | ≤ 1500 visible after culling | **≤ 605** drawn (mean 443) + ~110 HUD. Was 1808: off-screen units, pickups and shots are now culled (`Culler.addMover`) |
| Boot | play starts ≤ 300 ms later than today | not measured in S21 (S22's playthrough) |
| Memory | ≤ 350 MB on a phone | JS heap 145–186 MB in both profiles; textures on top (24 chunk MB, ≤ 160 `bld_`), not measured on a device |
| Save | ≤ 64 KB of JSON | ≤ 64 KB enforced; a maxed frontier ~56 KB (S19) |
| Buildings (S13c density) | every pad built renders and simulates inside the frame | 420 standing (244 blueprint pads + wall pieces); buildings update ~0.25 ms a frame |
| Workers | up to the save's 500 | 297 (every production slot filled); update ~0.4 ms a frame, the costliest system |
| Drop-off paths | inside the A* row | ~3100 searches a minute through the queue, 0 left queued |
| Yard props | culled with their building | 284 yards; 268 of 3042 static objects shown |
| `bld_` textures | ≤ 160, lazily baked | 151, 0 fallbacks; one variant bake reached 92–110 ms (while `buildAll` raised every pad at once; see S13b) |
