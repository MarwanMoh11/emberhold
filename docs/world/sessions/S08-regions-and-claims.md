# S08 · Regions and claims

**Goal.** Turn zones into regions with real claim rules:
- border stones at claim points;
- hall, adjacency and camp requirements;
- claimed ground that looks claimed;
- the fog sketch;
- camps that sleep until their region is claimed or the hero comes near.

**Depends on.** S04 (the region raster), S05 (nav) and S07 (the painter, for the claim tint).

**Size.** Medium to large. `ZoneManager` is about 4.4k tokens, and you may read it whole: you are renaming it. `CampManager` is about 3k.

## Read first
- [04-systems.md §Regions and claims](../design/04-systems.md#regions-and-claims-s08)
- [03-nights-and-camps.md §Camps 2.0](../design/03-nights-and-camps.md#camps-20): the state table only; tiers are S10.
- [CONTRACTS.md §S04 and §S08](../CONTRACTS.md#s08-regions-and-claims)
- `src/systems/ZoneManager.ts` (whole) and `src/systems/CampManager.ts` (whole).
- The claim and banner UI: `grep -rn "claimPoint\|lockedZoneAt\|canUnlock" src`. Read ±10 lines around each hit.
- `QuestManager.targetFor`: grep `zone`.

## Do

**C1 · RegionManager**
1. Rename the class and its file. Keep `scene.zones` as an alias for this card only (S09 removes it).
2. Add `claimed`, `claimedAt`, `claimMask` (rebuilt on claim), and `canClaim` with reasons: `hall`, `adjacent` (meaning `claim.from` is not claimed), `camps` (`requiresCamps`) and `cost`.
3. Emit `region:claimed`.
4. Pads, wall pads and fields appear only in claimed regions, subject to each pad's `hall`. This is today's unlock logic, generalised.

**C2 · Border stones and banners**
1. The existing banner becomes a border stone at `claim.{x, y}`.
2. Its tooltip shows the cost, or the failing reason ("Needs a Stone Hall", "Burn the Ferrow Muster first", "Claim Hollow Village first").
3. Paying works as today.
4. On a claim:
   - play the region banner (the region's name and blurb);
   - invalidate the chunks in the region's bounding box.

**C3 · Look**
1. The painter reads the claim state: unclaimed regions are desaturated by 35% and darkened by 15%.
2. Explored-but-unclaimed ground draws its region border as a dotted ink line.
3. Claimed ground is full colour.

**C4 · Sleeping camps**
1. Every camp exists from the start, in the `asleep` state.
2. A camp wakes when its region is claimed, or when the hero comes within 900 px (`wakeRadius`).
3. A sleeping camp doesn't spawn, can't be damaged, and is drawn dimmed.
4. Save `campAwake`.
5. Replace today's "camps spawn when the zone unlocks" with this.

## Out of scope
- Leash and patrols, tiers, and braziers (S10).
- Approaches (S09). Raids are still the temporary gates.

## Done when
In the harness:
- `canClaim('ferrow')` returns reason `hall` at hall 1.
- After upgrading the hall and claiming, the region's pads appear.
- `canClaim('rim')` returns `camps` until campFerrow burns.
- Camps near an unclaimed region stay asleep until the hero walks within 900 px.
- The claimed and campAwake state survive a save and reload.
- The save test covers `regions` and `campAwake`.
- Tests and typecheck are green.

## Verify
- Use harness JSON checks for each rule.
- Take three screenshots:
  1. a border stone with its reason tooltip;
  2. the claimed and unclaimed contrast at the hold–downs border;
  3. a sleeping camp.

## Handoff
- Mark CONTRACTS §S08 as landed.
- Add save rows.
- Record how the claim tint invalidates chunks: the cost of a claim, in ms.
