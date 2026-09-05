---
phase: planning
feature: mixtogether
title: MixTogether implementation plan
status: in-progress
---

# MixTogether implementation plan

## Queue

- [x] Record approved requirements and design; validate current Zama sources.
- [x] Scaffold pnpm workspace, Hardhat V2 package, and Vite React package.
- [x] Contract red/green: callback accounting, registration, ACL, exits, phase machine, accrual, randomization, selection, pruning, pause, and ownership.
- [x] Contract invariants and deterministic random harness.
- [x] Deployment scripts, address validator, keeper, ABI export, and Sepolia smoke tooling.
- [x] Web red/green: formatting, privacy reveal model, draw action model, pending unwrap persistence, dashboard, and failure states.
- [x] Component/accessibility tests and preview-mode Playwright flows.
- [x] Brand, README, CI, environment template, security disclosures, license, and release collateral.
- [x] Run full local gates, audit the implementation against requirements, and attempt authorized Sepolia/GitHub/Vercel release steps.
- [x] Preserve `OPEN`-phase withdrawal eligibility by recording the exit draw and rejecting pruning until that draw finalizes; add the regression test.
- [x] Normalize Zama SDK `TransactionResult.txHash` so SDK-backed steps always receive explorer links; add the result-shape test.
- [x] Align nominal-award and confidential-outcome copy across the dashboard and browser assertions.
- [x] Add exhaustive 65-wallet boundary and deployed cross-wallet ACL tests in `MixTogetherPool.ts`, fixing private zero handle generation in `MixTogetherPool.sol`.
- [x] Add mocked Playwright connected saver journey across desktop and mobile Chromium with in-process mock chain and Zama SDK harness.
- [x] Implement repo-root gitignored `.env` loading with resolver unit tests and fail-closed Sepolia configuration for Hardhat, keeper, and Vite.
- [ ] Complete the externally blocked Sepolia deployment (pool deploy, Etherscan verify, 100 cUSDC prize reserve funding, and live eight-slot HCU + two-wallet smoke tests).
- [ ] Create public GitHub repository MrSufferer/mixtogether and push feat/mixtogether.

## Dependencies

Contract ABI precedes live client writes. Zama SDK hooks are wrapped at the app boundary so UI tests remain deterministic. Sepolia deployment depends on an available funded deployer and RPC. GitHub publication depends on `gh` authentication as `MrSufferer`; preview deployment depends on Vercel authentication or the claimable fallback.

## Release status

- Vercel preview: deployed and independently checked for readiness, security headers, and browser console errors.
- Sepolia token preflight: passed for the official cUSDC/USDC pair, including a successful public faucet simulation.
- Sepolia pool deployment: waiting for operator to populate a funded `DEPLOYER_PRIVATE_KEY` in the gitignored `.env` file; live-network configuration fails closed with empty accounts when the key is absent.
- GitHub publication: `gh` CLI is authenticated as `MrSufferer`; ready for public repository creation and push.
## Risks and mitigations

- FHE package/API drift: pin versions verified from official template/npm and compile against installed declarations.
- HCU overflow: smallest encrypted widths, scalar operations, eight-slot fixed batches, and Sepolia gas/HCU smoke evidence.
- Callback/refund ambiguity: accept only authenticated callbacks and credit the actual transferred handle supplied by ERC-7984.
- Privacy regression: never log/emit handles or auto-decrypt; clear revealed state on wallet/chain/session change.
- Unfinished async unshield: persist and rediscover request identifiers.
- Premature exit pruning: bind each exit to its current draw id and permit pruning only after the pool advances beyond that draw.

## Phase 5 status — 2026-09-05

- Done: repo-root gitignored `.env` loading with resolver unit tests (`scripts/load-env.test.ts`), Hardhat config fail-closed accounts, keeper env loading, and Vite `envDir` sharing.
- Blocked: Sepolia deployment, 100 cUSDC reserve funding, and live eight-slot HCU + two-wallet smoke tests remain blocked until operator enters funded `DEPLOYER_PRIVATE_KEY` in `.env`.
- Next: Create public GitHub repository `MrSufferer/mixtogether`, push `feat/mixtogether`, and confirm CI.
