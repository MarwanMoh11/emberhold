# S10 · Camps 2.0 and fortification lines

**Goal.**
- Awake camps patrol within a leash and besiege anything inside their siege radius.
- Camps have tiers: strongholds are invulnerable while their boss lives; the fortress has braziers.
- The Regent's Causeway is sealed by fire until Ashgate burns.
- Every blueprint wall line becomes buildable wall pads with gates.

**Depends on.** S05 (blockers), S08 (camp states) and S09 (camps as musters).

**Size.** Medium to large. `BuildingManager` is big (about 11k tokens), so **only** read `generateWalls` and the wall and gate helpers it calls.

## Read first
- [03-nights-and-camps.md §Camps 2.0, §Fortification lines and §The finale](../design/03-nights-and-camps.md#camps-20) (steps 1–2 of the finale only)
- [CONTRACTS.md §S05 and §S10](../CONTRACTS.md#s10-camps-and-lines)
- `src/systems/CampManager.ts` (whole, about 3k tokens).
- `src/systems/BuildingManager.ts`: `grep -n "generateWalls\|WALL_RING\|'wall'\|'gate'\|isPadAvailable"`. Read those functions only.
- Line geometry: `node docs/world/tools/render.mjs --region hold` (and the same for hollow, greyfall, rim and kettle).

## Do

**C1 · Camps 2.0**
1. Add `tier`, `leash` (700), `wakeRadius` (900) and `siegeRadius` (600) to `CampSpec`, from the blueprint.
2. Awake camps:
   - keep up to `2 × spawns.count` patrols alive;
   - return patrols past the leash unless they are chasing;
   - send patrols after structures within the siege radius.
3. Strongholds:
   - spawn their boss the first time they wake. **Until S17**, use a scaled `elite` named after the boss key;
   - can't be damaged while that boss lives.
4. The fortress (Ashgate): three braziers (2000 hp, 260 px around it) must fall before it can be damaged.
5. Rewards pay out as today, and `camp:burned` fires.

**C2 · The sealed causeway**
1. Add `nav.setSealed(crossingId, sealed)`, which bumps `version`.
2. At boot, `calderaCauseway` is sealed unless `campAshgate` is burned.
3. Paint the fire wall as an animated sprite over the crossing.
4. On `camp:burned` for `campAshgate`:
   - unseal it;
   - fade the fire out;
   - show the banner "The fire on the causeway dies."

**C3 · Wall lines**
1. Generalise `generateWalls` from a rectangle to any `WALLS` polyline: pads every `step` along the line, with ids `${line}.${k}`, and gates at the listed points.
2. The palisade still produces today's ring.
3. A line appears when its region is claimed and the hall is at its level.
4. Add `buildings.lineComplete(lineId)` for quests.
5. Built wall pads register NavGrid blockers (via S05's hook).

## Out of scope
- Real bosses (S17).
- Relic drops (S15). Leave a `camp:burned` payload that includes the boss key.

## Done when
- In the harness:
  - a claimed region's warcamp patrols but doesn't chase beyond about 700 px;
  - a farm inside a camp's siege radius gets attacked (build one there deliberately, with a dev override);
  - Ashgate takes no damage until its 3 braziers fall;
  - the causeway is impassable until Ashgate burns, then passable. Check with `nav.passableAt` at the causeway midpoint.
- The bridgehead, Millford, gorge, stair and pass lines appear at the right hall levels. Completing the bridgehead reroutes the south night through its gate.
- Tests and typecheck are green.

## Verify
- Use harness JSON checks for each rule.
- Take three screenshots: the bridgehead built, the causeway fire, and a stronghold with its boss.

## Handoff
- Where the placeholder boss spawns, so S17 can swap it.
- The line pad counts.
- CONTRACTS §S10 marked as landed.
