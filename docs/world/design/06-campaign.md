# 06 · Campaign 2.0

The campaign stays **one running chain**, as today (`QUESTS` in `src/config/quests.ts`). Each step points an arrow at the next thing and pays enough to do it.

> **As landed (S18):** the tables below are the design. `quests.ts` holds the chain as built: the same 46 goals plus seven village quests, "Three fronts" moved up to b8 and acts III–V reordered for the 1.5× pace, ids renumbered in chain order, and the two survive goals moved to nights 14 and 30 (see STATUS §S18). **S20** swapped both for goals that do something, since waiting on a night left 13 min without a quest: b8 "Three fronts" builds 2 Watch Posts, c8 "Old lights" restores 3 shrines.

**What changes:**
- It grows from 29 quests to **46**, across five acts.
- Each act ends in a banner.
- The quest arrow can point across the world. It uses the atlas route when the target is off-screen (S12's atlas; before that, a plain edge arrow).

**New goal types** (S18 adds them to `QuestGoal` and `QuestManager.targetFor`):
- `claim` { region }
- `burn` { camp }
- `restore` { amount }
- `relic` { amount }
- `reach` { poi }
- `travel` (use any waystone once)
- `line` { line } (every pad of a fortification line built)

The existing types stay. `zone` now counts claimed regions.

**Rewards.** Keep today's rhythm for rewards: roughly enough to pay for the next step, plus XP. S18 writes first-pass rewards, and S20 tunes them.

## Act I · The Rise (waves 1–5)

The first ten minutes of today's game, on the Rise.

| # | id | Title | Goal |
|---|---|---|---|
| 1 | a1 | Pick up the pieces | collect 30 coins |
| 2 | a2 | First timber | build `lumberCamp` |
| 3 | a3 | Hands to work | workers 2 |
| 4 | a4 | Bread | build `farm` |
| 5 | a5 | Hold the bridge | survive wave 1 (it comes over the Old King's Bridge) |
| 6 | a6 | A roof | build `house` |
| 7 | a7 | Steel | build `barracks` |
| 8 | a8 | Muster | recruit 3 |
| 9 | a9 | Stake a claim | claim `downs` |
| 10 | a10 | Dig them out | burn `campDiggers` |
| 11 | a11 | Timber hall | upgrade `townHall` to 2 |
| 12 | a12 | Into the wood | claim `whisperwood` |
| 13 | a13 | The bridgehead | line `bridgehead` |

## Act II · The River (waves 6–12)

| # | id | Title | Goal |
|---|---|---|---|
| 14 | b1 | Hollow | claim `hollow` |
| 15 | b2 | Rotwood burns | burn `campRotwood` |
| 16 | b3 | Come up | reach `survHollow` |
| 17 | b4 | A light in the dark | build `outpost` |
| 18 | b5 | The old roads | travel |
| 19 | b6 | Greyfall | claim `greyfall` |
| 20 | b7 | Good stone | build `quarry` |
| 21 | b8 | Over the bridge | claim `ferrow` |
| 22 | b9 | Break the muster | burn `campFerrow` (a banner explains that the south front fell back) |
| 23 | b10 | Stone hall | upgrade `townHall` to 3 |
| 24 | b11 | Three fronts | survive wave 10 |
| 25 | b12 | Hold the ford | line `millfordLine` |

## Act III · The Frontier (waves 13–22)

| # | id | Title | Goal |
|---|---|---|---|
| 26 | c1 | Wider still | zone 8 (the hold plus seven claims) |
| 27 | c2 | Old gods | restore 1 shrine |
| 28 | c3 | Iron | build `mine` |
| 29 | c4 | Close the gorge | burn `campIrontooth` (the east approach closes for good) |
| 30 | c5 | Cap the gorge | line `gorgeLine` |
| 31 | c6 | The hanged | boss `gallowsKnight` |
| 32 | c7 | Grave goods | relic 2 |
| 33 | c8 | The frontier | zone 10 |
| 34 | c9 | Bastion hall | upgrade `townHall` to 4 |
| 35 | c10 | Twenty nights | survive wave 20 |

## Act IV · The Scar (waves 23–30)

| # | id | Title | Goal |
|---|---|---|---|
| 36 | d1 | Through the Seamgate | claim `deepvein` |
| 37 | d2 | First light | build `crystalDelve` |
| 38 | d3 | The Kettle cools | burn `campKettle` |
| 39 | d4 | The Blackened Rim | claim `rim` |
| 40 | d5 | Cap the Stair | line `stairLine` |
| 41 | d6 | The Stairwarden | boss `stairwarden` |
| 42 | d7 | Down the Bonepass | claim `ashgate` |
| 43 | d8 | Ashgate falls | burn `campAshgate` (banner: "The fire on the causeway dies.") |

## Act V · The Crown

| # | id | Title | Goal |
|---|---|---|---|
| 44 | e1 | Citadel | upgrade `townHall` to 5 |
| 45 | e2 | The Cinder Crown | claim `crown` |
| 46 | e3 | The Regent | boss `cinderRegent` |

## Off the chain (deeds)

Optional content gets deeds, not quests. `ACHIEVEMENTS` gains:

| Deed | For |
|---|---|
| Heartwood | kill the Thornmother |
| Slagbreaker | burn the Slag Forges |
| Loremaster | read all 12 lore stones |
| Pilgrim | restore all 6 shrines |
| Reliquary | hold all 7 relics |
| Surveyor | see every region |
| Wayfarer | activate every waystone |

## Saves mid-campaign

Old quest ids (`q1`–`q29`) don't carry over into v2. The mapping from v1 progress, if any, is part of the migration decision in [07](07-save.md#migration).
