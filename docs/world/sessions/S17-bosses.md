# S17 · Bosses and the finale

**Goal.**
- Four stronghold bosses with kits, replacing S10's placeholder elites.
- The Cinder Regent moved to her island throne.
- The causeway wake-up.
- The victory flow that closes the maws.

**Depends on.** S10 (strongholds and the causeway), S15 (relic drops) and S16 (thornlings and ash priests, which the bosses summon).

**Size.** Large. The Regent's existing code is the pattern: read it, not the whole EnemyManager.

## Read first
- [05-content.md §Bosses](../design/05-content.md#bosses-s17)
- [03-nights-and-camps.md §The finale](../design/03-nights-and-camps.md#the-finale)
- The Regent today: `grep -rn "cinderRegent\|Regent" src --include=*.ts | head -30`. Read the boss behaviour block and the boss UI hook.
- The persistent boss health save: `grep -n "bossHealth\|campHealth" src/systems/*.ts`.
- The placeholder boss spawn, from the S10 handoff.

## Do

**C1 · Kits**
Add the four `EnemyKey`s with `boss: true`, plus a name plate and health bar:
- **gallowsKnight:** cleave; *the hanged rise* at 50%.
- **thornmother:** nearly stationary; a thornling pack every 6 s; root-lash line.
- **seamOverseer:** a 180 px whip; nearby enemies +20% speed.
- **stairwarden:** immune while 2 bound ash priests live (they respawn once); charge.

Health persists through `campHealth` under the boss key. Write unit tests for the pure phase logic.

**C2 · Art**
Give each boss a painter, 1.6–2× walker scale, with a distinct silhouette:
- a knight with a noose-banner;
- a thorn matron;
- a masked overseer with a whip;
- an armoured warden with a stair-shield.

**C3 · The finale**
1. Move the Regent's spawn to `THRONE`.
2. She wakes when the hero sets foot on the unsealed causeway.
3. Her death:
   - closes all maws (the approaches end);
   - plays the run summary;
   - continues in free play, with raids only.
4. Swap S10's placeholder elites for the real bosses.

## Done when
- In the harness, each boss can be woken, fought (using a dev god-mode if one exists; otherwise add `H.god()`) and killed. Each drops its relic.
- The Regent can't be reached before Ashgate burns. After it burns, she wakes on the causeway and her death ends the approaches.
- Tests and typecheck are green.

## Verify
Use harness JSON for the state transitions. Take two screenshots: the boss gallery (`H.gallery`) and the Regent risen.

## Handoff
CONTRACTS §S17 marked as landed, and the boss hp and kit numbers for S20.
