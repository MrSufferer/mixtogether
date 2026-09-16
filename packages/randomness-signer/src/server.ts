import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { handleRandomnessRequest } from "./http";
import { createRandomnessRuntimeFromEnvironment } from "./runtime";

const runtime = createRandomnessRuntimeFromEnvironment();
const port = Number.parseInt(process.env.PORT ?? "8787", 10);

const server = createServer(async (incoming: IncomingMessage, outgoing: ServerResponse) => {
  if (incoming.url === "/healthz" && incoming.method === "GET") {
    outgoing.writeHead(runtime.ready ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
    outgoing.end(JSON.stringify({ ok: runtime.ready, ready: runtime.ready, service: "shroudly-randomness-signer", environment: "preprod", missing: runtime.ready ? [] : ["provider configuration"] }));
    return;
  }
  let body: Buffer;
  try { body = await readBody(incoming); }
  catch { writeError(outgoing, 413, "request body is too large or unreadable"); return; }
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) if (typeof value === "string") headers.set(name, value);
  const request = new Request(`http://${incoming.headers.host ?? "localhost"}${incoming.url ?? "/"}`, { method: incoming.method ?? "GET", headers, body: incoming.method === "GET" || incoming.method === "HEAD" ? undefined : body.toString("utf8") });
  let response: Response;
  try { response = incoming.url === "/v1/randomness" ? await handleRandomnessRequest(request, runtime.service) : new Response(JSON.stringify({ ok: false, code: "POLICY_REJECTED", message: "unknown randomness endpoint", retryable: false }), { status: 404, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
  catch { writeError(outgoing, 503, "randomness service is unavailable"); return; }
  outgoing.writeHead(response.status, { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": response.headers.get("cache-control") ?? "no-store" });
  outgoing.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(port, "0.0.0.0", () => { process.stdout.write(`Shroudly randomness signer listening on ${port}\n`); });

function readBody(incoming: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    incoming.on("data", (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > 1_000_000) { settled = true; reject(new Error("request body too large")); incoming.destroy(); return; }
      chunks.push(chunk);
    });
    incoming.on("end", () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks)); } });
    incoming.on("error", (cause) => { if (!settled) { settled = true; reject(cause); } });
  });
}

function writeError(outgoing: ServerResponse, status: number, message: string): void { outgoing.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); outgoing.end(JSON.stringify({ ok: false, code: "UPSTREAM_REJECTED", message, retryable: true })); }
