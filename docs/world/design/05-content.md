# 05 · Content

Everything is generated in code, as today. Art goes through the ink toolkit (`src/art/ink.ts`) in the existing style. Numbers are first-pass values, and S20 owns balance.

## New buildings

| Key | Session | Levels | Role |
|---|---|---|---|
| `outpost` | S11 | 2 | drop-off, waystone, respawn and fog light. See [04 §Outposts](04-systems.md#outposts-and-waystones-s11) |
| `fishery` | S13 | 3 | a production building. Workers gather **fish** nodes (placed on water cells) within 760 px and haul food. Level 1 costs 100 coins and 80 wood. Its yield curve mirrors the farm's |
| `tradingPost` | S13 | 3 | the only building that makes coins from time: a passive 0.6 / 1.2 / 2.0 coins per second, +20% with the Saltmere Light. Only on Saltmere's quay (`trade1`) |

**Fish** is a new node type, drawn as ripples with a leaping shape. It respawns like other nodes. Its fields sit in water, so the lint lets their centres fall outside any region polygon (offshore). Fishery pads stand on the bank beside them.

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
