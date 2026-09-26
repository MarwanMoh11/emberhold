# S01 · Blueprint home

**Goal.** Move the blueprint into `src`, turn the lint tool's raster and pathing into shared TypeScript modules the game will use, and make the world lint part of `npm test`. There is no runtime change: the game still plays the old map.

**Depends on.** Nothing. This card creates the `world-v2` branch.

**Size.** Small to medium: about 60–90k in total. It is the only card with room to spare, so finish every checkpoint.

## Read first
- [04-systems.md §One raster](../design/04-systems.md#one-raster-s01)
- [CONTRACTS.md §S01](../CONTRACTS.md#s01-blueprint-and-raster)
- `docs/world/tools/render.mjs`:
  - lines 1–60 (the header, `RULES` and the geometry);
  - the `rasterise` and `flowField`/`descend`/`nearestPassable` functions. Use `grep -n "^export function\|^function\|^class"` to find them.

  Skip the rest.
- `tests/load-ts.mjs` (25 lines) and `tsconfig.json`.
- **Don't** read `blueprint.ts` whole. Grep the type declarations: `grep -n "^export type\|^export interface" docs/world/blueprint.ts`.

## Do

**C1 · Branch and home**
1. `git checkout -b world-v2`, then commit `docs/world/` as it is: "Chart the new frontier".
2. `git mv docs/world/blueprint.ts src/config/world/blueprint.ts`. The tool already looks there first.
3. Fix the links to `blueprint.ts` in `docs/world/README.md` and `docs/world/CONTRACTS.md`. Also fix the header comment in the blueprint.
4. Make `npm run typecheck` pass with the blueprint inside `src`, under strict mode and `noUnusedLocals`.

**C2 · Shared raster**
1. Create `src/world/raster.ts` and `src/world/flow.ts`, typed against the blueprint's types, with no Phaser. Port `rasterise`, `flowField`, `descend`, `nearestPassable` and the geometry helpers **unchanged in behaviour**.
2. Add the `road` layer to the raster: cells within `width / 2` of each road polyline.
3. Make `render.mjs` import them through `loadTs` and delete its copies.
4. **Proof of identical behaviour.** Capture `node docs/world/tools/render.mjs --no-svg` output before the port, and diff it after. It must be identical.

**C3 · Lint as a test**
1. Add `src/config/world/check.ts`, a compile-time check that `Exclude<PadKey, 'outpost' | 'fishery' | 'tradingPost'>` is assignable to `BuildingKey`. Nothing imports it at runtime; keep it in `tsconfig`'s include.
2. Add `tests/world-blueprint.test.mjs`. It should:
   - load the tool's `lint` and `approachRoutes`;
   - assert 0 errors;
   - assert every route has cells;
   - assert every approach's first route passes its `via` crossing;
   - assert every camp `spawns.key` is either an `EnemyKey` or `name[EnemyKey]` (load `src/config/enemies.ts` through `loadTs`).
3. Add the `package.json` scripts:
   - `"world:lint": "node docs/world/tools/render.mjs --quiet --no-svg"`
   - `"world:map": "node docs/world/tools/render.mjs"`
4. Regenerate `docs/world/map.svg` and commit it.

## Out of scope
Any change to game behaviour. Don't import the blueprint from game code yet; that is S04.

## Done when
- `npm test`, `npm run typecheck` and `npm run world:lint` are green.
- The tool's output is byte-identical to before the port, apart from the blueprint path in its header line.
- `src/world/raster.ts` and `src/world/flow.ts` exist, with no Phaser import.

## Verify
```bash
npm test 2>&1 | tail -15
npm run typecheck 2>&1 | head -20
npm run world:lint
```
No browser check is needed.

## Handoff
Mark CONTRACTS §S01 as landed, with file:line for `rasterise` and `flowField`. In STATUS, record the branch creation and anything the tool port changed.
