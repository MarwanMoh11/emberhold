# 01 · The world

## Principles

1. **Every border means something.** Regions meet in one of two ways. Some share open land: the near country, where the player spreads out. The rest meet at a named crossing over something impassable: a river, a cliff, lava. The horde cannot swim, climb or wade lava, so crossings are where nights are fought and where walls are worth building. Run `render.mjs --borders` to see which is which.
2. **A reason for everything.** Every pad, camp and field in the blueprint has a `why`. Farms sit on floodplain and loam, quarries at cliff feet, towers over crossings, camps on the roads the horde uses. If you can't write the why, it doesn't go on the map.
3. **Ten times bigger must not mean ten times the walking.** Outposts, waystones and roads (see [04 §Outposts](04-systems.md#outposts-and-waystones-s11)) keep the time from decision to action short. Nights clamp and force-march (see [03](03-nights-and-camps.md#spawning-the-clamp-and-the-march)), so a far-off camp still arrives on time.
4. **The old game survives inside the new one.** The hold is today's rampart ring, same shape and the same pads shifted, centred on (5120, 3150). The first ten minutes play exactly as they do now: hall, lumber, farm, first night over the bridge.
5. **The map explains itself.** Roads point the way. Every crossing has a road over it. Landmarks can be seen from far off. The atlas names everything the player has seen.

## Scale

| | Old | New |
|---|---|---|
| World | 3400 × 2800 (9.5M px²) | 10240 × 9216 (94.4M px², **9.9×**) |
| Regions | 6 rectangular zones | 17 polygon regions, 2 of them optional |
| Build pads | 27 | 94, rising to about 238 in S13c ([05 §A settled country](05-content.md#a-settled-country-s13b-s13c)), plus about 45 wall pads |
| Camps | 5 | 15: 9 warcamps, 5 strongholds (4 with bosses), 1 fortress. The Regent waits on her throne |
| Resource fields | 16 | 68 (fish is new) |
| Points of interest | 0 | 63: 6 shrines, 6 barrows, 3 survivor groups, 24 caches, 12 lore stones, 6 landmarks, 2 standalone waystones, 4 boss relics |
| Night approaches | 6 gates on the ring | 4 approaches and 4 raids, each routed through named crossings |

**Walking times.**
- The hero moves at 210 px/s, and roads add 20%.
  - Hall to Ferrow Cross: about 9 s.
  - Hall to the Barrow Diggers: about 13 s.
  - Hall to Ashgate by road: about 35 s.
  - Corner to corner: 65 s or more.
- With an outpost in each claimed region and waystones, no trip in the late game takes more than about 15 s.
- The old world's footprint is drawn on [map.svg](../map.svg). It covers the hold and a ring of the near country.

## Geography, north to south

- **The north** is settled country, with nothing that can't be walked:
  - the **Barrow Downs** (loam and barrows);
  - **Whisperwood** and the optional **Deepwood** to the west (timber);
  - **Frostmere**'s cold lake and pinewood to the north-east, reached by the Highroad or the Scarp Stair.

  Raids come from here, not approaches.
- **The Emberflow** runs from Frostmere down the Irontooth gorge, past the hold's feet, and west through Millford to the sea at Saltmere. It divides the settled north bank from the contested south bank. Three crossings matter:
  - the **Old King's Bridge**, below the hall: the south approach;
  - **Millford**, a slow ford: the west approach;
  - the **Gorge Bridge**, a narrow span: the east approach.

  **Reedwater Ford** is Saltmere's back door.
- **The hold** sits on the Ember Rise, north of the Old Bridge. Around it lie Hollow Village (people), Greyfall (stone, and the Gorge Bridge) and, over the bridge, the **Ferrow Fields** (big farms, the first muster).
- **The wide frontier** holds six tier-3 claims, and the campaign asks for four of them:
  - Saltmere (coin);
  - Irontooth (metal);
  - Barrowmoor (relics, and the Gallows Knight);
  - the Kettle (sulphur, springs, the south-east muster);
  - Frostmere;
  - the Deepwood.
- **Walls of cliff:**
  - the **Ironwall** and the **Slagwall** seal **Deepvein**, which you enter by the Seamgate from Irontooth or the Kettle Pass from the Kettle;
  - the **Scar** is a chasm from coast to edge. Everything south of it is the Ashlands, reached only by the Bonepass, the Cinder Stair and Smelter's Ramp.
- **The Ashlands:**
  - **Ashgate** (the fortress) in the west.
  - The **Cinder Crown** in the middle: the Regent's caldera, a ring of lava around her island throne. Its causeway is a wall of fire until Ashgate burns.
  - **Cinderfall** (optional crystal, and the Slag Forges) in the east.
  - The **Cinderrun** lava river walls Ashgate off from the Crown except at the Obsidian Bridge.

## Regions

Generated from the blueprint. Hall is the Command Hall level at which the border stone accepts payment. Tier drives enemy scaling, loot and the fog sketch.

| Region | Tier | Hall | Cost | Area (M px²) | Entered from | For |
|---|---|---|---|---|---|---|
| Emberhold `hold` | 0 | 1 | — | 3.9 | — | Home. Hall, depot, the muster buildings and the first line: the bridge. |
| The Barrow Downs `downs` | 1 | 1 | 120 coins | 5.3 | hold | Food. The best open farmland north of the river, and barrows to break open. |
| Whisperwood `whisperwood` | 1 | 1 | 200 coins, 60 wood | 4.9 | hold | Wood. Two lumber clearings and the first warcamp worth burning. |
| Hollow Village `hollow` | 1 | 1 | 300 coins, 150 wood | 2.6 | hold | People. Rebuilt houses, a river fishery, and the Millford crossing to hold. |
| Greyfall Scarp `greyfall` | 2 | 2 | 450 coins, 250 wood | 2.4 | hold | Stone. Quarries at the cliff foot; the Gorge Bridge is the east approach. |
| The Ferrow Fields `ferrow` | 2 | 2 | 600 coins, 300 wood, 100 food | 4.1 | hold | The bridgehead. Big farms on the floodplain and the first muster to break. |
| Frostmere `frostmere` | 3 | 3 | 900 coins, 400 wood, 200 stone | 7.4 | downs | Pine and fish, and the Shrine of the First Flame on Frostmere Isle. |
| Saltmere `saltmere` | 3 | 3 | 900 coins, 500 wood, 150 stone | 5.0 | hollow | Coin. The old quay takes a trading post, the only building that earns coins. |
| Irontooth Foothills `irontooth` | 3 | 3 | 1000 coins, 350 stone | 7.4 | greyfall | Metal. Open-cast iron on the east bank, across the Gorge Bridge. |
| Barrowmoor `barrowmoor` | 3 | 3 | 1100 coins, 300 stone, 200 food | 6.1 | hollow | Relics. Barrows and battlefield caches, and the Gallows Knight's stronghold. |
| The Kettle `kettle` | 3 | 3 | 1200 coins, 400 stone | 3.8 | ferrow | The south-east muster. Sulphur stone and healing springs. |
| The Deepwood *(optional)* `deepwood` | 3 | 3 | 1300 coins, 800 wood | 4.8 | whisperwood | Giant timber, the Heart Oak, and the Thornmother's den. |
| Deepvein `deepvein` | 4 | 4 | 1800 coins, 600 stone, 120 metal | 6.0 | irontooth | Deep metal and the first crystal delve, behind three walls of cliff. |
| The Blackened Rim `rim` | 4 | 4 | 2000 coins, 700 stone, 150 metal + burn campFerrow | 3.1 | ferrow | The Cinder Stair: fortify its top and the south approach is yours. |
| Ashgate `ashgate` | 4 | 4 | 2400 coins, 800 stone, 250 metal | 9.6 | barrowmoor | The fortress. Burning it unseals the Crown. |
| The Cinder Crown `crown` | 5 | 5 | 4000 coins, 1200 stone, 600 metal, 40 crystal + burn campStairwarden | 8.7 | rim | The finale. The causeway to the throne is sealed until Ashgate falls. |
| Cinderfall *(optional)* `cinderfall` | 5 | 5 | 3500 coins, 500 metal, 30 crystal | 3.2 | deepvein | The richest crystal and the Slag Forges that arm the south-east. |

Command Hall levels already run from 1 to 5 (Ember Tent to Citadel), and each region's `hall` maps onto them directly. The costs in this table are first-pass values; S20 owns balance.

## Pacing targets

What a first playthrough should feel like. S20 tunes towards these, and S22 checks them.

**Slowed on 2026-09-24 (human).** The macro pace (claims, acts, the Regent) runs at about **1.5×** the first-pass targets. The micro loop stays tight. The slower pace comes from costs and camp strength, never from dead time between rewards.

### The macro pace

| Act | Waves, old → new | Game clock at the act's end, old → new | Claimed by the end | What the player learns |
|---|---|---|---|---|
| I · The Rise | 1–5 → **1–8** | ~10 → **~16 min** | hold, downs, whisperwood | the loop: gather, build, hold the bridge; claims; the first camp burned |
| II · The River | 6–12 → **9–18** | ~27 → **~42 min** | + hollow, greyfall, ferrow | three fronts; the bridgehead; outposts; waystones |
| III · The Frontier | 13–22 → **19–33** | ~58 → **~90 min** | + four of the six tier-3 regions | shrines, barrows, relics, the first stronghold boss |
| IV · The Scar | 23–30 → **34–45** | ~87 → **~130 min** | + deepvein, rim, ashgate | fortifying crossings, the Stairwarden, Ashgate's fall |
| V · The Crown | 31+ → **46+** | the Regent ~105 → **~160 min** | + crown | the causeway opens, then the Regent |

**Claims, by wave (old → new):**
- downs 2 → 3, whisperwood 4 → 6;
- hollow 6 → 9, greyfall 8 → 12, ferrow 11 → 16;
- the four tier-3 claims about 14, 17, 19, 22 → 21, 25, 29, 33;
- deepvein 25 → 37, rim 27 → 41, ashgate 30 → 45, crown 32 → 48;
- the Regent falls around wave 33 → **50**.

The game clock is day plus night at today's constants: `dayLength` (60 + 10 × claimed, at most 180 s) plus about 50 s of march and fight. The old line said a first run takes "about 4–6 hours", but it was never reconciled with that clock, which reaches wave 31 in under 2 hours. The binding targets are now the waves and the game-clock minutes above: about **2.5–3 hours of game clock** to the Regent. S20 reports real play time next to them.

**Levers** (S20, in this order):
- region and hall costs (roughly 1.6×, so each claim takes 1.5× as long to afford at the same income);
- camp hp and rewards;
- the wave budget's growth per wave (÷1.5, so wave 45 threatens like the old wave 30);
- the wave-gated approach openings (5, 8, 11 → 8, 12, 17);
- the night reward's slope.

### The micro loop (kept tight)

- **Every 30–60 s** there is something visible to earn or build: a build or upgrade finishing, a hire, a recruit, a level-up.
  - Measure it as the gap between reward events: `building:built`, `worker:hired`, `soldier:recruited`, `player:levelup`, `quest:complete`, `region:claimed`, `camp:burned`, `poi:done`, `achievement` and `wave:cleared`.
  - Target: p50 ≤ 45 s and p90 ≤ 60 s of game clock, in every act.
- **Every 3–5 min** comes a quest or a milestone: a quest done, a claim, a camp burned, a shrine, a relic or a deed. No gap is longer than 6 min.
- **Every night** is a clear win with a reward: "NIGHT *n* HELD", coins (today `40 + 25 × wave`, which S20 retunes for the longer run) and the pickups swept in.
  - The reward buys at least one build or upgrade at that stage.
  - Chapels raise it (05).
- Villages that keep growing with each hall level ([05 §A settled country](05-content.md#a-settled-country-s13b-s13c)) keep the builds coming between claims.
