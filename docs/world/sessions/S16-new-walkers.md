# S16 · New walkers

**Goal.** Add four enemies, each with a behaviour, art and a place in the waves:
- the bog wretch;
- the thornling;
- the ash priest;
- the cinder hound.

Resolve the blueprint's bracketed placeholder spawns to them.

**Depends on.** S10 (camp spawns). It is independent of S11–S15, so the orchestrator may run it earlier if a card is blocked.

**Size.** Medium. The art is the cost: `art/units.ts` is 13k tokens. **Don't read it whole.** Grep for one existing walker's painter (for example `grep -n "bomber"`) and read just that as the pattern.

## Read first
- [05-content.md §New walkers](../design/05-content.md#new-walkers-s16)
- [CONTRACTS.md §S16 and §S17](../CONTRACTS.md#s16-and-s17-enemies)
- `src/config/enemies.ts` (small; whole): the `EnemyDef` shape, `aura`, `TargetPref`.
- The EnemyManager hooks for on-hit, on-death and aura: `grep -n "aura\|onDeath\|death\|slow" src/systems/EnemyManager.ts`.
- One walker painter in `src/art/units.ts`, as above.
- Where the camp spawn keys are read, from the S10 handoff.

## Do

**C1 · Defs and behaviours**
1. Add the four `EnemyKey`s and their `ENEMIES` entries, using the stats from 05.
2. Behaviours:
   - **bogWretch:** on hit, slows the target by 30% for 1.5 s (hero, soldiers).
   - **thornling:** spawns in packs of 5; a splinter burst on death (visual only).
   - **ashPriest:** a ranged caster with an aura (+25% damage, 10 hp/s heal within 220 px). Reuse `aura` if it fits.
   - **cinderHound:** leaves a 3 s burning patch where it dies (damages the hero and soldiers).
3. Unit tests for the pure parts: the slow's duration and stacking, and the aura maths.

**C2 · Art**
Draw one painter per walker, in the existing ink style with a matching silhouette scale:
- the **wretch** drips;
- **thornlings** are bramble-small;
- the **priest** wears an ashen robe and a brazier staff;
- the **hound** is embered.

**C3 · Wiring**
1. Replace the placeholders in `src/config/world/blueprint.ts` with the real keys: `bogWretch`, `thornling`, `ashPriest`, `cinderHound`. Tighten S01's test so it no longer allows brackets.
2. Add them to the wave mix by muster tier:
   - wretches from saltmere and barrowmoor musters;
   - hounds from tier 5;
   - priests in tier 4 and above, as 1 per 12 enemies.

## Done when
- Each walker appears in play from its camp: use the harness to wake the camp.
- `gallery(['enemy_…'])` shows all four.
- Tests and typecheck are green, and the world lint is green.

## Verify
- `H.gallery` for the art. Take one screenshot.
- Use harness JSON for the slow and aura effects.

## Handoff
CONTRACTS §S16 marked as landed, and the wave-mix numbers for S20.
