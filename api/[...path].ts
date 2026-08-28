import type { IncomingMessage, ServerResponse } from "node:http";

export const MANAGED_API_ORIGIN =
  process.env.SIXLORY_MANAGED_API_ORIGIN ??
  "https://6loryapp-pernhdey.manus.space";
const CANONICAL_VERCEL_HOST = "6lory.vercel.app";

export function getManagedApiUrl(requestPath: string) {
  const parsed = new URL(requestPath, "http://local-request.invalid");
  return new URL(`${parsed.pathname}${parsed.search}`, MANAGED_API_ORIGIN);
}

function hasBody(method: string | undefined) {
  return !["GET", "HEAD"].includes((method ?? "GET").toUpperCase());
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (!hasBody(req.method)) return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function copyRequestHeaders(req: IncomingMessage) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || key === "host" || key === "content-length" || key === "x-forwarded-host") continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  // The managed API decides the OAuth callback origin from this header. Vercel
  // may preserve an upstream Manus value, so always replace it with the host
  // the browser actually requested from the Vercel deployment.
  // This proxy always serves the canonical Vercel production surface. Do not
  // trust a host value rewritten by the managed upstream, otherwise OAuth can
  // generate a callback back to the Manus domain and fail with a TLS error.
  headers.set("x-forwarded-host", CANONICAL_VERCEL_HOST);
  return headers;
}

function copyResponseHeaders(response: Response, res: ServerResponse) {
  const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
  if (setCookies?.length) {
    res.setHeader("set-cookie", setCookies);
  }

  response.headers.forEach((value, key) => {
    if (["set-cookie", "content-encoding", "content-length", "transfer-encoding"].includes(key)) return;
    res.setHeader(key, value);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const requestPath = req.url ?? "/api";
    const target = getManagedApiUrl(requestPath);
    const body = await readRequestBody(req);
    const upstream = await fetch(target, {
      method: req.method ?? "GET",
      headers: copyRequestHeaders(req),
      body: body ? body.toString("utf8") : undefined,
      redirect: "manual",
    });

    copyResponseHeaders(upstream, res);
    res.statusCode = upstream.status;
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error("[Vercel API proxy] Managed API request failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "API sunucusuna ulaşılamıyor." }));
  }
}
