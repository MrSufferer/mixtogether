import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { handleSponsorRequest } from "./http";
import { SponsorService } from "./service";

/**
 * Minimal Render HTTP entrypoint. Provider-backed authentication and submit
 * functions are injected by the deployment wrapper; this default remains
 * fail-closed and is useful for health checks only.
 */
const service = new SponsorService();
const port = Number.parseInt(process.env.PORT ?? "8787", 10);

const server = createServer(async (incoming: IncomingMessage, outgoing: ServerResponse) => {
  if (incoming.url === "/healthz" && incoming.method === "GET") {
    outgoing.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    outgoing.end(JSON.stringify({ ok: true, service: "shroudly-sponsor", environment: "preprod" }));
    return;
  }
  const body = await readBody(incoming);
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) if (typeof value === "string") headers.set(name, value);
  const request = new Request(`http://${incoming.headers.host ?? "localhost"}${incoming.url ?? "/"}`, { method: incoming.method ?? "GET", headers, body: incoming.method === "GET" || incoming.method === "HEAD" ? undefined : body.toString("utf8") });
  const response = await handleSponsorRequest(request, service);
  outgoing.writeHead(response.status, { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": response.headers.get("cache-control") ?? "no-store" });
  outgoing.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(port, "0.0.0.0", () => { process.stdout.write(`Shroudly sponsor listening on ${port}\n`); });

function readBody(incoming: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    incoming.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 1_000_000) { reject(new Error("request body too large")); incoming.destroy(); return; } chunks.push(chunk); });
    incoming.on("end", () => resolve(Buffer.concat(chunks)));
    incoming.on("error", reject);
  });
}
