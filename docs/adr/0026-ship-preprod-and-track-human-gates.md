# ADR 0026: Ship Preprod and track human gates

**Status:** Accepted

## Context

The implementation can automate code, tests, deployment procedures, and evidence validation, but it cannot create or assume control of personal provider accounts, DNS, billing, legal approval, independent audits, real assets, yield strategies, or independent Mainnet custodians.

## Decision

Implementation Completion means a production-operated public Shroudly Preprod Release with genuine finalized Midnight transactions and Playwright evidence, plus a fail-closed Mainnet build and comprehensive production runbook. The Mainnet application is not deployed merely as a landing page and cannot accept value until the Mainnet Readiness Gate passes.

Track the program in GitHub with one umbrella issue, ordered `ready-for-agent` implementation issues, and separate `ready-for-human` Human Gates. Each Human Gate names the required account or variable, least-privilege scope, setup and validation procedure, rotation or recovery procedure, and expected sanitized evidence without containing a credential. After the maintainer provisions required credentials directly in approved stores and signals continuation, the agent may resume authorized deployment and evidence capture.

## Consequences

Documentation-only handoff, mock Playwright output, submitted-but-unfinalized transaction identifiers, or placeholder deployments do not satisfy completion. The repository can be engineering-complete while accurately reporting outstanding Human Gates. Mainnet remains fail-closed rather than being represented as production-ready through copy or configuration.
