import { RandomnessSignerService } from "./service.ts";

export async function handleRandomnessRequest(request: Request, service = new RandomnessSignerService({ deploymentId: "not-ready", contractId: "not-ready", contributor: "render", ingressToken: "not-ready" })): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, code: "POLICY_REJECTED", message: "POST is required", retryable: false }, 405);
  const authorization = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+\S+$/.test(authorization) ? authorization.slice(7).trim() : undefined;
  let body: unknown;
  try { body = await request.json(); } catch { return json({ ok: false, code: "INVALID_INTENT", message: "request body is invalid JSON", retryable: false }, 400); }
  let result;
  try { result = await service.handle(token, body); }
  catch { return json({ ok: false, code: "UPSTREAM_REJECTED", message: "randomness service is unavailable", retryable: true }, 503); }
  return json(result, result.ok ? 200 : result.code === "UNAUTHORIZED" ? 401 : result.code === "TIMEOUT" ? 504 : 400);
}

function json(value: unknown, status: number): Response { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
