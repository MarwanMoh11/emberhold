# S13c · A settled country

**Goal.** Raise the blueprint from 94 pads to about **238**, following the per-region table in [05 §A settled country](../design/05-content.md#a-settled-country-s13b-s13c).
- Every region, the hold included, gets a village near its claim point and outlying farmsteads, mills and watch posts. By the endgame the frontier reads as one settled country.
- The STATUS decision of 2026-09-24 sanctions these pads. Nothing else in the blueprint moves.

**Depends on.** S13b: all seven new building keys exist, and its seven test pads count towards the totals.

**Size.** Medium. This is mostly blueprint data, and the lint does the checking. Don't read the blueprint whole: grep each region's pad block.

## Read first
- [05-content.md §A settled country](../design/05-content.md#a-settled-country-s13b-s13c): the pad table, the village recipe and the rules.
- [01-world.md §Principles](../design/01-world.md#principles), rule 2: every pad has a `why`.
- [CONTRACTS.md §S07](../CONTRACTS.md#s07-terrain-art): `PROP_CLEAR`. Props keep 100 px from pads, and the scatter reflows by itself because it is deterministic per chunk.
- The lint's pad rules: `sed -n 148,191p docs/world/tools/render.mjs` and `RULES` (~:35). Their spacing: 130 px between pads (100 is an error), 45 px from walls, and from camps 600 (production), 400 (defence) or 450 (other). There are also rules for POIs (90 px), fields (r + 60) and `NEEDS` (a matching field within 760 px).
- Tests that pin counts: `grep -n "94\|PADS.length\|1019\|props" tests/world-blueprint.test.mjs tests/scatter.test.mjs`.
- Per region, as you work: `node docs/world/tools/render.mjs --region <id>`, and `grep -n "// ---- <Region name>" src/config/world/blueprint.ts` to find its pad block.

## Do

**C1 · A placement helper**
1. Add `render.mjs --free <region> [--near x,y] [--key k] [--n 12]`. It prints up to *n* spots, nearest first, that pass **every** pad rule for that key:
   - a dry footprint that is reachable;
   - the spacing rules, and the wall, camp, POI and field clearances;
   - 70 px or more from any road's centre line;
   - 120 px or more from the region's claim stone.
   Output is one line per spot, in about 400 tokens.
2. Test it on Downs: every suggested spot, added as a pad, keeps `world:lint` at 0 errors and 0 warnings.

**C2 · The hold and the near country** (hold, downs, whisperwood, hollow, greyfall, ferrow: about +59 pads)
1. For each region, lay the village first, then the outlying ground. Follow 05's recipe:
   - dwellings round a market, chapel or granary;
   - farmsteads (a farm and a cottage) on open loam;
   - a mill beside the farms;
   - watch posts on roads and over crossings.
2. Keys:
   - production pads are mostly farms, which need no field;
   - a lumber camp, quarry or mine goes only where the lint finds 6 or more nodes within 760 px;
   - don't add fields (that would be a design change).
3. Hall levels: about two-thirds of each region's new pads open at the region's hall. The rest open at the next level, so the village keeps growing after the claim.
4. Every pad gets a short, specific `why`, for example "Cottage on the green, facing the market."
5. Run `world:lint` after each region.

**C3 · The frontier** (frostmere, saltmere, irontooth, barrowmoor, kettle, deepwood: about +51 pads)
Same recipe, with the regional flavour from 05. Examples:
- Saltmere is a harbour town with docks and a market;
- Irontooth is a miners' town at Rustgate;
- the Kettle is a spa village by the springs.

**C4 · The deep south, then check the whole map** (deepvein, rim, ashgate, crown, cinderfall: about +34 pads)
1. Lay the last regions.
2. Then:
   - `npm run world:lint`: 0 errors, 0 warnings;
   - `npm run world:map`, to redraw `map.svg`;
   - update the pinned counts in the tests;
   - note the prop count before and after. It will fall near villages. `PROP_BUDGET` stays 1500.
3. Harness snapshot, for S21: claim every region (`H.claim`), build every pad to level 1 (a dev helper), and let the game run for 60 s of day. Report:
   - buildings standing;
   - workers alive (the save caps them at 500);
   - the Culler's static count;
   - frame p50 and p95;
   - `nav.stats().paths`.

## Out of scope
- New building types or art (S13b).
- Costs (S20).
- Quests that use the villages (S18).

## Done when
- The blueprint holds 238 pads, ±10%, and every region is within 2 of its target in 05.
- Every region has a village cluster: at least 6 pads within 600 px of its claim point (the hold: round the palisade).
- `world:lint` is clean. Tests and typecheck are green.
- Saves still load. Pad ids are new; old ones are unchanged.

## Verify
- The lint, the tests and the harness snapshot (JSON).
- **Screenshots (3):** a claimed, fully built village (Downs); an outlying farmstead with its mill (Ferrow); the atlas, or `map.svg` at 0.5, showing pads across every region.

## Handoff
- The per-region pad counts, as built, against 05.
- The harness snapshot numbers, for S21.
- Any region where the rules left less room than 05 asks for, and why.
