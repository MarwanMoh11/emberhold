# R7 · Balance and the record

**Lands:** a probe run over acts I and II with the whole rework in, tuned
numbers, the README brought up to date, and a final smoke. Design: README §G.

## Read

- `docs/rework/STATUS.md` entries R1–R6 (the baseline table is in R1's).
- `docs/world/design/01-world.md` §Pacing targets (grep `## Pacing targets`,
  read ~35 lines).
- `src/dev/probe.ts` header and `report`; `TITHE`, `SACK`, `ARMY`, `HOLD`,
  `NIGHT_REWARD`, `PICKUP` in `config/balance.ts`.
- The repo `README.md` (whole; ~3k tokens).

## Checkpoints

**C1 · Measure.** Back up the save. `H.probe.start(); H.probe.run(18)` (repeat
`run` until wave 18 or the probe stalls), reduced in JS to ≤ 20 lines: per
wave the game clock, coins earned, coins in store, claims, and what the probe
waited on. Compare with R1's baseline and the act targets (act I: wave 8 by
~16 min; act II: wave 18 by ~42 min). If the probe's own logic broke on the
new army or sacking (e.g. it still reads `army.holding`), fix the probe first.

**C1b · Roadside holdings.** R3's smoke found advancing walkers aiming at a
structure within `HOLD.advanceBump` (110 px) in ~40% of samples: holdings
beside the roads get sacked every night, which is the complaint this rework
answers. Make the bump rule "only what actually blocks": an advancing walker
takes a non-defense structure as its target only if it is within ~60 px *and*
the walker has made little progress along the field for ~1 s (walls and gates
keep the latch). One harness sample to confirm the bump share drops.

**C2 · Tune.** Coins should not be the binding wait in acts I and II; acts may
land up to ~20% earlier than the targets, not more; nights should still be
lost sometimes by a probe that skips towers (don't test that; reason from the
numbers). Adjust `TITHE`, `NIGHT_REWARD` or kill coins, not region or hall
costs. At most two re-runs. Record the final table (≤ 12 lines) in STATUS.

**C3 · The record and the smoke.**
- `README.md`: the Playing table (`H` and the army button now give orders),
  the loop paragraph, the Automation section (the tithe, sacked-not-razed
  holdings and their mending, the dawn sweep), and a short note on nights
  (fronts converge on the hold and arrive in turn; raids go for the
  countryside; the army deploys to the front posts). Match the README's voice:
  plain, specific, no marketing.
- `docs/rework/STATUS.md`: close the rework (Next: none), prune older entries.
- Final smoke in the browser (restore the save afterwards): a new game, pump
  through two nights with the default orders, no console errors. One
  screenshot at `scale: 0.5` of the hold at night.
- Commit.

## Acceptance

- Probe table in STATUS; README current; tests, typecheck, lint green;
  a clean final smoke.
