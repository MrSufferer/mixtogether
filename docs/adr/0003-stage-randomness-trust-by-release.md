# ADR 0003: Stage randomness trust by release

**Status:** Accepted

## Context

A single operator-provided seed permits outcome manipulation, while an audited Midnight-native randomness oracle has not yet been selected.

## Decision

Preprod registers three distinct contributor keys, all controlled by the current Operator, and requires at least two valid commitments and reveals. One key is held in protected GitHub Actions, one by Render, and one by an offline CLI recovery store. This is cross-provider key isolation, not independent randomness custody. Weighting closes every fifteen minutes, commitments close three minutes before weighting, and reveals are accepted only during the five minutes after weighting closes. Mainnet weighting closes weekly in UTC, commitments close twenty-four hours before weighting, and reveals are accepted only during the following twenty-four hours. If the threshold is not met by the published timeout, the draw is cancelled and its Prize becomes a Prize Rollover; there is no operator seed, block-hash, or previous-seed fallback. Mainnet requires either an audited Midnight-native randomness oracle or a separately approved and audited threshold design with independent operators. Valid reveals are combined canonically, and after the on-ledger deadline anyone may finalize the Prize Draw; automation is only a caller.

## Consequences

Local deterministic tests must show cutoff enforcement, post-close reveals, canonical combination, permissionless finalization, threshold failure, cancellation, and Prize Rollover. The public Preprod Evidence Bundle may show only the successful draw path. Mainnet deployment is blocked until the selected randomness mechanism and its independent operating parties are documented and audited.
