# Issue #2 child-issue manifest

This manifest is the source body for the native GitHub sub-issues requested by
the Shroudly Preprod program. It is kept in the repository so issue creation is
reproducible and reviewable. The native issues are attached to parent issue
[#2](https://github.com/MrSufferer/mixtogether/issues/2). The checked-in
sections below remain the source body for each issue and are preserved
verbatim.

Each unblocked implementation issue is marked `ready-for-agent`; contract-
dependent work is marked `needs-info` when a feasibility gate is open. Each
provider, authority, or approval gate is marked `ready-for-human`. User
stories use the `US-01`…`US-16` map in the parent plan.

## Native issue map

| Manifest | Native issue | Status label |
| --- | --- | --- |
| 01 | [#3](https://github.com/MrSufferer/mixtogether/issues/3) | `needs-info` |
| 02 | [#4](https://github.com/MrSufferer/mixtogether/issues/4) | `ready-for-human` |
| 03 | [#5](https://github.com/MrSufferer/mixtogether/issues/5) | `needs-info` |
| 04 | [#6](https://github.com/MrSufferer/mixtogether/issues/6) | `needs-info` |
| 05 | [#7](https://github.com/MrSufferer/mixtogether/issues/7) | `needs-info` |
| 06 | [#8](https://github.com/MrSufferer/mixtogether/issues/8) | `needs-info` |
| 07 | [#9](https://github.com/MrSufferer/mixtogether/issues/9) | `needs-info` |
| 08 | [#10](https://github.com/MrSufferer/mixtogether/issues/10) | `ready-for-agent` |
| 09 | [#11](https://github.com/MrSufferer/mixtogether/issues/11) | `ready-for-agent` |
| 10 | [#12](https://github.com/MrSufferer/mixtogether/issues/12) | `ready-for-agent` |
| 11 | [#13](https://github.com/MrSufferer/mixtogether/issues/13) | `ready-for-agent` |
| 12 | [#14](https://github.com/MrSufferer/mixtogether/issues/14) | `ready-for-agent` |
| 13 | [#15](https://github.com/MrSufferer/mixtogether/issues/15) | `ready-for-agent` |
| 14 | [#16](https://github.com/MrSufferer/mixtogether/issues/16) | `ready-for-agent` |
| 15 | [#17](https://github.com/MrSufferer/mixtogether/issues/17) | `ready-for-agent` |
| 16 | [#18](https://github.com/MrSufferer/mixtogether/issues/18) | `ready-for-human` |

## 01 — Feasibility and safety constants (`needs-info`)

- **User stories / ADRs:** US-01; ADR 0001, 0009, 0011, 0027.
- **Dependencies:** none.
- **Public seams:** four Compact components; generated reference runner; sanitized build profile.
- **Tests:** Compact compile and key validation; financial/privacy/randomness/authority property matrix; deterministic reference tests.
- **Evidence:** compiler/runtime versions, source hashes, invariant output, and [the feasibility report](../midnight/feasibility-report.md).
- **Human gate:** maintainer supplies the accepted Compact language profile or approves a reviewed compatibility update before contract-dependent work resumes.

## 02 — Provider accounts and immutable deployment inputs (`ready-for-human`)

- **User stories / ADRs:** US-15, US-16; ADR 0010, 0017, 0018, 0023, 0026.
- **Dependencies:** issue 01.
- **Public seams:** Vercel variables, Render service, Supabase project, Resend domain, Better Stack workspace, Midnight Preprod endpoints.
- **Tests:** configuration generation, least-privilege audit, MFA and rotation drill.
- **Evidence:** sanitized variable-name snapshot, provider project IDs, permissions, and billing status; never values.
- **Human gate:** maintainer creates accounts, enables MFA, funds Preprod, and enters secrets directly into provider stores.

## 03 — Shielded tMIX asset and faucet (`needs-info`)

- **User stories / ADRs:** US-03; ADR 0009, 0027.
- **Dependencies:** issue 01.
- **Public seams:** `TmixAsset` Compact contract and `TmixAssetLedger` reference.
- **Tests:** six-decimal accounting, epoch nullifiers, shared-cap exhaustion, reserve segregation, one-shot automation allocation.
- **Evidence:** contract artifact hash and cap/faucet assertions.
- **Human gate:** deployer submits the reviewed asset contract on Preprod.

## 04 — Threshold randomness (`needs-info`)

- **User stories / ADRs:** US-04; ADR 0003, 0027.
- **Dependencies:** issue 01.
- **Public seams:** `RandomnessThreshold`, commit/reveal automation commands, contributor domain derivation.
- **Tests:** unique contributors/commits/reveals, deadlines, canonical ordering, two-of-three threshold, no fallback, domain isolation.
- **Evidence:** redacted commit/reveal receipt set and aggregate hash.
- **Human gate:** maintainer provisions isolated GitHub, Render, and offline contributor credentials.

## 05 — Yield adapter (`needs-info`)

- **User stories / ADRs:** US-05; ADR 0002, 0006, 0027.
- **Dependencies:** issues 01 and 03.
- **Public seams:** `YieldAdapter`, checkpoint/replenishment/rollover commands.
- **Tests:** deterministic intervals, bounded accrual, one-hour timelock, remaining-cap checks, reserve callback and rollover.
- **Evidence:** checkpoint and rollover state transitions with no Principal movement.
- **Human gate:** none beyond contract deployment.

## 06 — Pool accounting (`needs-info`)

- **User stories / ADRs:** US-06; ADR 0005, 0006, 0009, 0027.
- **Dependencies:** issues 03–05.
- **Public seams:** `PrizePool`, principal notes, TWAB, withdrawal, cohort and solvency snapshots.
- **Tests:** partial/full withdrawals, flooring/residue, reserve segregation, continuous TWAB, cohort enforcement, Solvency Invariant.
- **Evidence:** property matrix and sanitized reserve snapshots.
- **Human gate:** independent maintainer reviews the deployed contract IDs before evidence capture.

## 07 — Settlement and authorities (`needs-info`)

- **User stories / ADRs:** US-07; ADR 0004, 0007, 0014, 0027.
- **Dependencies:** issues 04–06.
- **Public seams:** winning commitment, private ownership proof, claim nullifier, expiry/rollover, pause and authority circuits.
- **Tests:** permissionless finalization, wrong-owner rejection, one-shot claim, expiry, pause scope, governance threshold, deployer deadline.
- **Evidence:** selected-owner claim and authority transition records.
- **Human gate:** governance handoff and deployer removal are manual transactions.

## 08 — Participant facade and deterministic adapter (`ready-for-agent`)

- **User stories / ADRs:** US-08; ADR 0010, 0022.
- **Dependencies:** issues 03–07.
- **Public seams:** typed `ParticipantApplication`, deterministic adapter, typed errors and receipts.
- **Tests:** complete local journey with injected time/randomness/finality/outage failures; no raw provider objects.
- **Evidence:** Playwright Mock Journey report explicitly labelled deterministic.
- **Human gate:** none.

## 09 — Recovery Kit and private-state lifecycle (`ready-for-agent`)

- **User stories / ADRs:** US-09; ADR 0005, 0007, 0023.
- **Dependencies:** issue 08.
- **Public seams:** Recovery Kit bundle, AES-256-GCM envelope, environment/deployment binding, retired archive rules.
- **Tests:** 256-bit key, export/restore drill, tamper and deployment mismatch, retired-state rejection, bigint round trip.
- **Evidence:** redacted drill result; never the key or plaintext witness.
- **Human gate:** maintainer performs the browser export/restore drill before first contribution.

## 10 — Backup Accounts (`ready-for-agent`)

- **User stories / ADRs:** US-10; ADR 0010, 0023.
- **Dependencies:** issue 09 and issue 02.
- **Public seams:** Supabase migration/RLS, verified email/password/TOTP session, browser AES encryption, CAS generation and handoff.
- **Tests:** migration lint, RLS policy tests, AAL2 read/delete, stale generation, one-writer handoff, provider retention disclosure.
- **Evidence:** migration checksum and synthetic account drill.
- **Human gate:** human configures Supabase Auth, Resend SPF/DKIM/DMARC, and retention settings.

## 11 — DUST Sponsor Service (`ready-for-agent`)

- **User stories / ADRs:** US-11; ADR 0008, 0010, 0027.
- **Dependencies:** issues 02, 08, and 10.
- **Public seams:** stateless HTTP handler, policy validator, idempotency and typed fallback.
- **Tests:** authentication, decoding, allowlists, value balance, participant proof/signature, quotas, timeout/rejection, redacted logs.
- **Evidence:** synthetic HTTP transcript with all credentials and payloads redacted.
- **Human gate:** operator funds only the bounded DUST hot balance and enters the Render secret.

## 12 — Genuine Preprod adapter (`ready-for-agent`)

- **User stories / ADRs:** US-12; ADR 0011, 0017.
- **Dependencies:** issues 02 and 08.
- **Public seams:** DApp Connector 4.0.1 discovery/connect; official wallet/proof/public/private/ZK/logging composition; finality observation.
- **Tests:** wallet/version/network rejection and finality/indexer/ledger lag states.
- **Evidence:** one minimal Lace transaction from the deployed public build.
- **Human gate:** maintainer authorizes Lace in qualified desktop Chrome.

## 13 — Shroudly web journeys (`ready-for-agent`)

- **User stories / ADRs:** US-13; ADR 0016, 0025, 0026.
- **Dependencies:** issues 08–12.
- **Public seams:** connection, recovery, faucet, contribution, withdrawal, draw, claim, backup, outage and reset views.
- **Tests:** Playwright deterministic journeys; accessibility, production bundle bridge scan, disclosure assertions.
- **Evidence:** sanitized browser artifacts and build profile.
- **Human gate:** supported desktop Chrome/Lace gate.

## 14 — Automation and operations (`ready-for-agent`)

- **User stories / ADRs:** US-14; ADR 0015, 0019, 0023, 0027.
- **Dependencies:** issues 04, 05, 07, 11, and 12.
- **Public seams:** idempotent randomness, checkpoint, finalization, health, reset and evidence commands; GitHub Actions and Render signer boundaries.
- **Tests:** dry-run commands, five-minute health detection, alert/log redaction, reset invalidation.
- **Evidence:** action run IDs, health snapshots, incident timeline, checksums.
- **Human gate:** Better Stack alert routing and Render signer approval.

## 15 — Isolation and runbook (`ready-for-agent`)

- **User stories / ADRs:** US-15; ADR 0017, 0018, 0023, 0026.
- **Dependencies:** issues 02–14.
- **Public seams:** immutable Preprod build, disabled Mainnet build, profile snapshot, runbook and migration artifacts.
- **Tests:** deployment isolation, config/secret/docs scans, profile hash verification, clean install/build.
- **Evidence:** release candidate manifest and sanitized Vercel snapshot.
- **Human gate:** Vercel projects/domains and provider billing/retention choices.

## 16 — Preprod qualification and publication (`ready-for-human`)

- **User stories / ADRs:** US-16; ADR 0016, 0021, 0026, 0027.
- **Dependencies:** issues 01–15.
- **Public seams:** deployed four contracts, web, sponsor, migrations, mail, monitoring and automation.
- **Tests:** genuine five-wallet draw/claim, supported Lace transaction, finality/indexer/ledger checks, release review against `cb4633c`.
- **Evidence:** redacted/checksummed release bundle retained as an Actions artifact for at least 90 days.
- **Human gate:** maintainer acts within 12 hours, completes governance handoff/deployer removal, performs Lace and recovery/backup drills, reviews evidence, creates immutable tag and GitHub Release.
