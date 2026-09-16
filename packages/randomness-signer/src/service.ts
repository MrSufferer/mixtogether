import { createHash, timingSafeEqual } from "node:crypto";

export type RandomnessAction = "commit" | "reveal";
export type RandomnessIntent = Readonly<{
  format: "shroudly-randomness-intent-v1";
  action: RandomnessAction;
  environment: "preprod";
  deploymentId: string;
  drawId: string;
  contributor: string;
  credentialScope: string;
  commitment: string;
  reveal?: string;
  idempotencyKey: string;
}>;

export type FinalizedRandomnessSubmission = Readonly<{
  transactionId: string;
  networkFinalized: boolean;
  indexerVisible: boolean;
  ledgerConfirmed: boolean;
}>;

export type RandomnessTransaction = Readonly<{
  action: RandomnessAction;
  drawId: string;
  idempotencyKey: string;
  transactionId: string;
  networkFinalized: true;
  indexerVisible: true;
  ledgerConfirmed: true;
}>;

export type RandomnessResult =
  | Readonly<{ ok: true; transaction: RandomnessTransaction }>
  | Readonly<{
      ok: false;
      code: "UNAUTHORIZED" | "INVALID_INTENT" | "POLICY_REJECTED" | "TIMEOUT" | "UPSTREAM_REJECTED";
      message: string;
      retryable: boolean;
    }>;

export type RandomnessSignerOptions = Readonly<{
  deploymentId: string;
  contractId: string;
  contributor: string;
  ingressToken: string;
  timeoutMs?: number;
  now?: () => number;
  submit?: (intent: RandomnessIntent, contractId: string, signal?: AbortSignal) => Promise<FinalizedRandomnessSubmission>;
}>;

type StoredTransaction = Readonly<{ intentDigest: string; transaction: RandomnessTransaction }>;

const MAX_IDENTIFIER_LENGTH = 128;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const IDEMPOTENCY_KEY = /^0x[0-9a-fA-F]{32}$/;

/**
 * The Render process is a narrow ingress boundary. The provider-backed
 * submitter is injected by runtime.ts; this class never fabricates a receipt
 * or treats an intent hash as a transaction ID.
 */
export class RandomnessSignerService {
  private readonly records = new Map<string, StoredTransaction>();
  private readonly inFlight = new Map<string, { intentDigest: string; result: Promise<RandomnessResult> }>();
  private readonly uncertain = new Map<string, string>();
  private readonly options!: {
    deploymentId: string;
    contractId: string;
    contributor: string;
    ingressToken: string;
    timeoutMs: number;
    now: () => number;
    submit: NonNullable<RandomnessSignerOptions["submit"]>;
  };

  public constructor(options: RandomnessSignerOptions) {
    const timeoutMs = options.timeoutMs ?? 8_000;
    if (!options.deploymentId.trim() || !options.contractId.trim() || !options.contributor.trim() || !options.ingressToken.trim()) throw new Error("randomness signer configuration is incomplete");
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("randomness signer timeout must be positive");
    const configuration = {
      deploymentId: options.deploymentId.trim(),
      contractId: options.contractId.trim(),
      contributor: options.contributor.trim(),
      ingressToken: options.ingressToken,
      timeoutMs,
      now: options.now ?? (() => Date.now()),
      submit: options.submit ?? (async () => { throw new Error("randomness provider submitter is not configured"); }),
    };
    // The runtime object may be inspected by diagnostics. Keep ingress and
    // upstream credentials out of accidental JSON/log serialization.
    Object.defineProperty(this, "options", { value: Object.freeze(configuration), enumerable: false, writable: false, configurable: false });
  }

  public async handle(token: string | undefined, value: unknown): Promise<RandomnessResult> {
    if (!token || !sameSecret(token, this.options.ingressToken)) return failure("UNAUTHORIZED", "the contributor-scoped automation credential is invalid", false);
    if (!isIntent(value)) return failure("INVALID_INTENT", "randomness intent is invalid", false);

    const policyError = validatePolicy(value, this.options);
    if (policyError) return failure("POLICY_REJECTED", policyError, false);

    const intentDigest = digest(JSON.stringify(value));
    const prior = this.records.get(value.idempotencyKey);
    if (prior) {
      if (prior.intentDigest !== intentDigest) return failure("POLICY_REJECTED", "idempotency key was reused for a different intent", false);
      return { ok: true, transaction: prior.transaction };
    }

    const uncertainDigest = this.uncertain.get(value.idempotencyKey);
    if (uncertainDigest) {
      if (uncertainDigest !== intentDigest) return failure("POLICY_REJECTED", "idempotency key was reused for a different intent", false);
      return failure("TIMEOUT", "the randomness submission outcome is still being reconciled; do not retry this intent", false);
    }

    const pending = this.inFlight.get(value.idempotencyKey);
    if (pending) {
      if (pending.intentDigest !== intentDigest) return failure("POLICY_REJECTED", "idempotency key was reused for a different intent", false);
      return pending.result;
    }

    const result = this.submitIntent(value, intentDigest);
    this.inFlight.set(value.idempotencyKey, { intentDigest, result });
    try { return await result; }
    finally {
      if (this.inFlight.get(value.idempotencyKey)?.result === result) this.inFlight.delete(value.idempotencyKey);
    }
  }

  private async submitIntent(intent: RandomnessIntent, intentDigest: string): Promise<RandomnessResult> {
    const controller = new AbortController();
    let submission: Promise<FinalizedRandomnessSubmission>;
    try { submission = Promise.resolve(this.options.submit(intent, this.options.contractId, controller.signal)); }
    catch { return failure("UPSTREAM_REJECTED", "the randomness provider rejected the intent", true); }

    let result: FinalizedRandomnessSubmission | null;
    try { result = await withTimeout(submission, this.options.timeoutMs); }
    catch {
      controller.abort();
      this.uncertain.set(intent.idempotencyKey, intentDigest);
      return failure("UPSTREAM_REJECTED", "the randomness provider outcome is being reconciled", true);
    }
    if (!result) {
      controller.abort();
      this.uncertain.set(intent.idempotencyKey, intentDigest);
      void submission.then(
        (lateResult) => {
          if (this.uncertain.get(intent.idempotencyKey) !== intentDigest || !hasIndependentFinality(lateResult)) return;
          this.records.set(intent.idempotencyKey, { intentDigest, transaction: toTransaction(intent, lateResult) });
          this.uncertain.delete(intent.idempotencyKey);
        },
        () => undefined,
      );
      return failure("TIMEOUT", `randomness provider timed out after ${this.options.timeoutMs} milliseconds; the intent is being reconciled`, false);
    }
    if (!hasIndependentFinality(result)) return failure("UPSTREAM_REJECTED", "the randomness provider did not produce independently observed finality", true);

    const transaction = toTransaction(intent, result);
    this.records.set(intent.idempotencyKey, { intentDigest, transaction });
    return { ok: true, transaction };
  }
}

export function isRandomnessIntent(value: unknown): value is RandomnessIntent { return isIntent(value); }

function validatePolicy(intent: RandomnessIntent, options: RandomnessSignerService["options"]): string | null {
  if (intent.environment !== "preprod") return "randomness intent must target Preprod";
  if (intent.deploymentId !== options.deploymentId) return "randomness deployment binding is invalid";
  if (intent.contributor !== options.contributor || intent.credentialScope !== options.contributor) return "randomness contributor binding is invalid";
  if (intent.action === "commit" && intent.reveal !== undefined) return "commit intents cannot contain a reveal";
  if (intent.action === "reveal" && !intent.reveal) return "reveal intents require a reveal value";
  if (!HEX32.test(intent.commitment) || (intent.reveal !== undefined && !HEX32.test(intent.reveal))) return "commitment and reveal values must be 32-byte hex values";
  if (!IDEMPOTENCY_KEY.test(intent.idempotencyKey)) return "idempotency key is invalid";
  return null;
}

function isIntent(value: unknown): value is RandomnessIntent {
  if (!isRecord(value)) return false;
  if (value.format !== "shroudly-randomness-intent-v1" || (value.action !== "commit" && value.action !== "reveal") || value.environment !== "preprod") return false;
  const strings = ["deploymentId", "drawId", "contributor", "credentialScope", "commitment", "idempotencyKey"];
  if (strings.some((name) => typeof value[name] !== "string" || !(value[name] as string).trim() || (value[name] as string).length > MAX_IDENTIFIER_LENGTH)) return false;
  if (value.reveal !== undefined && (typeof value.reveal !== "string" || !value.reveal.trim() || value.reveal.length > MAX_IDENTIFIER_LENGTH)) return false;
  return true;
}

function toTransaction(intent: RandomnessIntent, result: FinalizedRandomnessSubmission): RandomnessTransaction {
  return Object.freeze({ action: intent.action, drawId: intent.drawId, idempotencyKey: intent.idempotencyKey, transactionId: result.transactionId, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true });
}

function hasIndependentFinality(value: unknown): value is FinalizedRandomnessSubmission {
  return isRecord(value) && typeof value.transactionId === "string" && HEX32.test(value.transactionId) && value.networkFinalized === true && value.indexerVisible === true && value.ledgerConfirmed === true;
}

function sameSecret(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function failure(code: Exclude<RandomnessResult, { ok: true }>["code"], message: string, retryable: boolean): RandomnessResult { return { ok: false, code, message, retryable }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([promise, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); })]); } finally { if (timer) clearTimeout(timer); } }
