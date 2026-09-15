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
  if (typeof record.qualificationCost === "string" && /^\d+$/.test(record.qualificationCost)) return { ...record, qualificationCost: BigInt(record.qualificationCost) };
  if (typeof record.qualificationCost === "number" && Number.isSafeInteger(record.qualificationCost)) return { ...record, qualificationCost: BigInt(record.qualificationCost) };
  return body;
}

function json(value: unknown, status: number): Response { return new Response(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
