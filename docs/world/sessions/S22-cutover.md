# S22 · Playthrough and cutover

**Goal.**
- A full harness-driven playthrough, from a fresh start to the Regent's death, with no blockers.
- Remove the v1 remnants and update the README.
- Then, **with the human's go-ahead**, merge `world-v2` into `main`. That deploys.

**Depends on.** Everything.

**Size.** Medium. If the playthrough finds bugs, fix only the **blockers** here. Anything else goes into STATUS as follow-ups.

## Read first
- STATUS (whole), and the follow-ups every earlier session left.
- [01-world.md §Pacing targets](../design/01-world.md#pacing-targets)
- `README.md` (the repo root), sections Playing and Map.

## Do

**C1 · The playthrough**
1. Write a harness script (`src/dev/playthrough.ts`, dev-only), building on S20's probe. It plays every act in order, using only player-legal actions, except for pumping time. It logs:
   - the wave at each act's end;
   - deaths;
   - stuck detections (a worker, soldier or hero that doesn't move for more than 10 s while it has a goal);
   - console errors.
2. It returns JSON.
3. Loop: run it, fix blockers, run again. Every fix needs a test where one is feasible.

**C2 · Clean-up**
1. Delete v1 leftovers: `grep -rn "TEMP until\|v1\b\|WALL_RING\|GateId" src`. Keep only the v1 migration code.
2. Update the root `README.md`:
   - the Playing table (the atlas on `M`, waystones);
   - a short "The frontier" section with `docs/world/map.svg`.
3. Make `docs/world/README.md` say the work is shipped.
4. Run `npm run build` to confirm the production build passes.

**C3 · Cutover** (ask first)
1. Stop and ask the human, in the final report or through the orchestrator: "Playthrough green. Merge world-v2 → main and deploy?"
2. On a yes: `git checkout main && git merge --no-ff world-v2`, push, and check the Pages deploy.
3. On a no: leave the branch ready and write down what is missing.

## Done when
- The playthrough is green: the Regent is dead, there are no blockers, and act waves are within S20's targets.
- `npm test`, typecheck, build and the world lint are all green.
- The merge has happened only with an explicit yes from the human.

## Handoff
The final STATUS entry: the shipped commit, the deploy URL, and the follow-up list.
