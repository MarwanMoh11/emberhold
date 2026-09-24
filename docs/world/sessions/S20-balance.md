# S20 · Balance and pacing

**Goal.** Tune the numbers so a first run hits the pacing targets in [01 §Pacing](../design/01-world.md#pacing-targets):
- region costs;
- outpost costs;
- fishery and trade yields;
- camp hp and rewards;
- enemy tier scaling;
- wave budget and fronts;
- day length;
- boss hp;
- quest rewards;
- the costs and effects of S13b's village buildings (cottage, granary, mill, market, chapel, watch post, docks).

**Pacing.** Honour STATUS 2026-09-24: slow the macro pace to the new targets in 01 (about 1.5×: acts end near waves 8, 18, 33 and 45, and the Regent falls near wave 50). Keep the micro loop tight. Use the levers listed in 01, in order, and stretch the wave-gated openings in `Approaches.OPENS` (5, 8, 11 → 8, 12, 17). Never slow the game with dead time.

**Depends on.** S18 (the whole campaign). Read the balance notes left in STATUS by S13, S16, S17 and S18.

**Size.** Medium. Most of the work is harness runs and number edits. **Don't** read systems code: tune configs only.

## Read first
- [01-world.md §Pacing targets](../design/01-world.md#pacing-targets)
- [03-nights-and-camps.md §Day and night and §Approaches](../design/03-nights-and-camps.md#day-and-night)
- STATUS §Open decisions (day length).
- The configs you will edit: `src/config/balance.ts`, `waves.ts`, `buildings.ts` (grep the keys you tune), the costs and rewards in `src/config/world/blueprint.ts` (grep `cost:` and `reward:`), `quests.ts` rewards, and `enemies.ts`.

## Do

**C1 · An economy probe**
1. Write `src/dev/probe.ts`, dev-only and loaded by the harness. It runs a scripted "reasonable player" through the harness:
   - build production in claimed regions;
   - hire to the cap;
   - claim the next region as soon as it is affordable;
   - fight nights with the army;
   - burn camps when the army's strength exceeds a threshold.
2. It logs per wave:
   - the stockpile;
   - income per minute;
   - claimed regions;
   - the losses of the night;
   - the game clock (s);
   - the reward events since the last wave, with their timestamps (the event list is in 01 §The micro loop).
3. It returns compact JSON. Never paste long logs.

**C2 · Tune**
1. Run the probe to wave 30 (it pumps fast). Compare it with the pacing table.
2. Adjust in this order: region costs, then camp hp and rewards, then enemy scaling, then wave budget, then day length.
3. Re-run after each group of changes, and keep a small before-and-after table in the handoff.

**C3 · The day-length decision**
Settle a formula. Record it in STATUS §Decisions as *proposed*, for the human to confirm.

## Done when
- **Macro:** the probe reaches each act's end within ±25% of the new target waves **and** game-clock minutes in 01, and each claim within ±25% of its target wave.
- **Micro, in every act:**
  - the gap between reward events has p50 ≤ 45 s and p90 ≤ 60 s;
  - no gap between quests or milestones is longer than 6 min;
  - every night ends with its reward, and that reward covers at least one build or upgrade the probe can buy next.
- No night kills the probe's hold before wave 25 with a reasonable defence.
- Tests and typecheck are green.

## Handoff
The before-and-after table (15 rows or fewer), the macro and micro measurements against 01, the proposed day-length formula, and known outliers.
