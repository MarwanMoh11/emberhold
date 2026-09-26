# S11 · Outposts and waystones

**Goal.** Add the outpost building, whose four jobs are:
- drop-off;
- waystone;
- respawn;
- fog light.

And add waystone fast travel, including the two standalone stones.

**Depends on.** S06 (`dropoffFor`) and S08 (claims). This card is where `FUTURE_PADS` starts to empty.

**Size.** Medium to large. Building art is the unknown: read **one** existing building painter as a pattern, not the whole art file.

## Read first
- [04-systems.md §Outposts and waystones](../design/04-systems.md#outposts-and-waystones-s11)
- [05-content.md §New buildings](../design/05-content.md#new-buildings)
- [CONTRACTS.md §S06 and §S11](../CONTRACTS.md#s11-outposts-and-waystones)
- `src/config/buildings.ts`: the `B(...)` helper and the depot and healingTent entries (`grep -n "depot\|healingTent\|^const B\|function B"`).
- `src/art/buildings.ts`: `grep -n "depot"`. Read just the depot painter, as a pattern.
- The hero death and respawn code: `grep -rn "respawn" src/entities/Player.ts src/scenes/GameScene.ts`.
- The `dropoffFor` location, from the S06 handoff.

## Do

**C1 · The building**
1. Add `outpost` to `BuildingKey`, with 2 levels (costs in 04).
2. Paint it: a timber blockhouse with a tall lantern pole and a standing stone beside it.
3. Move the outpost pads out of `FUTURE_PADS`.
4. Update `check.ts`.
5. Drop-off: extend `dropoffFor` to the nearest outpost **by path**.
6. The hero deposits carried loot at an outpost, as at the depot.

**C2 · Respawn and light**
1. `scene.respawnPoint()` returns the outpost nearest to where the hero died, provided no enemy is within 600 px and it isn't burning. Otherwise it returns the hall.
2. Each outpost reveals the fog within 600 px, once built.
3. Level 2 adds a heal aura. It uses `outpost.heal`, which S14 will make modifiable; hardcode the base for now.

**C3 · Waystones**
1. Add a `Waystones` system:
   - built outposts, plus the POIs `wsHall` and `wsIsle`;
   - `activate` on touch;
   - `travel(id)` with a 1.2 s channel, interrupted by damage;
   - daytime only, except the Hall Stone, which works at night too;
   - soldiers within 500 px come along.
2. **For now**, the UI is a simple parchment list shown while the hero stands on an active stone. S12 moves it into the atlas.
3. Save the `waystones` active ids.

## Out of scope
- The atlas (S12).
- Shrines (S14), including the Kettle Springs outpost-heal bonus.

## Done when
- In the harness:
  - a worker at `lumber2` (Downs) delivers to `outDowns` once it is built, not to the depot;
  - dying near a safe outpost respawns the hero there;
  - travelling from `outDowns` to `wsHall` works by day, and the army comes along;
  - night travel is refused except to the hall.
- Save round-trips with `waystones`.
- Tests and typecheck are green.

## Verify
- Use harness JSON.
- Take two screenshots: the outpost at level 1, and the travel list.

## Handoff
- CONTRACTS §S11 marked as landed.
- Save rows added.
- Where the travel list UI lives, so S12 can replace it.
