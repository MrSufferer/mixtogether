# ADR 0019: Set Mainnet service objectives and a public incident process

**Status:** Accepted

## Context

Paid hosting does not define how quickly failures must be detected, acknowledged, recovered, or communicated, and off-chain recovery must not be confused with ledger recovery.

## Decision

Ledger-backed financial truth has no off-chain recovery point. Operational data has a twenty-four-hour recovery point objective. Web and Sponsor Service recovery time is four hours, critical alerts fire and are acknowledged within fifteen minutes, and paid Mainnet services target 99.9% monthly availability. Incidents use a public status page, severity matrix, in-product banner, update cadence, resolution notice, and post-incident review.

## Consequences

Monitoring, alerts, backup restoration exercises, status-page access, and incident templates are release requirements. A missed objective is reported as an incident; database restoration may recover operations but never rewrite Midnight financial state.
