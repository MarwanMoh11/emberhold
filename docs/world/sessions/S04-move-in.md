# S04 · Move in

**Goal.** Make the game run on the new world:
- the world is 10240 × 9216;
- data comes from the blueprint;
- regions are polygons;
- the hold is at (5120, 3150);
- the terrain is painted flat, with no real art yet;
- nights still come through six temporary gates, as today.

After this card, `map.ts` is gone.

**Depends on.** S01 (the blueprint and raster), S02 (chunks) and S03 (fog sized from the world).

**Size.** Large. **C2 is atomic**: once you start it, finish it before stopping. If you are over about 60% of your budget at the end of C1, stop there and hand off.

## Read first
- [01-world.md §Principles](../design/01-world.md#principles)
- [CONTRACTS.md §S01 and §S04](../CONTRACTS.md#s04-world-seam)
- [07-save.md §Keys](../design/07-save.md#keys)
- `src/config/map.ts` (whole, about 3k tokens). This is the shape you are replacing.
- `src/systems/ZoneManager.ts`: the constructor and drawing (grep `graphics\|fill\|rect`), `zoneAt`, `lockedZoneAt`, `unlock`, `update`.
- For the terrain painter, use your S02 notes in STATUS. Don't re-read Terrain unless those notes point you there.
- The consumers:
  ```bash
  grep -rn "config/map'" src tests
  grep -rln "\bWORLD\." src
  ```
  Edit each with its grep hits. **Don't read these files whole.**
- To see what a region holds: `node docs/world/tools/render.mjs --region hold` (and similar).

## Do

**C1 · The world module** (not wired in yet)
1. Create `src/config/world/index.ts` per CONTRACTS §S04, derived from the blueprint:
   - `PADS` in the old `PadSpec` shape, with `zone` renamed to `region` and `requiresTownHall` taken from `hall`. Keep `outpost`, `fishery` and `tradingPost` pads out, in an exported `FUTURE_PADS` list.
   - `CAMPS` in the `CampSpec` shape. Resolve a spawn key like `'bogWretch[shield]'` to the key in brackets.
   - `NODE_CLUSTERS` from `NODES`, without fish.
   - `NODE_DEFS`, moved here from `map.ts`.
   - `WALL_RING`, derived from `WALLS.palisade` (left, right, top, bottom and the four gates), so `BuildingManager` needs no change yet.
   - **Temporary** `SPAWN_GATES`, keeping today's `GateId`s. Each gate sits on claimed-side ground **at the hold's edge** along its approach, so nights stay short until S09:

     | Gate | Position |
     |---|---|
     | south | (5120, 4450) (south bank of the Old Bridge) |
     | west | (3150, 4880) (south of Millford) |
     | east | (7500, 2850) (east of the Gorge Bridge) |
     | north | (5000, 1900) |
     | northeast | (6100, 1700) |
     | southwest | (2400, 3400) |

     Mark them `// TEMP until S09`.
   - `WORLD` moves here from `balance.ts`. Re-export it from `balance.ts` for this one card only, to keep the diff small, and note it in the handoff.
2. Add `tests/world-module.test.mjs`. Check that:
   - counts match the blueprint;
   - every pad's region is a `RegionId`;
   - the hall pad sits at `HALL`.

**C2 · The switch** (atomic)
1. Point every consumer at `src/config/world`, and delete `src/config/map.ts`.
2. Rename `ZoneId` to `RegionId`. Map the old `ZoneSpec` uses onto `RegionDef`:
   - the banner is `claim.{x, y}`;
   - the cost is `cost`;
   - `requiresTownHall` is `hall`;
   - `startsUnlocked` is `id === 'hold'`.
3. `ZoneManager`:
   - `zoneAt` uses `raster().regionAt`;
   - locked-region shading draws polygons (`fillPoints`), one `Graphics` per region;
   - zone logic is otherwise unchanged. Real claims come in S08.
4. Terrain painter: flat v2 art.
   - Fill each cell with its region's biome colour (the palette is in `render.mjs`'s `BIOME`).
   - Sea, water, cliff and lava get flat colours from the raster, and crossings are painted over them.
   - Draw roads as 60%-opacity earth strokes.
   - Keep the S02 noise, modulated by the biome.
5. Spawn the player at the hall, and set the camera bounds from `WORLD`. Check the hardcoded ids still resolve: `campAshgate`, `hall`, `depot` and `lumber1` all exist in the blueprint.
6. Save:
   - `KEY = 'emberhold.save.v2'`, `BACKUP_KEY = 'emberhold.save.backup.v2'`, `v: 2`;
   - `validSave` rejects `v !== 2`;
   - `zones` is renamed `regions`;
   - **never touch the v1 keys.**

**C3 · Harness and sanity**
1. Add `H.tp`, `H.claim` (calling `zones.unlock(id, true)`), `H.reveal`, `H.where` and `H.world` to `src/dev/harness.ts`. Add a usage line for each to the header comment.
2. Play three nights through the harness. Enemies will walk over water until S05; that is expected.

## Out of scope
- Impassable terrain (S05).
- Real art (S07).
- Claims, border stones and sleeping camps (S08).
- Approaches (S09).
- Wall lines beyond the palisade (S10).

## Done when
- The game boots into the new world at the hall.
- The first quest chain still works up to the first night.
- Three nights play through without errors in the console.
- A save round-trips under the v2 key, and an existing v1 save in `localStorage` is untouched.
- Tests, typecheck and `world:lint` are green.
- `map.ts` is deleted, and `grep -rn "config/map" src tests` is empty.

## Verify
- Harness sequence:
  ```js
  H.start(); H.where(); H.world(); H.build('lumber1'); H.pump(120)
  ```
  Then run `H.world()` again and check the console with `read_console_messages` (errors only).
- Take three screenshots at `scale: 0.5`: the hall, the Old Bridge, and a zoomed-out view.

## Handoff
- List every file you touched.
- Note the `balance.WORLD` re-export (S05 removes it).
- Note the temporary gates.
- Fill in CONTRACTS §S04 with real line numbers.
