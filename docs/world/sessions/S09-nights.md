# S09 · Nights 2.0

**Goal.** Replace the temporary gates with approaches:
- muster resolution along chains;
- `via` legs;
- the 2400 px spawn clamp and the 2.4× forced march;
- fronts per night and raids;
- maws;
- the night warning, with drawn routes;
- the fight window that starts on arrival;
- the day-length formula.

**Depends on.** S05 (fields), S08 (`claimMask` and camp states).

**Size.** Large, with mostly new code. `WaveManager` is about 2.7k tokens.

## Read first
- [03-nights-and-camps.md](../design/03-nights-and-camps.md): §Day and night, §Approaches, and §Spawning. Read all three.
- [CONTRACTS.md §S05, §S08 and §S09](../CONTRACTS.md#s09-approaches)
- `src/config/waves.ts` (small; whole). `GateId` and `WaveDef.gates` go away.
- `src/systems/WaveManager.ts`: `update`, the spawn code and `nextGates`. Grep `gate\|spawn\|phase`.
- The EnemyManager spawn entry point and the leg logic from the S05 handoff.
- The route numbers from `node docs/world/tools/render.mjs`, to sanity-check yours.

## Do

**C1 · Approaches, pure**
1. Create `src/systems/Approaches.ts` per CONTRACTS, with the pure core testable: `muster`, `route` (legs through `via`), `spawnPoint` (the clamp) and `live(wave)`, following the opens rules and fronts per night.
2. Write unit tests on the real raster:
   - with only the hold claimed, south's spawn point is at `campFerrow` (under 2400);
   - west's spawn point is clamped;
   - after `campFerrow` burns, south musters at `campStairwarden`;
   - east closes after `campIrontooth` burns.

**C2 · Spawning and the march**
1. `WaveDef.approaches` replaces `gates`. Update `WAVES`, `proceduralWave` and `directorAdjust`.
2. Delete the temporary `SPAWN_GATES` and `GateId`.
3. Enemies spawn at `spawnPoint` with `marching = true`:
   - 2.4× speed;
   - they follow their route's legs;
   - no aggro unless hit;
   - the flag clears on a claimed cell.
4. Apply tier scaling from the muster's region.
5. The raid budget is 30%, with at most one raid per night, and only while its camp is awake.

**C3 · Warning and time**
1. `night:warning` fires `warningSeconds` before dusk.
2. Routes are drawn as ember dotted lines:
   - on the ground within 1200 px of the hero;
   - on the minimap.
3. The banner names the approaches.
4. The fight window starts on the first arrival on claimed ground, or 25 s after dusk.
5. Day length is `60 + 10 × claimed` regions, capped at 180 s, from `DAYNIGHT`.
6. Remove the `scene.zones` alias.

## Out of scope
- Camp leash and tiers (S10).
- Wall lines (S10).
- Atlas routes (S12).

## Done when
- In the harness, from a fresh start:
  - wave 1 comes from the south over the Old Bridge;
  - the first enemy reaches claimed ground ≤ 14 s after dusk;
  - no enemy is on a blocked cell;
  - no enemy ever walks a road for the speed bonus.
- With `H.claim('hollow')` and wave 5 or later, the west approach marches over Millford, not the Old Bridge.
- Burning `campFerrow` (with `H.burn`, which you add to the harness) moves the south muster.
- Tests and typecheck are green.

## Verify
- Log per-approach arrival times as harness JSON.
- Take two screenshots: the warning routes, and a march at Millford.

## Handoff
- Add wave and approach save state to CONTRACTS, if you added any.
- Record the measured arrival times.
- Note any route that looked wrong in play.
