# S14 · Points of interest I

**Goal.**
- The POI framework and the Modifiers registry.
- Caches, lore stones, shrines, landmarks and survivors.

**Depends on.** S08 (claims and camps), S11 (waystones are POIs too) and S12 (the atlas icon hook).

**Size.** Large. It is mostly new code. Art: shrines (six variants of one base), lore stones, landmark silhouettes.

## Read first
- [05-content.md](../design/05-content.md): §Points of interest, §Modifiers, and the shrine table.
- [CONTRACTS.md §S14](../CONTRACTS.md#s14-points-of-interest)
- The chest pickup: `grep -n "chest" src/systems/PickupManager.ts`, and read the chest spawn and open code.
- The deeds list: `grep -n "ACHIEVEMENTS" -A5 src/config/quests.ts`, plus how deeds unlock (`grep -rn "achievement" src/systems | head`).
- To see what a POI sits beside: `render.mjs --at x,y`.

## Do

**C1 · Framework**
1. Add `PoiManager`:
   - `unseen` → `seen` when the fog reveals the POI;
   - `interact` by standing on it;
   - `done` is saved (`pois`);
   - events `poi:seen` and `poi:done`;
   - atlas icons through the S12 hook.
2. Add `Modifiers`: `add`, and `value(stat, base)` with the stat list from 05.
3. Wire the stats the shrines touch:
   - `food.yield` and `trade.income` (in S13's code). S13b's local bonuses (mill, granary, docks) multiply first: `mods.value(stat, base × localBonus)`;
   - `wall.hp`;
   - `hero.xp`;
   - `hero.regen`;
   - `soldier.hp`;
   - `infirmary.heal`;
   - `outpost.heal`.

**C2 · Caches, lore and landmarks**
1. Caches use the existing chest, with loot scaled by region tier, once each.
2. Lore stones show a 1 s parchment toast. Reading all 12 earns the deed "Loremaster".
3. Landmarks are big static silhouettes, drawn above the fog so they read from far off.

**C3 · Shrines and survivors**
1. Shrines:
   - a ruined sprite until restored;
   - restored by paying `cost` while standing on it (the funding verb);
   - then glowing, with modifiers registered;
   - "Pilgrim" for all 6.
2. Survivors:
   - locked until their condition is met (the table in 05);
   - walking in grants population and free workers at the nearest matching building. A cottage counts as a dwelling, like a house.

## Out of scope
Barrows and relics (S15).

## Done when
- In the harness:
  - every POI kind can be seen, done, saved and reloaded;
  - restoring the Shrine of the Harvest raises measured farm output by 15%;
  - `survHollow` stays locked until `campRotwood` burns.
- The atlas shows the icons of seen POIs.
- Tests, including a save round trip with `pois`, and typecheck are green.

## Verify
Use harness JSON. Take three screenshots: a shrine restored, a lore toast, and a landmark seen through the fog.

## Handoff
- CONTRACTS §S14 marked as landed.
- Which modifier stats are wired, and which are still pending for S15.
