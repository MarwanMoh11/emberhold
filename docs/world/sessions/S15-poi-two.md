# S15 · Points of interest II: barrows and relics

**Goal.**
- Barrows that you break open, which wake a guardian and drop grave goods.
- The relic system, with seven relics and their modifiers.
- Relics shown on the pause page.

**Depends on.** S14 (PoiManager and Modifiers) and S10 (the `camp:burned` payload with the boss key).

**Size.** Medium.

## Read first
- [05-content.md §Relics and §Points of interest](../design/05-content.md#relics) (the barrow row only)
- [CONTRACTS.md §S14 and §S15](../CONTRACTS.md#s15-relics)
- The S14 handoff: which stats are still pending.
- The pause page: `grep -n "class\|deeds\|Deeds" src/ui/PauseMenu.ts | head`.
- How the hero damages nodes: `grep -n "hit\|damage" src/systems/NodeManager.ts`.

## Do

**C1 · Barrows**
1. A barrow is a POI with node-like hp (about 6 s of hero hits).
2. Opening it spawns a guardian: an `elite` scaled by the region's tier.
3. Killing the guardian drops a tier-scaled bag. `barrowKing` and `barrowMoor3` also grant their relic.

**C2 · Relics**
1. Add `relics.grant`, `has` and `list`, and save them (`relics`).
2. Each relic registers its modifiers.
3. Wire the remaining stats:
   - `pack.size`;
   - `soldier.damage`;
   - `army.speed`;
   - `rally.cooldown`;
   - `worker.speed` and `worker.gather`;
   - `tower.range`;
   - `hero.pierce`;
   - `wood.yield`.
4. `camp:burned` for a stronghold whose boss held a relic grants it. The Thornmother grants both of hers.
5. Add the deed "Reliquary".

**C3 · UI**
The pause page gets a Relics strip: painted seals, each with a tooltip.

## Done when
- In the harness:
  - `barrowKing` opens, and its guardian drops the Barrow Crown;
  - carry capacity rises by 15%;
  - granting each relic changes its stat by the table amount (assert each one).
- Save round-trips `relics`.
- Tests and typecheck are green.

## Verify
Use harness JSON for the stat assertions. Take one screenshot: the Relics strip.

## Handoff
CONTRACTS §S15 marked as landed. Note that every modifier stat is now wired, or list the ones that aren't.
