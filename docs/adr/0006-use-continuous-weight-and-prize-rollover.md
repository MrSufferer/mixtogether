# ADR 0006: Use continuous weight and Prize Rollover

**Status:** Accepted

## Context

Snapshot balances reward timing games, while mandatory locks contradict withdrawable Principal. Empty and abandoned draws also need a destination that does not benefit the operator.

## Decision

Selection weight is Time-Weighted Principal accrued continuously from confirmed contribution until confirmed withdrawal. Weight already accrued remains valid for the active draw, and Principal is never locked. A draw with fewer than five eligible commitments produces no winner. Otherwise the selected Winning Commitment is public; its owner privately proves membership, selection, and ownership, consumes a Claim Nullifier, and receives a shielded payout. The Claim Window is sixty minutes on Preprod and thirty days on Mainnet. Empty, sub-threshold, or expired Prizes become a Prize Rollover and never operator property.

## Consequences

Deterministic contract tests must cover mid-draw contributions, partial and full withdrawals, retained accrued weight, empty and sub-threshold draws, private ownership proofs, double-claim rejection, shielded payout, expired claims, and rollovers. The public Preprod Evidence Bundle may be limited to one successful contribution, draw, and claim. Draw schedules are fixed in UTC: fifteen minutes on Preprod and weekly on Mainnet, with only future bounded changes permitted through timelocked governance.
