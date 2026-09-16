# ADR 0012: Require independent Mainnet security review

**Status:** Accepted

## Context

Contract tests and a value-capped canary reduce operational risk but do not independently validate zero-knowledge soundness, economics, browser-wallet boundaries, sponsorship, or production operations.

## Decision

A Mainnet Launch requires an independent Mainnet Security Review covering Compact and zero-knowledge behavior, economics and solvency, web-wallet and private-state boundaries, the Sponsor Service, and operations. Every finding is resolved or explicitly accepted by the accountable maintainer before the launch gate passes. A Canary Launch follows the review; it does not substitute for it.

## Consequences

Preprod may proceed with conspicuous test-only disclaimers, but Mainnet remains blocked without review reports, a finding disposition, and evidence that the reviewed source and Compatibility Profile match the deployed release.
