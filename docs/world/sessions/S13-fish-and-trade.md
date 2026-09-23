# S13 · Fish and trade

**Goal.**
- Fish nodes placed on water.
- The fishery (fish into food, hauled by workers).
- The trading post (passive coins) on Saltmere's quay.

**Depends on.** S06 (worker pathing) and S11 (the pattern for adding a building).

**Size.** Medium.

## Read first
- [05-content.md §New buildings](../design/05-content.md#new-buildings)
- [CONTRACTS.md §S13](../CONTRACTS.md#s13-fish-and-trade)
- The S11 handoff: how a new `BuildingKey` was added, and which files it touched. Follow the same list.
- `src/systems/NodeManager.ts` (whole, about 1.5k tokens): scatter, respawn, and `NODE_DEFS` usage.
- Production income: `grep -n "prod\|income\|coins" src/systems/ResourceManager.ts | head -20`.
- `render.mjs --region saltmere` and `--region hollow`, for the pads and fish fields.

## Do

**C1 · Fish**
1. Add `NodeType` `'fish'`, with a def in `NODE_DEFS`:
   - it yields food;
   - its art is ripples plus a leaping fish (static), in the ink style.
2. Scatter fish only on raster cells whose `under` is water or sea, inside the field radius.
3. The worker gather point is the nearest **passable** cell to the node. Workers stand on the bank.
4. Move the fish fields out of the S04 exclusion.

**C2 · The fishery**
1. Add the `fishery` building (3 levels; costs in 05): a jetty shed with nets.
2. Workers gather fish within 760 px of path.
3. Move the fishery pads out of `FUTURE_PADS`.

**C3 · The trading post**
1. Add the `tradingPost` building (3 levels): a quay warehouse with a lamp. It gives passive coins of 0.6, 1.2 and 2.0 per second by level.
2. The income multiplier reads `trade.income`: base 1 for now, and S14 wires the modifier.
3. Show its income in the building panel.
4. Update `check.ts`. `FUTURE_PADS` should now be empty: delete it.

## Done when
- In the harness, with Hollow claimed: `fishery1` built, 2 workers hired, and food rises over 120 s. No worker stands on water.
- With Saltmere claimed, `trade1` raises coins at its level's rate.
- Tests and typecheck are green, and `world:lint` is green. The lint's fish-field rules already exist.

## Verify
Use harness JSON (resource deltas). Take one screenshot: the fishery with workers on the bank.

## Handoff
CONTRACTS §S13 marked as landed, and a note on which yield and cost values S20 should look at.
