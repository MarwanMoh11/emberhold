# S05 · NavGrid

**Goal.** Make terrain real.
- Nothing walks on water, cliffs or lava.
- Fords are slow.
- The horde follows flow fields over the crossings instead of walking in straight lines at gates.
- Built walls block at a cost, and gates are open.

**Depends on.** S01 (raster and flow), S04 (world module).

**Size.** Large. `EnemyManager` is the main read (about 6k tokens).

## Read first
- [04-systems.md §NavGrid and the horde](../design/04-systems.md#navgrid-and-the-horde-s05)
- [03-nights-and-camps.md §Fortification lines](../design/03-nights-and-camps.md#fortification-lines) (the "walls in the NavGrid" paragraph only)
- [CONTRACTS.md §S01, §S04 and §S05](../CONTRACTS.md#s05-navgrid)
- `src/systems/EnemyManager.ts`: the steering and target code. Find it with `grep -n "WALL_RING\|gate\|steer\|velocity\|moveTo\|update("`, then read those windows.
- Player movement: `grep -n "speed\|body\|velocity" src/entities/Player.ts`.
- Where wall and gate pads are built and destroyed: `grep -n "wall\|gate" src/systems/BuildingManager.ts | head -40`.
- Ally movement, to add collision only: `grep -n "speed" src/systems/ArmyManager.ts src/systems/WorkerManager.ts`.

## Do

**C1 · NavGrid, pure**
1. Create `src/world/NavGrid.ts` per CONTRACTS:
   - blockers at `WALL_COST = 40`;
   - `field(target)`, with an Int8 direction per cell;
   - `slide`;
   - `version`;
   - time-sliced rebuilds at 6 ms per frame, with the old field serving until the new one is ready.
2. Put the Phaser-free core (everything but the per-frame slicing hook) where `tests/` can `loadTs` it.
3. Write `tests/navgrid.test.mjs`:
   - on the real blueprint raster, the `'hall'` field routes the campFerrow cell over `oldBridge`;
   - a toy grid with a sealed ring still produces a finite path through the blocker;
   - `slide` never ends on an impassable cell.

**C2 · Collision everywhere**
1. The hero, enemies, soldiers and workers move through `nav.slide`.
2. Fords scale speed by `slow`.
3. Allies may snag on corners until S06. That is acceptable; note it.

**C3 · Flow-field horde**
1. Replace nearest-gate/`WALL_RING` targeting with `nav.field('hall')`: temporary gates spawn, and the field routes. Keep today's separation, target selection (`TargetPref`) and attack logic.
2. Register built wall pads as blockers, add and remove them on build and destroy, and bump `version`.
3. An enemy whose next cell is a blocker attacks that wall.
4. Remove the `balance.WORLD` re-export left from S04.

**C4 · Debug**
The F2 panel gets a toggle to draw flow arrows for the cells around the camera, and to tint blocked cells.

## Out of scope
- `via` legs and approaches (S09).
- A* for allies (S06).

## Done when
- Three harness nights (south gate) produce **zero** frames in which any enemy stands on a blocked cell. Sample every second.
- Enemies cross at the Old Bridge.
- Building a wall ring with no gaps (in the harness) still results in enemies attacking a wall, not freezing.
- Tests and typecheck are green, and there are no console errors.
- The worst frame time while a field rebuilds is logged, and is ≤ 6 ms of rebuild work.

## Verify
Run a harness check in `javascript_tool` that returns only a count:

```js
let bad = 0
for (let i = 0; i < 60; i++) {
  H.pump(1)
  gs().enemies.list.forEach(e => { if (!gs().nav.passableAt(e.x, e.y)) bad++ })
}
bad
```

Adapt the names to what EnemyManager actually exposes. Take two screenshots: the flow arrows at the bridge, and a night crossing it.

## Handoff
- Record how enemies pick a leg, so S09 can add `via`.
- Record the per-frame cost you measured.
- List ally snag spots you saw.
