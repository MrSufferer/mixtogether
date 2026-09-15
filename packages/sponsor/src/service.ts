export type SponsorOperation = "add-dust" | "finalize" | "submit";
export type SponsoredTransaction = Readonly<{ idempotencyKey: string; operation: SponsorOperation; transactionId: string; dustAdded: bigint; submitted: boolean; finalized: boolean }>;
export type SponsorRequest = Readonly<{ idempotencyKey: string; operation: SponsorOperation; transaction: string; participantProof: string; valueBalanced: boolean; signature: string; binding: { environment: "preprod"; deploymentId: string; accountId: string }; qualificationCost: bigint }>;
export type SponsorResult = Readonly<{ ok: true; transaction: SponsoredTransaction } | { ok: false; code: "UNAUTHORIZED" | "INVALID_TRANSACTION" | "POLICY_REJECTED" | "QUOTA_EXCEEDED" | "TIMEOUT" | "UPSTREAM_REJECTED"; message: string; retryable: boolean; fallback: "participant-funded-dust" }>;

export type SponsorServiceOptions = Readonly<{ timeoutMs?: number; accountQuota?: number; globalQuota?: number; maxObservedQualificationCost?: bigint; now?: () => number; authenticate?: (token: string) => Promise<{ accountId: string } | null>; submit?: (request: SponsorRequest, dustCap: bigint) => Promise<{ submitted: boolean; finalized: boolean }> }>;

type Usage = { timestamps: number[] };

export class SponsorService {
  private readonly records = new Map<string, SponsoredTransaction>();
  private readonly accountUsage = new Map<string, Usage>();
  private readonly globalUsage: number[] = [];
  private readonly options: Required<Pick<SponsorServiceOptions, "timeoutMs" | "accountQuota" | "globalQuota" | "maxObservedQualificationCost" | "now" | "authenticate" | "submit">>;
  public constructor(options: SponsorServiceOptions = {}) {
    // A real Backup Account verifier and submitter must be injected by the
    // Render deployment. Failing closed here prevents a local default from
    // accidentally becoming a production authentication mechanism.
    const timeoutMs = options.timeoutMs ?? 8_000;
    const accountQuota = options.accountQuota ?? 20;
    const globalQuota = options.globalQuota ?? 500;
    const maxObservedQualificationCost = options.maxObservedQualificationCost ?? 100n;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(accountQuota) || accountQuota <= 0 || !Number.isInteger(globalQuota) || globalQuota <= 0 || maxObservedQualificationCost < 0n) throw new Error("sponsor quotas, timeout, and DUST cost must be positive");
    this.options = { timeoutMs, accountQuota, globalQuota, maxObservedQualificationCost, now: options.now ?? (() => Date.now()), authenticate: options.authenticate ?? (async () => null), submit: options.submit ?? (async () => ({ submitted: true, finalized: true })) };
  }
  public dustCap(): bigint { return (this.options.maxObservedQualificationCost * 125n + 99n) / 100n; }
  public hotBalanceCap(): bigint { return this.dustCap() * BigInt(this.options.globalQuota) * 7n; }
  public async handle(token: string | undefined, request: unknown): Promise<SponsorResult> {
    let auth: { accountId: string } | null = null;
    try { auth = token ? await this.options.authenticate(token) : null; } catch { auth = null; }
    if (!auth) return { ok: false, code: "UNAUTHORIZED", message: "Backup Account AAL2 authentication is required", retryable: false, fallback: "participant-funded-dust" };
    if (!isRequest(request)) return { ok: false, code: "INVALID_TRANSACTION", message: "transaction payload is invalid", retryable: false, fallback: "participant-funded-dust" };
    if (request.binding.accountId !== auth.accountId || request.binding.environment !== "preprod") return { ok: false, code: "POLICY_REJECTED", message: "transaction binding is invalid", retryable: false, fallback: "participant-funded-dust" };
    const idempotencyId = `${auth.accountId}:${request.idempotencyKey}`;
    const prior = this.records.get(idempotencyId); if (prior) return { ok: true, transaction: prior };
    const policy = validatePolicy(request);
    if (policy) return { ok: false, code: "POLICY_REJECTED", message: policy, retryable: false, fallback: "participant-funded-dust" };
    if (request.qualificationCost < 0n || request.qualificationCost > this.dustCap()) return { ok: false, code: "POLICY_REJECTED", message: "qualification cost exceeds the frozen DUST cap", retryable: false, fallback: "participant-funded-dust" };
    const now = this.options.now();
    this.prune(now);
    const usage = this.accountUsage.get(auth.accountId) ?? { timestamps: [] };
    if (usage.timestamps.length >= this.options.accountQuota || this.globalUsage.length >= this.options.globalQuota) return { ok: false, code: "QUOTA_EXCEEDED", message: "sponsorship quota is exhausted", retryable: true, fallback: "participant-funded-dust" };
    let result: { submitted: boolean; finalized: boolean } | null;
    try { result = await withTimeout(this.options.submit(request, this.dustCap()), this.options.timeoutMs); }
    catch { return { ok: false, code: "UPSTREAM_REJECTED", message: "the network rejected the sponsored action", retryable: true, fallback: "participant-funded-dust" }; }
    if (!result) return { ok: false, code: "TIMEOUT", message: "sponsor timed out after eight seconds", retryable: true, fallback: "participant-funded-dust" };
    if (!result.submitted || !result.finalized) return { ok: false, code: "UPSTREAM_REJECTED", message: "the sponsored action did not reach finality", retryable: true, fallback: "participant-funded-dust" };
    const transaction: SponsoredTransaction = Object.freeze({ idempotencyKey: request.idempotencyKey, operation: request.operation, transactionId: request.idempotencyKey, dustAdded: request.operation === "add-dust" ? this.dustCap() : 0n, submitted: result.submitted, finalized: result.finalized });
    this.records.set(idempotencyId, transaction); usage.timestamps.push(now); this.accountUsage.set(auth.accountId, usage); this.globalUsage.push(now);
    return { ok: true, transaction };
  }
  public redactedLog(result: SponsorResult): Record<string, unknown> { return result.ok ? { ok: true, operation: result.transaction.operation, idempotencyKey: result.transaction.idempotencyKey, transactionId: result.transaction.transactionId } : { ok: false, code: result.code, retryable: result.retryable }; }
  private prune(now: number): void {
    const cutoff = now - 24 * 60 * 60 * 1000;
    for (const usage of this.accountUsage.values()) usage.timestamps = usage.timestamps.filter((time) => time > cutoff);
    // Account quota is rolling 24 hours; the global 500-action budget is a
    // UTC-calendar-day budget and therefore resets at midnight UTC.
    const day = new Date(now).toISOString().slice(0, 10);
    while (this.globalUsage[0] !== undefined && new Date(this.globalUsage[0]).toISOString().slice(0, 10) !== day) this.globalUsage.shift();
  }
}

function validatePolicy(request: SponsorRequest): string | null {
  if (!request.idempotencyKey || request.idempotencyKey.length > 128) return "idempotency key is required";
  if (!request.transaction.trim() || !request.participantProof.trim() || !request.signature.trim()) return "participant proof, signature, and transaction are required";
  if (!request.valueBalanced) return "transaction must be value-balanced";
  if (!["add-dust", "finalize", "submit"].includes(request.operation)) return "operation is not allowlisted";
  if (!request.binding.deploymentId.trim() || !request.binding.accountId.trim()) return "transaction binding is incomplete";
  try {
    const decoded: unknown = JSON.parse(request.transaction);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return "transaction is not a decodable object";
    const action = (decoded as Record<string, unknown>).action;
    if (action !== request.operation) return "decoded transaction action is not allowlisted";
    if ((decoded as Record<string, unknown>).valueBalanced === false) return "transaction must be value-balanced";
  } catch { return "transaction is not valid JSON"; }
  return null;
}

function isRequest(value: unknown): value is SponsorRequest { if (!value || typeof value !== "object") return false; const record = value as Record<string, unknown>; const binding = record.binding as Record<string, unknown> | null; return typeof record.idempotencyKey === "string" && typeof record.operation === "string" && typeof record.transaction === "string" && typeof record.participantProof === "string" && typeof record.signature === "string" && typeof record.valueBalanced === "boolean" && typeof record.qualificationCost === "bigint" && Boolean(binding) && typeof binding?.environment === "string" && typeof binding?.deploymentId === "string" && typeof binding?.accountId === "string"; }
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([promise, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); })]); } finally { if (timer) clearTimeout(timer); } }
