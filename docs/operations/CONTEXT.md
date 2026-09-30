# Release Operations

The Release Operations context defines which environment is being released, what claims may be made about it, and who is accountable for operating it.

## Language

**Preprod Release**:
A publicly accessible release connected to Midnight Preprod that uses test assets and may be reset. Contract and indexer health checks run every five minutes. Its existing configuration remains published after a network reset until the Operator repairs it, but detected failures disable submissions and display an outage; during that interval it is not valid evidence of system behavior or a real-value production launch.
_Avoid_: Production, Mainnet launch

**Legacy Release**:
The existing public-chain contract and immutable Vercel preview, retained only
as noncanonical historical test artifacts. Their source history and disclosures
move under `docs/legacy`, they receive no new product features, and no active
Shroudly build or dependency graph includes the retired client libraries or
contracts.
_Avoid_: Shroudly fallback, supported network, dual-stack release

**Mainnet Launch**:
A release connected to Midnight Mainnet that may handle assets with real value and has passed the required security and operational gates.
_Avoid_: Preprod release, demo

**Mainnet Readiness Gate**:
The blocking review that names a supported shielded Mainnet Principal Asset and audited Production Yield Strategy, qualifies independently operated randomness, establishes independent three-of-five timelocked governance and separate emergency custody, resolves independent security findings and legal approval, verifies paid production services, removes deployer authority, and sets the Canary Launch cap. Preprod behavior cannot waive any part of it.
_Avoid_: Production checklist, environment switch, successful Preprod evidence

**Implementation Completion**:
A production-operated Shroudly Preprod Release with genuine Finalized Transaction Evidence, reproducible Playwright artifacts, and a complete maintainer runbook, plus a fail-closed Mainnet build and deployment procedure. Completion does not mean that Mainnet is deployed or permitted to accept value before the Mainnet Readiness Gate passes.
_Avoid_: Mainnet launch, mock-complete, documentation-only handoff

**Human Gate**:
A credential, account, billing, DNS, legal, security-review, asset, strategy, or independent-custodian action that only the maintainer or another accountable human can complete. It is tracked as a `ready-for-human` GitHub issue containing variable names, validation steps, and expected evidence but no secret values.
_Avoid_: Agent blocker, placeholder credential, secret-sharing request

**Operator**:
The named maintainer accountable for personally owned GitHub and hosting accounts, billing, operational access, and assignment of authority credentials. The personal accounts use ordinary password-plus-authenticator security. Personal control-plane ownership and common control of Preprod threshold keys are explicit continuity and trust risks.
_Avoid_: Agent, anonymous admin, on-chain super-user

**Temporary Deployer Authority**:
A privileged deployment credential intentionally retained for no more than twenty-four hours after a Preprod Release becomes available and then removed by a manual maintainer action. While present it may transfer defined roles, edit non-economic metadata and allowlists, and invoke Circuit-Scoped Pause, but it cannot withdraw or settle value, select a winner, replace economic dependencies, or mint discretionary assets. A Mainnet deployment cannot accept contributions until removal is finalized, and the interface discloses the exact remaining powers.
_Avoid_: Trustless deployment, renounced owner, completed handoff

**Preprod Threshold Set**:
Distinct governance or randomness keys stored in isolated environments but all controlled by the Operator. Randomness uses one protected GitHub Actions key, one Render-held key, and one offline CLI recovery key; governance and emergency keys use separately encrypted offline stores. Threshold execution protects against one-key or one-service loss but does not provide independent-human approval or randomness trust.
_Avoid_: Independent custodians, decentralized threshold, separate operators

**Sponsored Action**:
A bounded participant action whose DUST cost is paid by the Operator; a participant-funded DUST path remains available when sponsorship is unavailable or exhausted.
_Avoid_: Free transaction, gasless transaction

**Sponsor Service**:
A stateless online service that validates the Sponsorship Policy and may attach DUST with a capped hot credential. It has no Principal, Prize, governance, emergency, or randomness authority. A short timeout or rejection returns the unchanged action to the participant-funded DUST path rather than blocking it.
_Avoid_: Relayer wallet, admin backend, custody service

**Automation Service**:
An unprivileged caller that observes public deadlines and requests permitted draw or maintenance actions. It runs through scheduled or manually dispatched GitHub Actions on Preprod and an always-on paid Render worker on Mainnet. Correctness cannot depend on it being the only caller.
_Avoid_: Settlement authority, draw operator, trusted worker

**Operational Data Store**:
Supabase storage for sponsorship quotas, automation jobs, Backup Accounts, and client-encrypted backup blobs. Schema migrations and row-level security deny public access to quotas and jobs and narrowly authorize backup operations. Rows never authorize or reconstruct Principal, eligibility, or settlement; loss or compromise cannot move Principal or change a Prize outcome.
_Avoid_: Participant ledger, contract database, wallet database

**Governance Authority**:
A threshold-controlled authority that may perform expressly permitted maintenance after the applicable delay; it cannot redefine participant Principal or a completed Prize outcome.
_Avoid_: Admin wallet, owner key, operator account

**Emergency Authority**:
A separately held threshold authority that may pause unsafe actions but cannot withdraw or redirect value, alter balances, or choose a Prize outcome.
_Avoid_: Super-admin, recovery wallet

**Evidence Bundle**:
A versioned, sanitized set of records that ties the five qualifying Evidence Fixture contributions, its Prize Draw, the actual selected wallet's Prize claim, and one minimal finalized Lace transaction to the source revision, deployed contract, finalized network transactions, and reproducible browser artifacts without containing credentials or Participant Private State. One participant carries the detailed automated browser narrative; the other setup transactions remain documented prerequisites. Adversarial cases may remain local test evidence rather than public Preprod transaction evidence.
_Avoid_: Screenshot proof, transaction list, demo recording

**Release Artifact Set**:
The source tag and compiled contract, proof, and web artifacts whose hashes passed Preprod review. Mainnet rebuilds or deploys only these reviewed inputs under a separate environment configuration and never copies Preprod keys, balances, database rows, or Participant Private State.
_Avoid_: Latest branch, copied Preprod deployment, mutable release

**Hosting Configuration**:
The Vercel project environment variables treated as the canonical network, contract, dependency, and Compatibility Profile configuration for a deployment. They are mutable personal-account state rather than a signed release record; an Evidence Bundle can only snapshot the values observed for its tested build.
_Avoid_: Signed manifest, immutable configuration, repository source of truth

**Configuration Snapshot**:
A sanitized build-time endpoint and Evidence Bundle record that expose non-secret Hosting Configuration for comparison with the current Vercel project variables. Any canonical variable change requires a new deployment and fresh release evidence before claims about the prior build may be reused.
_Avoid_: Secret dump, configuration authority, mutable build metadata

**Local Credential File**:
A usable, maintainer-populated `.env.production.local` inside the working copy that is excluded from Git and restricted to the local account. Deployment procedures transfer its values into provider secret stores without printing them. The repository contains only placeholder names in `.env.example`; credentials never appear in commits, issues, documentation, logs, or Evidence Bundles.
_Avoid_: Committed `.env`, example secret, evidence attachment, shared plaintext

**Environment-Locked Deployment**:
A separate Vercel project and domain whose network and contract settings are fixed at build time and visibly labeled as Preprod or Mainnet. The deployed interface offers no runtime network switch.
_Avoid_: Network toggle, shared deployment, browser-selected network

**Service Objective**:
The Mainnet operating target: ledger-backed financial truth has no off-chain recovery point, operational data has a twenty-four-hour recovery point, web and sponsorship recover within four hours, critical alerts fire within fifteen minutes, and paid services target 99.9% monthly availability.
_Avoid_: Best effort, guaranteed uptime, five-nines promise

**Public Incident**:
An operational or safety event communicated through a status page and in-product banner under a severity matrix, update cadence, resolution notice, and post-incident review. Financial-safety alerts have a fifteen-minute acknowledgement target.
_Avoid_: Private outage, delayed repository note, silent pause

**Finalized Transaction Evidence**:
A transaction record for which the pinned network reports finality, the indexer returns the transaction, and a fresh ledger query confirms the expected state. Submission identifiers and fixed-duration waits are not finality evidence.
_Avoid_: Submitted transaction, sleep-based confirmation, fabricated receipt

**Compatibility Profile**:
The exact compiler, Compact runtime, ledger library, Midnight.js, wallet connector, proof provider, indexer, and network versions qualified together for a release. Compilation with required keys, compatibility checks, endpoint health, and a real-network smoke journey are release gates.
_Avoid_: Latest version, compatible range, manually checked stack

**Sponsorship Policy**:
The public rules that restrict Sponsored Actions by network, contract, circuit, cost, lifetime, and quota while preserving a participant-funded DUST fallback. On Preprod, quota history is associated with the participant's email-linked Backup Account; this deliberate correlation and its privacy consequence are disclosed before enrollment.
_Avoid_: Unlimited faucet, trusted transaction, user authorization

**Authentication Mail Service**:
Resend SMTP configured on a dedicated authentication subdomain with SPF, DKIM, and DMARC for Backup Account verification, password recovery, and security notices. Preprod may use Resend's free allowance; Mainnet requires a paid production plan and operational ownership by the Operator.
_Avoid_: Supabase demo SMTP, personal mailbox sender, unverified domain

**Monitoring Service**:
Better Stack monitors, heartbeats, status-page updates, and redacted operational logs. Preprod may use the free personal tier; Mainnet requires the paid responder and retention capabilities needed to meet the Service Objective.
_Avoid_: Financial ledger, participant analytics, unredacted transaction log

**Canary Launch**:
A thirty-day Mainnet Launch phase whose total value cap is the lesser of one percent of the independently audited strategy capacity and the approved nominal asset limit. The cap may increase only after at least four completed draws, no unresolved critical incident, and the applicable Governance Authority delay.
_Avoid_: Beta flag, soft launch, unrestricted production

**Circuit-Scoped Pause**:
A bounded emergency state that disables only affected contribution, draw, sponsorship, yield, or maintenance actions while preserving withdrawals and already-valid Prize claims. A full settlement pause requires a demonstrated settlement defect and expires unless Governance Authority renews it.
_Avoid_: Maintenance mode, indefinite global freeze, admin shutdown

**Mainnet Security Review**:
Independent review of the Compact and zero-knowledge design, economics, web-wallet boundary, Sponsor Service, and operations before a Mainnet Launch. Every finding must be resolved or explicitly accepted before the launch gate passes.
_Avoid_: Internal QA, canary testing, informal audit
