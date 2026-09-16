# ADR 0001: Keep financial authority Midnight-native

**Status:** Accepted

## Context

The repository previously proposed a hybrid design in which a second chain
could custody value while Midnight attested private draw results. That boundary
adds bridge and attestation authorities between participant Principal and
settlement.

## Decision

Midnight is the sole authoritative system for custody, accounting, commitments, eligibility, Prize Draw results, and settlement. It maintains a segregated Principal Reserve and Prize Reserve whose controlled assets must satisfy the Solvency Invariant. Principal is exact to six decimals; calculations floor deterministically and send Rounding Residue to Prize Rollover. Participants control Participant Private State. Off-chain services may automate actions or cache public data, but are not authoritative and cannot move participant or Prize value.

## Consequences

The existing hybrid proposal is not the production architecture. A Solvency
Invariant breach stops affected contributions and draws while preserving
demonstrably safe exits. Mainnet cannot launch until compatible, audited
Midnight-native asset and yield mechanisms are selected. Availability failures
in automation must not change ledger truth or require an operator to reconstruct
private witness state.
