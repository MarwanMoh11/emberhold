# S19 · Save v2

**Goal.**
- Consolidate every save field added since S04.
- Make validation tolerant of blueprint edits: unknown ids are dropped, types are still strict.
- Enforce the size limits.
- Implement the **v1 migration decision**.
- Harden the portability tests.

**Depends on.** Every session that added state (S03, S04, S08–S15, S17). **Blocked** until the human has answered the migration decision in STATUS. If it is still open, implement the default (A, the Veteran's charter) behind a single constant, and flag that in the handoff.

**Size.** Medium. `SaveManager` is about 4k tokens; read it whole.

## Read first
- [07-save.md](../design/07-save.md) (whole)
- The CONTRACTS save-fields table.
- STATUS §Open decisions.
- `src/systems/SaveManager.ts` (whole), `tests/save-portability.test.mjs` and `tests/quest-save.test.mjs`.

## Do

**C1 · Schema**
1. Make one `SaveBlobV2` type.
2. `validSave` checks every field:
   - types and ranges strictly;
   - ids **filtered** against the world module (unknown ids are dropped with `console.warn`);
   - the fog length against `maxEncodedLength`;
   - the whole blob at 64 KB or less.
3. Drop the old fog format fallback left from S03.

**C2 · Migration**
Implement the decided option. For the default (A):
1. Show a title-screen offer when a v1 save exists and no v2 save does.
2. Copy v1 to `emberhold.save.v1.archive` (never delete it).
3. Carry over the hero level (capped at 10), XP, `upgrades`, `abilities` and lifetime combat stats.
4. Put a charter chest at the hall: 25% of the stockpile, with coins capped at 1500 and each other resource at 600.
5. Start quests at a1.

**C3 · Tests**
- Portability round trips cover every field.
- A fixture save with an unknown pad id and a moved pad still loads.
- A real v1 fixture migrates.
- An oversized blob is rejected.
- The portable download and import round-trip.

## Done when
- Every test is green, and the browser check passes: back up the real save first, then save, reload, load, then migrate a v1 fixture.
- CONTRACTS lists every save field with its owner.

## Handoff
Record the decision you implemented, and mark it resolved in STATUS §Decisions.
