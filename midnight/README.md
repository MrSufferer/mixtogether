# Shroudly Midnight contracts

This directory contains the four pinned Compact components that make up the
Shroudly Preprod release:

- `TmixAsset.compact` — shielded six-decimal `tMIX`, cap, faucet nullifiers,
  and the isolated evidence allocation.
- `RandomnessThreshold.compact` — three registered contributors, unique
  commits/reveals, fixed deadlines, and a two-of-three aggregate.
- `YieldAdapter.compact` — segregated Prize Reserve, deterministic simulated
  yield, bounded replenishment, and rollover.
- `PrizePool.compact` — Principal custody, private account notes/TWAB,
  Disclosure Cohort, winner commitment, Claim Nullifier, pause authority, and
  deployer removal.

`pnpm midnight:compile` performs the reproducible source compile and writes
only to the ignored `midnight/managed/` directory. `pnpm midnight:compile:keys`
additionally requests proving-key generation. Generated artifacts are
machine-local and must not be committed.

The profile checker reports the installed compiler and remaining release gates.
The current workstation reports Compact language `0.23.0` while the accepted
profile requires `0.5.1`; consequently `compatibilityMatch` and
`readyForPreprod` remain false. See [the feasibility report](feasibility-report.md)
for the reproducer. Source compilation is necessary but cannot waive provider,
browser, authority, or production-operated evidence gates. Mainnet
transactional entrypoints are not present in this artifact.
