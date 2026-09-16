# Prize Pool

The Prize Pool context describes the privacy-preserving savings product, the value participants retain, and the prizes funded without consuming that value.

## Language

**Prize-Savings Pool**:
A pool in which each participant's principal remains withdrawable while yield funds one or more prizes.
_Avoid_: Jackpot, lottery, betting pool

**Principal**:
The value a participant contributes and remains entitled to withdraw, independent of any prize outcome.
_Avoid_: Bet, stake, ticket price

**Prize**:
Value funded from pool yield and awarded through a Prize Draw without consuming participant principal.
_Avoid_: Jackpot

**Prize Draw**:
A bounded selection event that selects one eligible participant to receive the available Prize. Selection occurs only after weighting closes and the required randomness reveal period completes.
_Avoid_: Lottery, jackpot draw

**Time-Weighted Principal**:
The average Principal a participant holds throughout a Prize Draw, used to determine eligibility and selection weight. It accrues from confirmed contribution until confirmed withdrawal; weight already accrued during a draw remains valid without locking Principal.
_Avoid_: Snapshot balance, ticket count, stake weight

**Participant Private State**:
Secret witness material controlled by a participant and required to prove private actions; it is not public ledger state and is not recoverable by the Operator.
_Avoid_: Account record, server wallet state, operator escrow

**Private Participant Data**:
The participant's identity and linkages, individual balance and action amounts, selection weight, and winning identity. Public contract activity must not be described as hiding its own occurrence or timing.
_Avoid_: Anonymous transaction, invisible activity

**Public Pool State**:
The draw schedule and status, commitments and nullifiers, and other data needed to verify solvency, liveness, and valid settlement without exposing Private Participant Data. Exact aggregate Principal and Prize values are disclosed only at a draw boundary that meets the Disclosure Cohort; hiding commitments and proofs represent them at other times.
_Avoid_: Participant ledger, private balance index

**Disclosure Cohort**:
The minimum of five eligible commitments required before a draw may disclose exact aggregate values or select a winner. Commitments are not proof of five distinct people, so the interface must not describe this threshold as an anonymity guarantee. A draw below the threshold produces a Prize Rollover.
_Avoid_: Five users, guaranteed anonymity, identity threshold

**Test Principal Asset**:
A shielded, six-decimal, valueless Preprod asset with a maximum issuance of 10,000,000 units, issued only by a bounded faucet and used for both Principal and Simulated Yield. It is named `tMIX` and is never presented as NIGHT, a stablecoin, or a Mainnet asset.
_Avoid_: Test NIGHT, test stablecoin, production token

**Mainnet Principal Asset**:
A real-value shielded token selected only after its issuer, backing or redemption model, wallet support, legal treatment, and compatibility with an audited Production Yield Strategy pass the Mainnet Readiness Gate. No asset is selected by the Preprod implementation, and NIGHT is not treated as a private substitute because it is unshielded.
_Avoid_: Production `tMIX`, private NIGHT, configuration-only asset choice

**Faucet Claim**:
A fixed allocation of 1,000 `tMIX` obtained at most once per twenty-four-hour epoch under an unlinkable epoch nullifier and the global issuance cap. Dedicated automation uses a separate capped allocation. The limit is abuse resistance, not proof of one claim per person.
_Avoid_: Free balance, verified-user allowance, Sybil-proof claim

**Principal Reserve**:
Assets segregated to cover confirmed, withdrawable Principal exactly; they cannot fund Prizes, DUST, operating costs, or rounding differences.
_Avoid_: Pool treasury, available liquidity, Prize funds

**Prize Reserve**:
Assets segregated to cover claimable and rolled Prizes. On Preprod it starts with a 1,000,000 `tMIX` allocation and releases no more than 100 `tMIX` per completed draw interval as deterministic Simulated Yield through permissionless checkpoints; replenishment requires a public governance action and remains within maximum issuance.
_Avoid_: Principal surplus, operator balance, unbacked yield

**Contribution Bound**:
The per-participant Principal range accepted on Preprod: at least 1 `tMIX` and at most 1,000 `tMIX`. Mainnet bounds remain a launch-gated decision tied to the reviewed asset, strategy capacity, and Canary Launch.
_Avoid_: Wallet balance limit, universal production cap, ticket purchase

**Solvency Invariant**:
The requirement that controlled assets cover the complete Principal Reserve and Prize Reserve liabilities. A breach stops affected contributions and draws while preserving every demonstrably safe exit.
_Avoid_: Target collateralization, eventual backing, database balance

**Rounding Residue**:
Any indivisible unit left after deterministic flooring of weight or Prize calculations. Principal remains exact to six decimals and every residue becomes Prize Rollover rather than operator value.
_Avoid_: Protocol fee, treasury dust, client rounding

**Simulated Yield**:
Test-only value made available to exercise Prize behavior on Preprod; it is not investment return and makes no Mainnet yield claim.
_Avoid_: Production yield, return, APY

**Production Yield Strategy**:
An independently audited Midnight-native mechanism that returns yield in the Mainnet Principal Asset without placing participant Principal under operator custody. Mainnet contributions remain disabled until a specific strategy and its capacity are approved through the Mainnet Readiness Gate.
_Avoid_: Simulated Yield, operator-funded Prize, assumed APY

**Claim Window**:
The published bounded period in which a selected participant may privately prove entitlement to a Prize: sixty minutes on Preprod and thirty days on Mainnet.
_Avoid_: Operator grace period, discretionary deadline

**Winning Commitment**:
The public commitment selected by a Prize Draw. Its owner proves selection, membership, and ownership privately without publishing participant identity.
_Avoid_: Winner address, winning account

**Claim Nullifier**:
A public, single-use value produced by a valid private Prize claim to prevent the same Winning Commitment from claiming twice without revealing its owner.
_Avoid_: Winner identifier, claimant address

**Randomness Commit Cutoff**:
The last time a registered randomness contributor may commit to its secret: three minutes before a Preprod draw closes and twenty-four hours before a Mainnet draw closes.
_Avoid_: Seed submission time, flexible cutoff

**Randomness Reveal Window**:
The period beginning only after weighting closes in which committed contributors may reveal: five minutes on Preprod and twenty-four hours on Mainnet. After it closes, valid reveals are combined canonically and anyone may request finalization.
_Avoid_: Operator reveal time, rolling reveal

**Prize Rollover**:
A Prize carried into a future Prize Draw because the prior draw had no eligible participant or its Prize was not claimed within the Claim Window; it never becomes operator property.
_Avoid_: Forfeiture, operator recovery, treasury sweep
