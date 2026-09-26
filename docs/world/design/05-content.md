# 05 · Content

Everything is generated in code, as today. Art goes through the ink toolkit (`src/art/ink.ts`) in the existing style. Numbers are first-pass values, and S20 owns balance.

## New buildings

| Key | Session | Levels | Role |
|---|---|---|---|
| `outpost` | S11 | 2 | drop-off, waystone, respawn and fog light. See [04 §Outposts](04-systems.md#outposts-and-waystones-s11) |
| `fishery` | S13 | 3 | a production building. Workers gather **fish** nodes (placed on water cells) within 760 px and haul food. Level 1 costs 100 coins and 80 wood. Its yield curve mirrors the farm's |
| `tradingPost` | S13 | 3 | the only building that makes coins from time: a passive 0.6 / 1.2 / 2.0 coins per second, +20% with the Saltmere Light. Only on Saltmere's quay (`trade1`) |

**Fish** is a new node type, drawn as ripples with a leaping shape. It respawns like other nodes. Its fields sit in water, so the lint lets their centres fall outside any region polygon (offshore). Fishery pads stand on the bank beside them.

Seven more village types (S13b) are in [§A settled country](#a-settled-country-s13b-s13c).

## A settled country (S13b, S13c)

Decided on 2026-09-24 by the human: by the endgame every region, the hold included, is dense with buildings and reads as part of one settled country. S13b adds the building types and the regional look. S13c lays the pads.

### Targets

- **A village in every region.** 6–12 pads within about 600 px of the claim point (in the hold, round the palisade). Dwellings stand round a market, a chapel or a granary, with a watch post on the road in.
- **Outlying ground.**
  - farmsteads (a farm and a cottage) on open loam;
  - mills beside the farms;
  - production at the region's fields, where the lint allows it;
  - watch posts on roads and over crossings.
- **Growth.** About a third of each region's new pads open at the next hall level, so a village keeps growing after the claim. That also feeds the micro loop ([01 §Pacing](01-world.md#pacing-targets)).
- **Pads.** From 94 to about 238 (2.5×), as in the table below. Wall pieces come on top.

| Region | Pads today | Target | The village | Outlying |
|---|---|---|---|---|
| hold | 22 | 34 | a market square, chapel and granary; cottages outside the palisade along the King's Road | a mill on the Rise |
| downs | 5 | 16 | Kingsbarrow Cross: cottages, chapel, granary, market | farmsteads on the loam, a windmill, a watch post on the King's Road |
| whisperwood | 3 | 12 | Woodcutters' Rest: log cottages, a sawmill (a mill), a chapel | a lumber camp, a watch post on the old track |
| hollow | 8 | 16 | the green: cottages, market, chapel, granary | a watermill on the Emberflow, docks, a farmstead |
| greyfall | 4 | 12 | Scarpfoot: stone cottages, market, chapel | a quarry, a watch post over the gorge road |
| ferrow | 7 | 18 | Ferrow Cross: cottages, granary, market, chapel | farmsteads, two mills, watch posts facing the Rim |
| frostmere | 6 | 15 | Rimewatch: stone cottages, chapel, granary | docks on the lake, a lumber camp, a watch post on the Highroad |
| saltmere | 6 | 16 | the harbour town: cottages, market, docks, chapel | salt-marsh farmsteads, a watch post at Reedwater |
| irontooth | 5 | 14 | Rustgate: miners' cottages, market, chapel | a mine, a watch post on the gorge road |
| barrowmoor | 4 | 12 | Gallowgate: cottages, chapel, granary | farmsteads, watch posts on the three roads |
| kettle | 4 | 12 | a spa village by the springs: cottages, chapel, market | a quarry, a watch post at the Pass |
| deepwood | 3 | 10 | Heartwood Lodge: log cottages, a mill, a chapel | a lumber camp, a watch post |
| deepvein | 5 | 12 | a miners' camp on the Haul Road: cottages, granary, market | a mine, a watch post at the Seamgate |
| rim | 4 | 10 | Stairhead: cottages, chapel | watch posts over the Stair |
| ashgate | 3 | 12 | Ashfall, in the fortress's lee: cottages, market, chapel, granary | a mine, watch posts on the Bonepass |
| crown | 2 | 8 | Emberfall: cottages, chapel | watch posts on the caldera rim |
| cinderfall | 3 | 9 | Slagwatch: cottages, market | a delve, a watch post |
| **total** | **94** | **238** | | |

### New building types

The numbers are first-pass values, and S20 tunes them. None of these has worker slots of its own (docks lend fisheries one), so density adds buildings, not crowds.

| Key | Levels | Lv.1 cost | What it does | Mechanism |
|---|---|---|---|---|
| `cottage` | 2 | 40 wood, 20 coins | +2 / +3 population. It is cheap, so a village is mostly cottages | the `pop` stat, like `house` |
| `granary` | 2 | 80 wood, 40 coins | a food drop-off: farm and fishery haulers within 900 px unload here. Lv.2: +10% food from them | `dropoffFor(x, y, res)` |
| `mill` | 3 | 100 wood, 60 coins | farms and lumber camps within 600 px gather +15 / +25 / +35%. The best mill counts, not the sum. A windmill, or a waterwheel by a river | `localBonus` |
| `market` | 3 | 120 coins, 80 wood | sells food and wood above 300 of each for coins: 0.3 / 0.6 / 1.0 coins/s, +5% per dwelling within 600 px (at most +50%). The trading post stays the only building that makes coins from nothing | a resource tick |
| `chapel` | 2 | 120 stone, 60 coins | heals the hero, soldiers and workers within 280 px (2 / 4 hp/s). Each chapel raises the night's reward by +10 / +20%, and +50% at most in all | the infirmary's heal; `endNight` |
| `watchPost` | 2 | 60 wood | lights the fog within 600 / 900 px. Tonight's warning comes 4 s early if a route passes within that radius. Lv.2 shoots like a Lv.1 watchtower | the outpost's fog light; `night:warning`; tower targeting |
| `docks` | 2 | 120 wood, 60 coins | shore pads only: +1 worker slot on each fishery within 800 px, and a trading post within 1500 px earns +15 / +25% (the best docks counts) | slot and income hooks |

Existing types fill out the villages too: `house` (the Longhouse), `farm`, `lumberCamp`, `quarry`, `mine`, `fishery` and `watchtower`. The `blacksmith` (the smithy) and the `stable` stay in the hold, as do the `workshop` and the `warehouse`. Their stats are global, so a second one would stack.

### Regional styles

| Style | Biomes | Walls | Roofs (three seeded tones) | Touches |
|---|---|---|---|---|
| `timber` | rise, meadow, village, farmland | plaster and timber frame | thatch, terracotta, weathered red | flower boxes, wattle fences |
| `woodland` | forest, oldgrowth | logs | wood shingle, moss, bark | antlers over the door, moss on the eaves |
| `fen` | marsh, moor | tarred boards on a stone footing | reed thatch, turf, tar-black | nets, peat stacks |
| `stone` | scarp, highland, rust | fieldstone | slate, blue-grey, rust iron | chimneys; snow on the roofs in the highland |
| `ash` | sulphur, badlands, deeprock, ash, obsidian, slag | basalt block | iron sheet, soot, copper-green | ember-lit windows, braziers |

The hold's buildings, military and defence buildings, walls and gates keep one look everywhere, so they always read at a glance.

### Per-instance variation

Everything is seeded by the pad id, so a building always looks the same after a reload.
- **Roof tone:** one of the style's three, for dwellings and civic buildings.
- **Yard props:** 1–2 of about eight (woodpile, cart, barrels, laundry line, beehives, herb bed, well, hay rick), on the side away from the road.
- **Orientation:** the yard layout mirrors on a coin flip. The building itself mirrors only where its shading still reads.
- **Budget:** variant textures bake lazily, when a pad is revealed and in an idle slice. A late-game save holds 160 `bld_` textures at most.

## Points of interest (S14, S15)

A single `PoiManager` owns every POI.

- **States.** `unseen` → `seen` (it has entered the fog-revealed area) → `done`.
- **Seeing one.** A seen POI gets an atlas icon and a name.
- **Interacting.** You interact by standing on the POI, the same verb as build pads.
- **Saving.** Only the set of `done` ids is saved.

| Kind | Count | Rule |
|---|---|---|
| **cache** | 24 | the existing supply chest, placed off-road. Loot scales with the region's tier. One-time |
| **lore** | 12 | stand on it for 1 s to show its line as a parchment toast. Reading all 12 earns a deed ("Loremaster") |
| **shrine** | 6 | restore it once by paying `cost` while standing on it. Its effect is permanent (it registers modifiers). Restored shrines glow and are visible from far off |
| **survivors** | 3 | locked until their condition is met. Walk in to gain the effect (+population and free workers, who appear at the nearest matching building) |
| **barrow** | 6 | break it open (hit it like a node, about 6 s). That wakes a guardian: an `elite` scaled by tier. Kill it for the grave goods, a tier-scaled bag. `barrowKing` and `barrowMoor3` give relics |
| **landmark** | 6 | a big painted prop, seen from far off (drawn over the fog as a silhouette) and named on the atlas. The Heart Oak and the Ember Throne are tied to events |
| **waystone** | 2 standalone | see [04 §Outposts](04-systems.md#outposts-and-waystones-s11) |
| **relic** | 4 markers | not interactable. They mark where stronghold bosses drop their relics |

**Survivor conditions:**

| Group | Condition |
|---|---|
| `survHollow` | `campRotwood` burned |
| `survFerrow` | `campFerrow` burned |
| `survSalt` | the Saltmere Light restored |

**Shrines** (effect and cost are in the blueprint):

| Shrine | Region | Effect |
|---|---|---|
| Harvest | ferrow | +15% food from farms and fisheries |
| Mason | greyfall | +20% wall and gate hp |
| First Flame | frostmere (isle) | +10% hero XP, +2 hp/s |
| Fallen | barrowmoor | +10% soldier hp |
| Kettle Springs | kettle | infirmaries heal +25%; outposts heal like a Lv.1 infirmary |
| Saltmere Light | saltmere | +20% trade income; the coast is revealed on the atlas |

## Modifiers

Stats that shrines and relics touch. `mods.value(stat, base)` applies every `add`, then every `mult`. Only systems that read these stats need to change.

`food.yield`, `wood.yield`, `trade.income`, `wall.hp`, `hero.xp`, `hero.regen`, `hero.pierce`, `soldier.hp`, `soldier.damage`, `army.speed`, `rally.cooldown`, `worker.speed`, `worker.gather`, `infirmary.heal`, `outpost.heal`, `pack.size`, `tower.range`.

## Relics

| Relic | Source | Effect |
|---|---|---|
| the Barrow Crown | barrowKing (downs) | `pack.size` +15% |
| the Captain's Horn | barrowMoor3 | `soldier.damage` +10% |
| the Gallows Bell | Gallows Knight | `army.speed` +15%, `rally.cooldown` −20% |
| the Thorn Crown | Thornmother | `hero.pierce` +1 |
| the Heart-Oak Seed | Thornmother (at the Heart Oak) | `wood.yield` +25% |
| the Overseer's Lash | Seam Overseer | `worker.speed` and `worker.gather` +15% |
| the Warden's Aegis | Stairwarden | `tower.range` +10% |

Relics show on the pause page as painted seals, with their tooltip. The deed "Reliquary" is for holding all seven.

## New walkers (S16)

Each one replaces a bracketed placeholder in the blueprint's camp spawns. S16 edits the blueprint to the real key.

| Key | Placeholder | Where | Sketch |
|---|---|---|---|
| `bogWretch` | `shield` | the Drowned Bell | hp 160, damage 9, speed 54. Its hits slow the target by 30% for 1.5 s. Drips; slow and heavy |
| `thornling` | `swarm` | the Thornmother | hp 10, damage 2, speed 130. Comes in packs of 5; a burst of splinters when killed |
| `ashPriest` | `commander` | the Stairwarden | hp 220, a ranged caster (200 px). Aura within 220 px: allies deal +25% damage and heal 10 hp/s |
| `cinderHound` | `runner` | the Slag Forges | hp 60, damage 8, speed 170. Leaves a burning patch for 3 s where it dies |

Follow `ENEMIES` in `src/config/enemies.ts` for the full stat shape, and `src/art/units.ts` for the drawing style.

## Bosses (S17)

| Key | Stronghold | hp | Kit | Drops |
|---|---|---|---|---|
| `gallowsKnight` | Gallows Hill | 3500 | a cleaving melee. At 50% hp *the hanged rise*: 4 grunts climb out of the ground | the Gallows Bell |
| `thornmother` | Thornmother's Den | 3000 | nearly stationary. A thornling pack every 6 s, and a root-lash line attack | the Thorn Crown and the Heart-Oak Seed |
| `seamOverseer` | Seam Overseers | 4200 | a 180 px ranged whip. Nearby enemies +20% speed | the Overseer's Lash |
| `stairwarden` | Stairwarden's Bastion | 5000 | immune while 2 bound ash priests live (they respawn once). Charges along the Stair | the Warden's Aegis |
| `cinderRegent` | the Ember Throne (not a camp) | as today | moved to the caldera island. Wakes when the hero sets foot on the opened causeway | the victory |

**Every boss:**
- is an `EnemyDef` with `boss: true`;
- has a name plate and a health bar in the existing boss UI;
- keeps persistent health like the Regent's today, so a retreat doesn't reset the fight.
