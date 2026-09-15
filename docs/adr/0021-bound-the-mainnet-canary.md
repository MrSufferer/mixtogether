# ADR 0021: Bound the Mainnet canary

**Status:** Accepted

## Context

A Mainnet launch exposes real value before operating history exists. A time-only canary would not bound economic loss, while a value-only cap would not exercise repeated draw and incident-response behavior.

## Decision

The initial Mainnet canary lasts at least thirty days. Its total accepted value is capped at the lesser of one percent of the independently audited strategy capacity and a nominal asset limit approved during launch review. An increase requires at least four completed draws, no unresolved critical incident, and the applicable Governance Authority timelock.

## Consequences

Mainnet contribution limits cannot be copied from Preprod or chosen before the asset, audited strategy capacity, legal gate, and launch review are known. Reaching either cap stops new contributions without impairing withdrawals or valid Prize claims. Cap increases are deliberate on-chain governance events with public evidence.
