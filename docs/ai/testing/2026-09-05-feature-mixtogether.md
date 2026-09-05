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
- [x] Preserve already-earned eligibility for an `OPEN`-phase withdrawal and skip third-party pruning until that draw finalizes; clear both exit markers on redeposit.
- [x] Pause only deposits; allow withdrawal, claim, and every draw advancement phase.
- [x] Execute worst-case eight-saver accrual and selection batches under the local FHE/HCU harness.
- [x] Deterministic first-interval, zero-weight restoration, underfunded award, and all-handle-rewrite cases.
- [x] Rotate the reserve handle on guardian acceptance so the former guardian cannot retain access to current state.
- [x] Liability backing, principal segregation, award restoration, and exactly-one-credit invariants.
- [x] Exhaustive 65-wallet boundary and deployed cross-wallet ACL tests (`packages/contracts/test/MixTogetherPool.ts` tests `rejects the 65th saver with RegistryFull` and `denies another saver user-decrypt of foreign principal and winnings`).
- [x] Fail-closed Sepolia resolver: empty accounts on missing/empty key, present hex key array, no public mnemonic fallback, RPC/Etherscan env resolution (`packages/contracts/test/load-env.ts`, 8 unit tests in Hardhat suite).
## Web tests

- [x] Number formatting: zero, null, signed zero, tiny amount, zero-subscript, and abbreviation.
- [x] Never render undisclosed encrypted values as zero; explicit reveal only; clear on wallet/chain/session change.
- [x] Adaptive action eligibility and contextual permissionless draw advancement.
- [x] Pending unwrap storage scoping and event recovery.
- [x] Transaction stepper mined/error/retry/explorer states.
- [x] Recognize the Zama SDK `{ txHash, receipt }` result shape in explorer-link extraction, prioritize canonical `txHash`, retain fallbacks, and reject malformed hashes.
- [x] Assert nominal-prize/reserve-dependent award copy and the “Confidential outcome” history label.
- [x] Keyboard focus, form labels/errors, live regions, reduced motion, and mobile/desktop layout.
- [x] Mocked Playwright journey: connect, faucet, shield, deposit, reveal, advance, claim, withdraw, resume unshield (`apps/web/e2e/journey.spec.ts` across `desktop-journey` and `mobile-journey`).

## Gates

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, contract coverage/invariant suites, and Playwright. Sepolia release additionally requires a real eight-slot accrual and selection, two-wallet walkthrough, verified source, and backed prize reserve.

Local unit, contract, build, and browser gates are rerun immediately before handoff. The Sepolia-only gates remain release blockers rather than locally simulated completion claims.

## Handoff evidence — 2026-09-05

- `pnpm check`: passed; 23 contract tests (15 pool + 8 resolver) and 13 web unit tests.
- `pnpm build`: passed with Solidity `0.8.27` and Vite `7.3.5`.
- `pnpm test:e2e`: passed; six desktop/mobile Chromium checks (4 preview + 2 connected saver journey).
- `pnpm audit --prod --audit-level high`: no known vulnerabilities.
- `pnpm --filter @mixtogether/contracts validate:sepolia`: passed on chain `11155111`, including the permissionless faucet simulation.
- Manual desktop/mobile screenshot review: no page console errors and no mobile overflow.

## Phase 5 evidence — 2026-09-05

- Contract targeted regression: 3 passing tests covering OPEN withdrawal retention, finalized pruning, selection eligibility, redeposit cancellation, and mixed pending/matured pruning batches.
- Resolver regression: 8 passing tests in `packages/contracts/test/load-env.ts` asserting fail-closed Sepolia accounts, hex key extraction, zero mnemonic leakage, and RPC/Etherscan env resolution.
- Web targeted regression: 5 passing tests covering canonical transaction hashes and privacy-safe draw labels/copy helpers.
- ABI export completed after the public `exitDrawId(address)` interface addition.
- Remaining release evidence is blocked on funded Sepolia deployment and live HCU/two-wallet execution.
## Phase 8/9 result — 2026-09-05

- Coverage additions are linked to `packages/contracts/test/MixTogetherPool.ts`, `apps/web/src/lib/transaction.test.ts`, `apps/web/src/lib/draw.test.ts`, and `apps/web/e2e/dashboard.spec.ts`.
- Full local gates are green: 23 contract tests, 13 web unit tests, 6 Playwright checks (4 preview + 2 connected saver journey), production build, production audit, and whitespace validation.
- No new local coverage gap was found for the changed behaviors; Sepolia-only HCU, two-wallet, and publication checks remain explicitly blocked release tasks.
