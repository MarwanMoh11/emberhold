# 03 · Nights and camps

The old game spawns each night at six fixed gates on the world edge and walks it in a straight line to the nearest gap in the ring. At ten times the size that fails three ways:

1. The walk is too long for a 34 s night.
2. A straight line ignores rivers.
3. Every night looks the same.

World v2 replaces gates with **approaches**: named routes from a muster, over named crossings, to the hall.

## Day and night

- **Day.** Default `day = 60 + 10 × claimedRegions` seconds (the hold not counted), capped at 180. The base constants stay in `DAYNIGHT` (`src/config/balance.ts`). Kept as landed (human, 2026-09-25).
- **Warning.** `warningSeconds` (8 s) before dusk, fire `night:warning`. Tonight's approach routes are drawn as ember dotted lines, on the ground (only near the hero) and on the minimap and atlas. A banner names them: *"Tonight: the south road and the west ford."*
- **Night** has two parts: **march** and **fight**.
  - The fight window (`nightSeconds`, 34 s) starts when the first marcher sets foot on claimed ground, or 25 s after dusk, whichever comes first.
  - The night ends when every walker is down, or `fightGrace` (40 s) into the fight; walkers still out then flee at dawn and drop their loot, and bosses stay (S20; see STATUS §Open decisions).
  - So a far muster costs the player nothing. The fight is always the same length.

## Approaches

Each approach is a **chain** of musters and a **via** list of crossings. The horde routes through the vias in order, then heads for the hall. Without `via`, every late-game night would converge on the shortest path, which is always the Old Bridge.

| Approach | Chain (nearest first) | Via | First route (from the tool) | Opens |
|---|---|---|---|---|
| **south**: the south road | campFerrow → campStairwarden → **mawStair** | oldBridge | 2.7k px: ferrow › hold | wave 1 |
| **west**: the west ford | campGallows → **mawBone** | millford | 5.2k: barrowmoor › hollow › hold | wave 8, or when hollow is claimed |
| **east**: the gorge | campIrontooth | gorgeBridge | 4.6k: irontooth › greyfall › hold | wave 12, or when greyfall is claimed |
| **southeast**: the Kettle | campKettle → campOverseers → **mawRamp** | oldBridge | 4.0k: kettle › ferrow › hold | wave 17, or when kettle or ferrow is claimed |
| north (raid) | campDiggers | — | 2.9k: downs › hold | while its camp is awake |
| northwest (raid) | campThornstake → campThornmother | — | 3.5k: whisperwood › hold | while its camp is awake |
| northeast (raid) | campHollowpeak | — | 5.8k via scarpStair | while its camp is awake |
| farwest (raid) | campDrowned | — | 3.4k: saltmere › hollow › hold | while its camp is awake |

To regenerate the route column, run `node docs/world/tools/render.mjs`. The lint fails if any route breaks.

- **Muster resolution.** An approach musters at the first **standing** camp in its chain.
  - When the chain's camps are all burned, it musters at its **maw**: a permanent crack in the Ashlands. A maw can't be attacked, and closes only when the Regent dies.
  - A chain with no maw (east, and every raid) **closes for good** when its last camp burns. This is the reward for burning camps: fewer fronts, or farther ones.
- **Raids** are small: 30% of the night's budget, at most one per night. A raid is live only while its camp is **awake** (see Camps 2.0). So claiming a region next to a raid camp invites raids until you burn it.
- **Fronts per night.**

  | Waves | Approaches per night |
  |---|---|
  | 1–7 | 1 |
  | 8–14 | up to 2 |
  | 15–29 | up to 3 |
  | 30+ | every live one |

  The budget is split by weight: south 1.0, others 0.8. The existing wave director (`directorAdjust`) still scales the total.
- **Scaling.** Enemies take the tier of their muster's region:
  - hp × (1 + 0.25 · tier);
  - damage × (1 + 0.15 · tier).

  Unit mix: the wave table's mix, plus the muster camp's own `spawns.key` making up 30%.

## Spawning: the clamp and the march

- **Clamp.** Compute the muster's route: muster, through each via, to the hall. Let `d` be the path length from the muster to the first **claimed** cell on that route.
  - If `d > 2400`, spawn at the route point 2400 px before claimed ground.
  - Otherwise spawn at the muster.

  Spawns scatter within 120 px, on passable cells only.
- **March.** Spawned enemies are `marching`:
  - they move at **2.4×** speed along the route;
  - they ignore aggro unless they are hit;
  - they drop the flag the moment they stand on claimed ground, then behave as they do today, following the flow field toward the hall and attacking what they meet.
- Together these mean the first enemy arrives on claimed ground within about 12 s of dusk, however far the muster is. A march is also visible and interceptable: a player can meet it at a crossing outside their land.
- **Via legs.** Routing uses a flow field per leg (`nav.field('via:<crossing>')`, then `nav.field('hall')`). An enemy switches legs when it is within 96 px of the via crossing's midpoint, or when it is already past it on the hall field.

## Camps 2.0

Today a camp spawns when its zone unlocks. In v2 every camp exists from the start, but most are **asleep**.

| State | When | Does |
|---|---|---|
| asleep | its region is unclaimed and the hero is more than 900 px away | nothing. Drawn sketched in fog. Can't be damaged |
| awake | its region is claimed, **or** the hero has come within 900 px (`wakeRadius`) once | spawns patrols every `spawns.every` s, up to `2 × spawns.count` alive. Patrols stay inside the 700 px leash unless chasing, and attack structures within 600 px of the camp (the siege radius). Acts as an approach or raid muster |
| burned | hp 0 | pays `reward`. Frees survivors or relics tied to it. Advances its approach chain. Emits `camp:burned` |

**Tiers:**

| Tier | Camps | Rules |
|---|---|---|
| **warcamp** | 9 | as above |
| **stronghold** | Gallows Hill, Thornmother's Den, Seam Overseers, Stairwarden's Bastion, Slag Forges | the boss appears the first time the camp wakes and stands at the camp. The camp can't be damaged while its boss lives. The boss drops a relic (see [05](05-content.md#relics)). The Slag Forges have no boss; they are a stronghold by hp alone |
| **fortress** | Ashgate | three **braziers** (2000 hp each, 260 px around the camp) must fall before the fortress can be damaged. When it burns, the fire on the Regent's Causeway goes out |

**The rules the lint enforces** (see `RULES` in the tool):
- A camp is at least 600 px from any production pad, 450 px from a delve, and 400 px from a tower. Anything closer would sit inside the siege radius and be besieged forever.
- A camp is at least 800 px from its region's border stone.

## Fortification lines

Every blueprint `WALLS` entry becomes a row of wall pads, one every 62 px, with gates. The pads are built exactly like today's ring (`BuildingManager.generateWalls`), but along a polyline instead of a rectangle.
- A line appears when its region is claimed **and** the hall has reached its level.
- Both ends of every open line sit on a bank or a cliff, and the lint checks it (the end-anchor rule). A line that the horde can walk round is worthless.

| Line | Region | Hall | Holds |
|---|---|---|---|
| Palisade (ring) | hold | 1 | today's ring. The last line |
| Bridgehead | hold | 2 | the Old Bridge's north landing: the south and south-east approaches |
| Millford Barricade | hollow | 3 | the ford's north bank: the west approach |
| Gorge Gate | greyfall | 3 | the Gorge Bridge's west landing: the east approach |
| Stair Wall | rim | 4 | the top of the Cinder Stair: the south approach at its root |
| Pass Wall | kettle | 4 | the Kettle Pass's west mouth: the south-east once the Kettle camp is burned |

**Walls in the NavGrid.** A built wall pad blocks its cells at `WALL_COST` (high, but not infinite), and a gate is always passable. So when a player seals everything, the flow field still finds a way. That way runs through the cheapest wall, which the horde then attacks, as it does today.

## The finale

1. **Ashgate burns.** The fire on the **Regent's Causeway** goes out (`nav.setSealed('calderaCauseway', false)`). A banner says: *"The fire on the causeway dies."*
2. **The Crown.** Claiming it needs hall 5 and the Stairwarden burned.
3. **The Regent.** When the hero first stands on the causeway, the Regent rises on her island. She keeps her persistent health, as today.
4. **Her death.**
   - Every maw closes.
   - The approaches end.
   - The run summary plays, and the game continues in free play with raids only.
