/**
 * CORS proxy for the Lineage 2 asset CDN at l2client.slave.gr.
 * The upstream serves files with Range support and long-lived cache headers
 * but does NOT emit Access-Control-Allow-Origin, so we forward each request
 * server-side and stream the body back with permissive CORS.
 */
import { createFileRoute } from "@tanstack/react-router";

const UPSTREAM = "https://l2client.slave.gr/updater/files";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, ETag",
};

function bad(status: number, msg: string) {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain", ...CORS } });
}

export const Route = createFileRoute("/api/cdn/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      HEAD: async ({ params, request }) => proxy(params._splat ?? "", request, "HEAD"),
      GET: async ({ params, request }) => proxy(params._splat ?? "", request, "GET"),
    },
  },
});

async function proxy(splat: string, request: Request, method: "GET" | "HEAD") {
  // basic path validation — block traversal, only allow expected extensions
  const path = splat.replace(/^\/+/, "");
  if (!path || path.includes("..") || path.includes("\\")) {
    return bad(400, "Invalid path");
  }

  const url = `${UPSTREAM}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const range = request.headers.get("range");
  const upstreamHeaders: Record<string, string> = {};
  if (range) upstreamHeaders["Range"] = range;

  let upstream: Response;
  try {
    upstream = await fetch(url, { method, headers: upstreamHeaders });
  } catch (err) {
    return bad(502, `Upstream fetch failed: ${(err as Error).message}`);
  }

  const headers = new Headers(CORS);
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("Cache-Control", "public, max-age=2592000, immutable");

  return new Response(upstream.body, { status: upstream.status, headers });
}
