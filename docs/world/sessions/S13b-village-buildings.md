# S13b · Village buildings and a regional look

**Goal.** The seven new building types of [05 §A settled country](../design/05-content.md#a-settled-country-s13b-s13c), each doing a real job in the economy, and art that stops repeated buildings looking stamped:
- `cottage`, `granary`, `mill`, `market`, `chapel`, `watchPost` and `docks`;
- five **regional styles** (materials and roofs by biome);
- **per-instance variation** (a seeded roof tone, yard props, a mirrored layout).

This card adds seven of the ~144 new pads, one of each type, for testing. S13c lays the other ~137 across every region.

**Depends on.** S09b (the `DockSheet`, `StatLine` and `CostChips` panel style), S11 (the pattern for adding a building, and the outpost's fog light) and S13 (fishery and trading post, which docks and markets touch).

**Size.** Large: seven small systems and seven drawings. Keep each effect to the one mechanism named in 05. If the budget runs short, stop after C3 and leave C4 to a resumed session.

## Read first
- [05-content.md §A settled country](../design/05-content.md#a-settled-country-s13b-s13c): the tables of types, numbers and styles.
- [CONTRACTS.md §S06 (`dropoffFor`), §S09b, §S11, §S13 and §S13b](../CONTRACTS.md#s13b-and-s13c-a-settled-country)
- The S11 and S13 handoffs in STATUS: the file list for adding a `BuildingKey`. Follow it: `config/buildings.ts`, `PadKey` and `check.ts`, `render.mjs`'s `PRODUCTION`, `DEFENCE` and `NEEDS` sets, art, and the panel.
- `src/config/buildings.ts`: the `house`, `healingTent` and `watchtower` defs (grep them).
- `src/art/buildings.ts`: the palette constants (:19–28), `box`, `roof`, gables, `plinth`, and `DRAW.house` as the model. Grep; don't read the file whole.
- The mechanisms, one grep each:
  - population: `grep -n "POP\.\|perHouse" src/systems/*.ts`;
  - the drop-off chooser: `grep -n "dropoffFor" -A12 src/systems/BuildingManager.ts`;
  - gather yield: `grep -n "gather\|yield" src/systems/WorkerManager.ts`;
  - healing: `grep -n "heal" src/systems/BuildingManager.ts`;
  - the night reward: `WaveManager.endNight` (~:306);
  - fog light: `grep -n "reveal\|light" src/systems/RegionManager.ts`;
  - the warning time: `grep -n "warningSeconds" src/systems/WaveManager.ts`.

## Do

**C1 · Keys, config and pads**
1. Add the seven keys to `BuildingKey` and `PadKey`, with the defs, costs and footprints from 05.
   - None has worker slots, except that docks add a slot to nearby fisheries.
   - Categories: `watchPost` is `defense`, `mill` is `production`, and the rest are `support`.
2. Update the lint's sets in `render.mjs`:
   - `watchPost` goes in `DEFENCE`;
   - `NEEDS.docks = 'fish'`, so a docks pad must be within 760 px of a fish field, which puts it on a shore.
3. Add **one pad of each new type**, with a `why`, so the effects can be tested in play. Put the market, chapel, granary, cottage and mill round a market square in the hold, the watch post on the Downs' King's Road, and the docks by Hollow's fishery. S13c counts these seven in its totals. `world:lint` stays clean.
4. Each type's panel shows its effect with a `StatLine` in the S09b dock, for example "+15% farms within 600 px (2 in range)".

**C2 · Effects** (one mechanism each; see 05 for the numbers)
1. **`cottage`**: population, through the same `pop` stat and path as `house`.
2. **`granary`**: `dropoffFor(x, y, res?)` gains an optional resource. Food and fish haulers within 900 px unload at the nearest standing granary. Level 2 adds +10% food to the farms and fisheries that deliver there.
3. **`mill`**: add one helper, `buildings.localBonus(key, x, y) → number` (1 + the best mill in range, so mills don't stack). Farms and lumber camps within 600 px multiply their gather by it.
4. **`market`**: a tick that sells food and wood above a floor of 300 each for coins, at the level's rate, +5% per dwelling within 600 px (capped at +50%). The trading post stays the only building that makes coins from nothing.
5. **`chapel`**: heals like the infirmary (its radius and rate). `endNight`'s reward multiplies by `1 + chapel bonus` (+10% or +20% per chapel, capped at +50%).
6. **`watchPost`**:
   - it lights fog like an outpost, within its radius;
   - if tonight's route passes within that radius, the warning fires 4 s earlier;
   - level 2 targets like a level 1 watchtower.
7. **`docks`**: +1 worker slot on each fishery within 800 px. A trading post within 1500 px earns +15% (level 2: +25%); the best docks counts, and docks don't stack.
8. Add a unit test for the pure parts: `localBonus`, the market's rate, and the chapel cap.

**C3 · Art for the seven**
1. Draw each type in the ink style from the existing parts (`box`, `roof`, gables, plinth, smoke), one texture per level:
   - **cottage**: a one-room house with a chimney;
   - **granary**: a raised store on staddle stones;
   - **mill**: a windmill, or a waterwheel if the pad is within 200 px of river water;
   - **market**: stalls with awnings round a well;
   - **chapel**: a small nave with a bell-cote;
   - **watch post**: a timber platform with a lantern;
   - **docks**: a jetty with a crane and moored boats.
2. Each must read as its type at 1× from 300 px away. Levels differ visibly: a bigger footprint, stone, banners.

**C4 · Regional styles and per-instance variation**
1. **Styles.** `STYLE_BY_BIOME` maps the 17 biomes onto the five styles in 05 (`timber`, `woodland`, `fen`, `stone` and `ash`).
   - Turn the palette constants in `art/buildings.ts` (`WOOD`, `WOOD_D`, `BEAM`, `PLASTER`, `STONE`, `THATCH`, `TERRACOTTA`, `SLATE`) into a palette that `paintBuilding(key, lvl, w, h, style, variant)` sets for each bake.
   - The hold, military and defence buildings, walls and gates keep one look everywhere, for legibility.
2. **Variation, seeded by pad id** (`hash32`):
   - dwellings and civic buildings get a roof tone, one of three per style;
   - every non-military building gets 1–2 **yard props** from about eight (woodpile, cart, barrels, laundry line, beehives, herb bed, well, hay rick), placed on the side away from the road, depth-sorted by y and registered with the `Culler`;
   - the yard layout mirrors on a seeded coin flip. Mirror the building itself (`flipX`) only if a screenshot shows the shading still reads.
3. **Textures are baked lazily**: `ensureBuildingTexture(key, lvl, style, variant)`.
   - Boot keeps baking only the base set.
   - Other variants bake in an idle slice when a pad is revealed (on a claim or a hall level), never on the frame the player builds.
   - Keep a count: `bld_` textures in a late-game save must stay at 160 or fewer. Report the number.

## Out of scope
- Laying the other ~137 pads (S13c).
- Costs beyond first pass (S20).
- New quests (S18).
- Any change to wall or gate art (S09b).

## Done when
- Harness JSON, one check per type, each on the pad added in C1:
  - a cottage raises the population cap by its level's amount;
  - with a granary in range, a farm's haulers deliver to it, and the average haul distance falls;
  - a mill raises a farm's food over 120 s by its percentage, ±5%;
  - a market with 1000 food and 1000 wood earns its rate ±10%, and stops at the floor;
  - a chapel raises the night reward by its bonus and heals a hurt soldier in range;
  - a watch post clears fog in its radius, and moves `night:warning` 4 s earlier when a route passes it;
  - docks add a worker slot to Hollow's fishery.
- 12 cottages placed with a dev helper in one region show at least 3 roof tones and at least 4 yard layouts. The same pad id always gives the same look after a reload.
- Tests, typecheck and `world:lint` are green (0 errors, 0 warnings).

## Verify
Harness JSON for every check above. **Screenshots (3):** the hold's market square; a row of cottages in two different styles (the Downs and Greyfall); the docks by Hollow's fishery.

## Handoff
- CONTRACTS §S13b marked as landed: the new keys, `dropoffFor(x, y, res?)`, `localBonus`, `ensureBuildingTexture`, `STYLE_BY_BIOME`.
- For S20: every first-pass cost and effect number you had to change.
- For S21: the texture count, and the ms taken by the idle-slice bakes.
