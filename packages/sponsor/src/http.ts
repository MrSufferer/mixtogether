import { SponsorService } from "./service";

export async function handleSponsorRequest(request: Request, service = new SponsorService()): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, code: "POLICY_REJECTED", message: "POST is required", retryable: false, fallback: "participant-funded-dust" }, 405);
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  let body: unknown;
  try { body = await request.json(); } catch { return json({ ok: false, code: "INVALID_TRANSACTION", message: "request body is invalid JSON", retryable: false, fallback: "participant-funded-dust" }, 400); }
  const normalized = normalizeJsonBody(body);
  const result = await service.handle(token, normalized);
  return json(result, result.ok ? 200 : result.code === "UNAUTHORIZED" ? 401 : result.code === "TIMEOUT" ? 504 : 400);
}

function normalizeJsonBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = body as Record<string, unknown>;
  const qualificationCost = toBigInt(record.qualificationCost);
  const binding = record.binding && typeof record.binding === "object" ? record.binding as Record<string, unknown> : null;
  const bindingQualificationCost = binding ? toBigInt(binding.qualificationCost) : null;
  if (qualificationCost === null && bindingQualificationCost === null) return body;
  return {
    ...record,
    ...(qualificationCost === null ? {} : { qualificationCost }),
    ...(binding && bindingQualificationCost !== null ? { binding: { ...binding, qualificationCost: bindingQualificationCost } } : {}),
  };
}

function toBigInt(value: unknown): bigint | null {
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  return null;
}

function json(value: unknown, status: number): Response { return new Response(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
