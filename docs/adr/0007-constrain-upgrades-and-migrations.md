# ADR 0007: Constrain upgrades and migrations

**Status:** Accepted

## Context

Unrestricted upgrade authority could rewrite economic rules, while permanent immutability could leave participants exposed to a runtime or verifier defect.

## Decision

Governance Authority may apply compatible security, verifier, and runtime maintenance. A change to Principal rights, selection weighting, Prize ownership, or other economic rules requires a new audited deployment and participant-authorized migration. Governance cannot sweep or forcibly migrate participant value.

## Consequences

Every maintenance action needs compatibility evidence and a timelock. Migration tooling must let participants remain in the old deployment or explicitly authorize movement to the new deployment.
