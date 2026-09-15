---
phase: testing
feature: mixtogether
title: MixTogether test strategy
status: complete
---

# MixTogether test strategy

## Contract tests

- [x] Authenticate callback token and mode; use actual transfers; accept encrypted zero; support repeat deposits.
- [x] Hold exited slots through selection, prune, and re-enter; saver count is bounded in contract code.
- [x] Accrue to cutoff, quantize at 0.1 cUSDC, preserve cutoff eligibility across post-cutoff withdrawal.
- [x] Preserve already-earned eligibility for an `OPEN`-phase withdrawal and skip third-party pruning until that draw finalizes; clear both exit markers on redeposit.
- [x] Pause only deposits; allow withdrawal, claim, and every draw advancement phase.
- [x] Execute worst-case eight-saver accrual and selection batches under the local FHE/HCU harness.
- [x] Deterministic first-interval, zero-weight restoration, and all-handle-rewrite cases.
- [x] Dedicated underfunded award (`min(reserve, NOMINAL_PRIZE)` when reserve is below 10 cUSDC): `packages/contracts/test/MixTogetherPool.ts` test `awards the funded reserve when it is below the nominal prize`.
- [x] Rotate the reserve handle on guardian acceptance so the former guardian cannot retain access to current state.
- [x] Principal segregation, award restoration, and exactly-one-credit (first-interval winner) coverage.
- [x] Explicit liability-sum invariant: decrypt/assert `cUSDC balance of pool >= aggregate principal + prize reserve + unclaimed winnings` (`packages/contracts/test/MixTogetherPool.ts` test `keeps confidential token balance at least principal plus reserve plus unclaimed winnings`; pool token handle via mock `fhevm.debugger.decryptEuint`).
- [x] Exhaustive 65-wallet boundary and deployed cross-wallet ACL tests (`packages/contracts/test/MixTogetherPool.ts` tests `rejects the 65th saver with RegistryFull` and `denies another saver user-decrypt of foreign principal and winnings`).
- [x] Fail-closed Sepolia resolver: empty accounts on missing/empty key, present hex key array, no public mnemonic fallback, RPC/Etherscan env resolution (`packages/contracts/test/load-env.ts`, 8 unit tests in Hardhat suite).
- [x] Sepolia smoke helpers: funding mode uint8 encoding and fail-closed smoke config resolution (`packages/contracts/test/smoke-sepolia.ts`, 5 unit tests in Hardhat suite).

## Web tests

- [x] Number formatting: six-decimal parse, trailing-zero strip, compact public amounts. Zero-subscript notation is not implemented and is not a design requirement.
- [x] Never render undisclosed encrypted values as zero; explicit reveal only; clear on wallet/chain/session change.
- [x] Adaptive action eligibility and contextual permissionless draw advancement.
- [x] Pending unwrap storage scoping and event recovery.
- [x] Transaction stepper mined/error/retry/explorer states.
- [x] Recognize the Zama SDK `{ txHash, receipt }` result shape in explorer-link extraction, prioritize canonical `txHash`, retain fallbacks, and reject malformed hashes.
- [x] Assert nominal-prize/reserve-dependent award copy and the “Confidential outcome” history label.
- [x] Product a11y: labeled amount field, live status/error regions, `focus-visible`, reduced-motion CSS and `useReducedMotion`.
- [x] Playwright a11y walk: keyboard focus, form error announcement, reduced-motion (`apps/web/e2e/dashboard.spec.ts` test `supports keyboard focus, labeled amount, live status, and reduced motion`; `apps/web/e2e/journey.spec.ts` test `announces an invalid amount on the live error region`).
- [x] Mocked Playwright journey: connect, faucet, shield, deposit, reveal, advance, claim, withdraw, resume unshield (`apps/web/e2e/journey.spec.ts` across `desktop-journey` and `mobile-journey`).

## Gates

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, contract coverage/invariant suites, and Playwright. Sepolia release additionally requires a real eight-slot accrual and selection, two-wallet walkthrough, verified source, and backed prize reserve.

Local unit, contract, build, and browser gates are rerun immediately before handoff. The Sepolia-only gates remain release blockers rather than locally simulated completion claims.

## Handoff evidence — 2026-09-05

- `pnpm check`: passed; 32 contract tests (15 pool + 8 resolver + 5 smoke + 4 eight-slot helpers) and 13 web unit tests.
- `pnpm build`: passed with Solidity `0.8.27` and Vite `7.3.5`.
- `pnpm test:e2e`: passed; six desktop/mobile Chromium checks (4 preview + 2 connected saver journey).
- `pnpm audit --prod --audit-level high`: no known vulnerabilities.
- `pnpm --filter @mixtogether/contracts validate:sepolia`: passed on chain `11155111`, including the permissionless faucet simulation.
- Manual desktop/mobile screenshot review: no page console errors and no mobile overflow.

## Phase 5 evidence — 2026-09-05

- Contract targeted regression: 3 passing tests covering OPEN withdrawal retention, finalized pruning, selection eligibility, redeposit cancellation, and mixed pending/matured pruning batches.
- Resolver regression: 8 passing tests in `packages/contracts/test/load-env.ts` asserting fail-closed Sepolia accounts, hex key extraction, zero mnemonic leakage, and RPC/Etherscan env resolution.
- Smoke helper regression: 5 passing tests in `packages/contracts/test/smoke-sepolia.ts` asserting uint8 ABI encoding and fail-closed configuration.
- Web targeted regression: 5 passing tests covering canonical transaction hashes and privacy-safe draw labels/copy helpers.
- ABI export completed after the public `exitDrawId(address)` interface addition.
- Sepolia live evidence: pool deployed at `0x29713643C62C6743a5BF68e39Ac1De8EAEC0bC97` (tx `0xe083f629dd1a3a7e605c53cfc08a204d9a91d9b6fd596a5760afe72b40490648`), prize reserve funded with 100 cUSDC (tx `0xc7fecfa7b1070088c0f7a08244126bd21479d0dc62a3651a81c2fc5effd40e07`), eight-slot HCU accrual (tx `0xe3ed691d8b1f9b2926f5b995c6087f9ea1f8917d5fdbe6410098c4d7e4e6eb55`, block 11644163, gas 2,271,055), eight-slot HCU selection (tx `0xd2b5a77d9c9ce78728fda476a92c5e15129024ccdee624dc29ab2882ac5d69f3`, block 11644170, gas 2,804,197), user decryption verified (1,000,000 clear value), cross-wallet decrypt denial confirmed, claim transactions confirmed (blocks 11644187, 11644188), and withdrawal confirmed (block 11644189).

## Phase 8 result — 2026-09-06

Phase 8 added tests of already-shipped behavior (no product-code change). First-run Hardhat its passed; the Playwright a11y locator was tightened after a strict-mode miss on two `role="status"` regions.

- New Hardhat its in `packages/contracts/test/MixTogetherPool.ts`: `awards the funded reserve when it is below the nominal prize`; `keeps confidential token balance at least principal plus reserve plus unclaimed winnings`.
- New Playwright tests: `supports keyboard focus, labeled amount, live status, and reduced motion` (`apps/web/e2e/dashboard.spec.ts`); `announces an invalid amount on the live error region` (`apps/web/e2e/journey.spec.ts`).
- Coverage tooling: first `SOLIDITY_COVERAGE=true pnpm --filter @mixtogether/contracts coverage` failed with Hardhat `HH303` (`Unrecognized task 'coverage'`). Added `solidity-coverage` `0.8.17` as a contracts devDependency plus `import "solidity-coverage"` in `packages/contracts/hardhat.config.ts`. Retry succeeded, exit 0, **34 passing (3m)**. MixTogetherPool: **96.99% statements / 71.62% branches / 88.57% functions / 96.76% lines**. Remaining uncovered lines in `MixTogetherPool.sol`: `349` (`renounceOwnership` `GuardianRequired` revert; no mocha caller), `395` (defensive `RegistryFull` after a full slot scan; `saverCount` already checked), `517` (`_randomWord` on the production contract; the harness overrides it). Reports written to `./coverage/` and `./coverage.json` (gitignored).
- `npx ai-devkit@latest lint --feature mixtogether`: all AI docs `[OK]`; only `[MISS]` is `feature-mixtogether` branch (accepted; stay on `feat/mixtogether`).
- `npx ai-devkit@latest task list --json`: **unavailable** (`error: unknown command 'task'`; ai-devkit has no task subcommand in this install). Phase 8 continued without task events.
- `pnpm --filter @mixtogether/contracts test`: exit 0, **34 passing** (17 pool + 8 resolver + 4 eight-slot helpers + 5 smoke).
- `pnpm check`: exit 0; lint + typecheck; **13** web vitest tests; **34** contract tests.
- `pnpm build`: exit 0; Solidity `0.8.27` (nothing to recompile after tests) and Vite `7.3.5`.
- `pnpm test:e2e`: exit 0; **10 passed** (6 preview Chromium including 2 new a11y + 4 journey including 2 invalid-amount).
- `pnpm audit --prod --audit-level high`: no known vulnerabilities.

Sepolia live receipts from Phase 5/7 are unchanged release evidence; this phase did not re-run HCU or two-wallet scripts.

## Phase 7 honesty — 2026-09-06

Earlier checklist rows over-claimed coverage. Phase 8 closed the three local gaps named there (underfunded award, liability-sum decrypt, Playwright a11y). Zero-subscript formatting remains out of scope (not a design requirement). Local gates from Phase 7 are superseded by the Phase 8 commands above.

## Phase 8/9 result — 2026-09-05 (superseded)

Earlier note claimed 32 contract tests and 6 Playwright checks before the three Phase 8 tests existed. Use the 2026-09-06 Phase 8 result for local gate counts.

## Phase 9 result — 2026-09-06

Holistic pre-push review of `feat/mixtogether` plus uncommitted Phase 8 tests/docs. No blocking fund-loss or immutable-pool defect. Ready to commit the Phase 8 test/tooling diff and open a PR. Important client and operator follow-ups below are not demo-path blockers for the already-deployed Sepolia pool.

Fresh gates this session:

- `pnpm check`: exit 0; 13 web tests; 34 contract tests.
- `pnpm --filter @mixtogether/web build`: exit 0; Vite `7.3.5`.
- `pnpm test:e2e`: exit 0; **10 passed**.
- `pnpm audit --prod --audit-level high`: no known vulnerabilities.
- `npx ai-devkit@latest lint --feature mixtogether`: docs `[OK]`; only `[MISS]` is `feature-mixtogether` (accepted).
- Task tracing unavailable (`unknown command 'task'`).

Client/operator fixes on this branch after the review (no pool redeploy):

- Web: `assertSuccessfulReceipt` rejects viem/`status: "reverted"` (and numeric `0`) before `run()` marks confirmed. Unit coverage in `apps/web/src/lib/transaction.test.ts`. Failed receipts keep their hash.
- Smoke: `processBatchesWhileInPhase` repeats accrual/selection until the 64-slot cursor completes. Helper `isRegistryCursorComplete` covered in `packages/contracts/test/smoke-eight-slots.ts`.

Important follow-ups still open (not demo-path blockers; current Sepolia pool is immutable):

- `_register` writes `_winnings[saver] = _zeroFor(saver)`, so an unclaimed prize is orphaned if a saver is pruned and then deposits again. Claim still works after prune until that re-deposit. No keeper/UI prune path today.
- Untested live HCU worst case: eight occupied savers in slots 56–63, so one selection tx runs eight `_visitSelection` plus `_finalizeDraw`.
- Walkthrough wallets (`keccak256("mixtogether:smoke:saver:0|1")`) are not the eight-slot smoke wallets (`keccak256(deployerKey:saver:i)`).
- Keeper `--watch` remains one step per loop and does not need a drain loop.

Release operator items unchanged: Etherscan verify, demo video, production URL/`noindex`, independent audit.
