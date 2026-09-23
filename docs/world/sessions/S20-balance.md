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
- quest rewards.

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
   - the losses of the night.
3. It returns compact JSON. Never paste long logs.

**C2 · Tune**
1. Run the probe to wave 30 (it pumps fast). Compare it with the pacing table.
2. Adjust in this order: region costs, then camp hp and rewards, then enemy scaling, then wave budget, then day length.
3. Re-run after each group of changes, and keep a small before-and-after table in the handoff.

**C3 · The day-length decision**
Settle a formula. Record it in STATUS §Decisions as *proposed*, for the human to confirm.

## Done when
- The probe reaches each act's end within ±25% of the target waves.
- No night kills the probe's hold before wave 25 with a reasonable defence.
- Tests and typecheck are green.

## Handoff
The before-and-after table (15 rows or fewer), the proposed day-length formula, and known outliers.
