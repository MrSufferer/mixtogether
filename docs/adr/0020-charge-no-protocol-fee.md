# ADR 0020: Charge no protocol fee

**Status:** Accepted

## Context

A protocol fee could fund hosting and DUST sponsorship, but it would complicate solvency, private accounting, legal analysis, and the promise that participant Principal remains fully withdrawable.

## Decision

The protocol charges no contribution, withdrawal, yield, Prize, claim, or sponsorship fee. The Operator funds hosting and sponsored DUST outside the Principal Reserve and Prize Reserve. Any future fee requires a separately reviewed contract deployment and explicit participant opt-in; it cannot be introduced through mutable configuration or retroactively applied to existing Principal.

## Consequences

The product cannot claim self-funding economics, and sponsorship may be quota-limited or unavailable while the participant-funded DUST path remains usable. Accounting and evidence must show that no operator value is skimmed, including Rounding Residue. A future fee is a migration decision rather than an administrative parameter change.
