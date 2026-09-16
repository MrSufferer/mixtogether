# ADR 0011: Pin the Midnight compatibility profile

**Status:** Accepted

## Context

Midnight compiler, runtime, ledger, client, wallet connector, proof, indexer, and network changes can invalidate an otherwise successful build or journey.

## Decision

Every release pins an exact Compatibility Profile. Release gates compile the contract with required proving keys, verify the declared compatibility matrix, check network and indexer health, and complete a serial real-network smoke journey with the pinned wallet connector. The Automated Preprod Journey uses a controlled Wallet SDK and proof provider through an Automated Wallet Bridge present only in a marked test build; production builds fail if it or its hooks are included. Deterministic tests and Mock Journeys run on pull requests; the real Preprod journey runs nightly or by manual dispatch and must pass afresh for a release. A transaction counts as evidence only after network-reported finality, indexer availability, and a fresh ledger-state query. Automatic semver adoption, fixed-duration confirmation sleeps, and unrecorded manual compatibility judgments are not release paths.

## Consequences

Dependency updates require a newly qualified profile and new evidence. A green mock journey or frontend build cannot satisfy the Preprod or Mainnet release gate.
