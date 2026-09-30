# Web Experience

The Web Experience context describes supported participant journeys and the browser evidence that qualifies a release.

## Language

**Shroudly**:
The unconditional public product name for the Midnight-native private prize-savings application. The Operator accepts known collisions with unrelated software using the same name and does not make brand or trademark clearance a Preprod release gate. Public language describes Shroudly on its own terms and does not imply that it is an official PoolTogether product, partnership, or deployment.
_Avoid_: PoolTogether on Midnight, official PoolTogether fork, jackpot operator

**Deterministic Browser Journey**:
A Playwright-controlled journey against the deterministic reference adapter. It exercises public application behavior and failure states locally; it is never presented as network evidence and never ships a wallet bridge.
_Avoid_: Mock evidence, production test, automated wallet bridge

**Supported Wallet Journey**:
A maintainer-executed journey using Lace against the deployed Vercel release, captured with at least one corresponding finalized network transaction in addition to the Deterministic Browser Journey.
_Avoid_: Manual demo, wallet screenshot

**Private-State Backup**:
An export of Participant Private State encrypted on the participant's device with a browser-generated, high-entropy recovery key. The participant may store the ciphertext locally or opt into remote storage through a conventional email-authenticated Backup Account. The Operator can associate the account with backup metadata but cannot decrypt or recover its contents.
_Avoid_: Custodial recovery, operator backup, seed escrow

**Backup Account**:
A conventional verified-email-and-password profile used to locate and manage encrypted Private-State Backups. TOTP is required before backup ciphertext may be read or deleted. Account access or password reset restores ciphertext access only; the separate Recovery Kit remains necessary to decrypt it.
_Avoid_: Wallet identity, custodial wallet account, identity proof

**Backup Generation**:
A monotonically versioned Private-State Backup update. Only the current generation may be replaced; stale uploads are rejected and another device requires an explicit restore or handoff.
_Avoid_: Last-write-wins backup, automatic state merge, concurrent wallet state

**Backup Deletion**:
Removal of a Backup Account and its live ciphertext on participant request. Provider backup copies expire under the documented retention schedule, while public ledger activity cannot be deleted.
_Avoid_: Login disablement, immediate total erasure, ledger deletion

**Sponsored Fallback**:
The unchanged participant-authorized action offered through participant-funded DUST after a short Sponsor Service timeout or rejection, with the expected cost and reason shown before submission.
_Avoid_: Rebuilt transaction, endless sponsor retry, blocked action

**Recovery Kit**:
A mandatory downloadable artifact containing the participant-held material and instructions required to restore a Private-State Backup. Losing it may make private assets unusable, and support cannot replace it.
_Avoid_: Password reset, recovery email, support recovery

**Recovery Readiness Check**:
A successful local export-and-restore exercise that the interface requires before a participant's first contribution. Remote backup remains optional and never substitutes for proving that the participant can use the Recovery Kit.
_Avoid_: Download acknowledgement, optional first backup, email recovery test

**Retired Private State**:
Participant Private State from a replaced or reset Preprod network, preserved only as a read-only archive labeled with its former network and deployment. It may be exported for the participant's records but never imported into or interpreted as state for a replacement deployment.
_Avoid_: Migrated witness, reusable Preprod state, current backup

**Evidence Fixture**:
A five-wallet Preprod cohort in which four isolated setup wallets make documented qualifying contributions and the fifth wallet is visible in the primary Automated Preprod Journey. The fixture completes a real Prize Draw and the wallet actually selected by the contract performs the evidenced claim; the Operator never forces a preferred winner or retries randomness to obtain one.
_Avoid_: Seeded winner, synthetic cohort, hidden setup transaction

**Privacy-Safe Telemetry**:
Aggregate operational measurements that never collect wallet identifiers, commitments, nullifiers, backup object identifiers, witnesses, recovery secrets, complete transaction payloads, or IP-to-transaction correlations. Short-lived random correlation identifiers may be used only after redaction.
_Avoid_: Wallet analytics, transaction replay log, user tracing

**Supported Experience**:
The pinned desktop Chromium, Midnight wallet, network, and version combination for which the Operator publishes passing Automated Preprod Journey and Supported Wallet Journey evidence. Other browsers, mobile devices, and wallets remain unsupported until equivalent evidence exists.
_Avoid_: Compatible wallet, works in any browser
