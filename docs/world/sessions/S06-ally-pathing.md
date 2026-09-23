# S06 · Ally pathing and roads

**Goal.**
- Workers and soldiers find their way over bridges and round lakes.
- Workers choose nodes by walking distance.
- Roads speed up the hero, soldiers and workers.

**Depends on.** S05.

**Size.** Medium. `WorkerManager` is about 5k tokens and `ArmyManager` about 3k.

## Read first
- [04-systems.md §Ally pathing and roads](../design/04-systems.md#ally-pathing-and-roads-s06)
- [CONTRACTS.md §S05 and §S06](../CONTRACTS.md#s06-ally-pathing-and-roads)
- The S05 handoff in STATUS (snag spots).
- `src/systems/WorkerManager.ts`: the state machine that walks to a node and to the drop-off. Find it with `grep -n "state\|findFor\|findAny\|SEARCH_RADIUS\|homeX"`.
- `src/systems/NodeManager.ts`: `findFor`/`findAny` (about 1.5k tokens).
- `src/systems/ArmyManager.ts`: the follow and hold movement.

## Do

**C1 · Pathing**
1. Add `nav.findPath`:
   - A* with an octile heuristic, then string-pulling;
   - an LRU cache of 256;
   - a node cap of 20,000;
   - a per-frame budget of 2 ms, with a queue.
2. Add `src/world/PathFollower.ts`.
3. Add tests on the real raster:
   - a path from the depot to `farm5` (Ferrow, south bank) crosses `oldBridge`;
   - no path point is impassable.

**C2 · Workers and army**
1. Workers:
   - follow paths between home, node and drop-off;
   - choose a node by **path** length of 760 or less. Use the flow-free option: take the straight-line candidates first, then confirm with `findPath` length, and cache the result per node.
2. The army steers straight when it has line of sight to the hero. Otherwise it paths, repathing every second or whenever the hero moves more than 200 px.

**C3 · Roads**
1. Add `nav.onRoad` and `ROAD_SPEED = 1.2`.
2. Apply it to the hero, soldiers and workers. **Never** to enemies.
3. Add an optional road tint to the F2 overlay.

## Out of scope
- Outposts as drop-offs (S11). Leave a single `dropoffFor(x, y)` function that S11 can extend.

## Done when
- In the harness: claim `ferrow`, build `farm5`, hire 2 workers and run 120 s. Food is delivered to the depot, and no worker ever stands on a blocked cell.
- With the army following the hero from the Downs to Greyfall, no soldier is stuck for more than 3 s.
- The hero is measurably faster on the King's Road: log the speed.
- Tests and typecheck are green.

## Verify
Use harness counts returned as JSON (deliveries, stuck counts, bad-cell frames). Take one screenshot: workers on the bridge.

## Handoff
- Where `dropoffFor` lives.
- The pathing cost you measured.
- Anything still snagging.
