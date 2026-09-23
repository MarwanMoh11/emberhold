# S18 · Campaign 2.0

**Goal.** Replace the 29-quest chain with the 46 quests of [06-campaign.md](../design/06-campaign.md). That means:
- new goal types;
- quest arrows that work across the map;
- act banners;
- seven new deeds.

**Depends on.** Everything the quests reference: claims (S08), camps (S10), outposts and travel (S11), atlas routes (S12), shrines (S14), relics (S15) and bosses (S17).

**Size.** Medium to large. `quests.ts` is 5.5k tokens: it gets rewritten, so read it once. `QuestManager` is 3.6k.

## Read first
- [06-campaign.md](../design/06-campaign.md) (whole)
- [CONTRACTS.md §S18](../CONTRACTS.md#s18-campaign), plus the events each new goal listens to: `region:claimed`, `camp:burned`, `poi:done`, relics, waystone travel, `lineComplete`.
- `src/config/quests.ts` (whole) and `src/systems/QuestManager.ts` (whole).
- `tests/quest-save.test.mjs`.

## Do

**C1 · Goal types**
1. Add `claim`, `burn`, `restore`, `relic`, `reach`, `travel` and `line` to `QuestGoal`.
2. Evaluate each in `QuestManager` from the events. `zone` counts claimed regions.
3. `targetFor` returns a world point for each goal type:
   - the claim point;
   - the camp;
   - the nearest unrestored shrine;
   - the POI;
   - the nearest active waystone;
   - the first unbuilt pad of the line.

**C2 · The chain**
1. Write all 46 quests, with titles and hints as in 06.
2. Rewards follow today's rhythm (enough for the next step, plus XP).
3. Act banners fire on a1, b1, c1, d1 and e1.
4. Add the 7 deeds.

**C3 · Arrow and save**
1. When the target is off-screen, the quest arrow follows the atlas route (from S12) instead of a straight edge arrow.
2. The quest save format is unchanged, but the ids are new. Update `quest-save.test.mjs`.

## Done when
- A harness script completes acts I and II, using dev helpers (`H.claim`, `H.burn`, resource grants) where play would be slow.
- Every quest's `targetFor` returns a point on passable ground (a unit test across all 46).
- Tests and typecheck are green.

## Verify
Harness JSON: quest ids as they complete. Take one screenshot of an act banner.

## Handoff
- Mark CONTRACTS §S18 as landed.
- Give S20 your first-pass reward table and any quest that felt too slow.
