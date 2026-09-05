---
phase: testing
feature: mixtogether
title: MixTogether test strategy
status: in-progress
---

# MixTogether test strategy

## Contract tests

- [x] Authenticate callback token and mode; use actual transfers; accept encrypted zero; support repeat deposits.
- [x] Hold exited slots through selection, prune, and re-enter; saver count is bounded in contract code.
- [x] Accrue to cutoff, quantize at 0.1 cUSDC, preserve cutoff eligibility across post-cutoff withdrawal.
- [x] Pause only deposits; allow withdrawal, claim, and every draw advancement phase.
- [x] Execute worst-case eight-saver accrual and selection batches under the local FHE/HCU harness.
- [x] Deterministic first-interval, zero-weight restoration, underfunded award, and all-handle-rewrite cases.
- [x] Rotate the reserve handle on guardian acceptance so the former guardian cannot retain access to current state.
- [x] Liability backing, principal segregation, award restoration, and exactly-one-credit invariants.
- [ ] Exhaustive 65-wallet boundary and deployed cross-wallet ACL tests.

## Web tests

- [x] Number formatting: zero, null, signed zero, tiny amount, zero-subscript, and abbreviation.
- [x] Never render undisclosed encrypted values as zero; explicit reveal only; clear on wallet/chain/session change.
- [x] Adaptive action eligibility and contextual permissionless draw advancement.
- [x] Pending unwrap storage scoping and event recovery.
- [x] Transaction stepper mined/error/retry/explorer states.
- [x] Keyboard focus, form labels/errors, live regions, reduced motion, and mobile/desktop layout.
- [ ] Mocked Playwright journey: connect, faucet, shield, deposit, reveal, advance, claim, withdraw, resume unshield.

## Gates

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, contract coverage/invariant suites, and Playwright. Sepolia release additionally requires a real eight-slot accrual and selection, two-wallet walkthrough, verified source, and backed prize reserve.

Local unit, contract, build, and browser gates are rerun immediately before handoff. The Sepolia-only gates remain release blockers rather than locally simulated completion claims.

## Handoff evidence — 2026-09-05

- `pnpm check`: passed; 10 contract tests and 12 web tests.
- `pnpm build`: passed with Solidity `0.8.27` and Vite `7.3.5`.
- `pnpm test:e2e`: passed; four desktop/mobile Chromium checks.
- `pnpm audit --prod --audit-level high`: no known vulnerabilities.
- `pnpm --filter @mixtogether/contracts validate:sepolia`: passed on chain `11155111`, including the permissionless faucet simulation.
- Manual desktop/mobile screenshot review: no page console errors and no mobile overflow.
