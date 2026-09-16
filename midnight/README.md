# Shroudly Midnight contracts

This directory contains the four pinned Compact components that make up the
Shroudly Preprod release:

- `TmixAsset.compact` — shielded six-decimal `tMIX`, cap, one-shot reserve
  seeding, faucet nullifiers, and the isolated evidence allocation.
- `RandomnessThreshold.compact` — three registered contributors, unique
  commits/reveals, fixed deadlines, and a two-of-three aggregate.
- `YieldAdapter.compact` — segregated Prize Reserve, deterministic simulated
  yield, bounded replenishment, and rollover.
- `PrizePool.compact` — Principal custody, private account notes/TWAB,
  Disclosure Cohort, in-circuit weighted winner selection, Claim Nullifier,
  shielded payout, pause authority, rollover, and deployer removal.

`pnpm midnight:compile` performs the reproducible source compile and writes
only to the ignored `midnight/managed/` directory. `pnpm midnight:compile:keys`
additionally requests proving-key generation. Generated artifacts are
machine-local and must not be committed.

The profile checker reports the installed Compact CLI, compiler, runtime,
language, and remaining release gates. The pinned profile is Compact CLI
`0.5.2`, language `0.23.0`, compiler `0.31.1`, and runtime `0.16.0`; the local
toolchain and generated artifacts match this tuple. `readyForPreprod` remains
false until the provider, browser, authority, and production-operated evidence
gates pass. See [the feasibility report](feasibility-report.md) for the
reproducer. Mainnet transactional entrypoints are not present in this
artifact.
