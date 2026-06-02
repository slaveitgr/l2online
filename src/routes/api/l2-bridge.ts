/**
 * WebSocket ↔ raw TCP bridge for the Lineage 2 login/game protocol.
 *
 * The browser cannot open arbitrary TCP sockets, so it opens a WebSocket to
 * this route which then connects to `host:port` using Cloudflare Workers'
 * `connect()` API. Every WS binary frame is forwarded verbatim to the TCP
 * socket and vice versa.
 *
 * Security: only hosts on the allowlist + a small port range (login + game
 * server ports for slave.gr) are allowed, so this cannot be abused as an
 * open proxy.
 */
import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_HOSTS = new Set(["l2server.slave.gr"]);
// L2 login: 2106 (default). Game servers: 7777..7788 (common range).
const ALLOWED_PORTS = new Set<number>([2106, 7777, 7778, 7779, 7780, 7781, 7782, 7783, 7784, 7785]);

function bad(status: number, msg: string) {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain" } });
}

export const Route = createFileRoute("/api/l2-bridge")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (request.headers.get("Upgrade") !== "websocket") {
          return bad(426, "Upgrade to WebSocket required");
        }
        const url = new URL(request.url);
        const host = url.searchParams.get("host") ?? "";
        const port = Number(url.searchParams.get("port") ?? "0");
        if (!ALLOWED_HOSTS.has(host)) return bad(403, `Host not allowed: ${host}`);
        if (!ALLOWED_PORTS.has(port)) return bad(403, `Port not allowed: ${port}`);

        // Dynamic import — `cloudflare:sockets` only exists in the Worker runtime.
        type TcpSocket = {
          readable: ReadableStream<Uint8Array>;
          writable: WritableStream<Uint8Array>;
          close(): Promise<void>;
          closed: Promise<void>;
        };
        let connect: (opts: { hostname: string; port: number }) => TcpSocket;
        try {
          // Build specifier at runtime so Rollup cannot statically analyze it.
          const spec = "cloudflare:" + "sockets";
          // @ts-expect-error cloudflare:sockets is provided by the Workers runtime
          const mod = await import(/* @vite-ignore */ spec);
          connect = mod.connect as typeof connect;
        } catch (err) {
          return bad(500, `Raw TCP not available in this runtime: ${(err as Error).message}`);
        }

        // @ts-expect-error WebSocketPair is a Cloudflare Workers global
        const pair = new WebSocketPair();
        const client = pair[0] as WebSocket;
        const server = pair[1] as WebSocket & { accept(): void };
        server.accept();

        let tcp: ReturnType<typeof connect> | null = null;
        let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
        let closed = false;

        const closeAll = (code = 1000, reason = "closed") => {
          if (closed) return;
          closed = true;
          try { server.close(code, reason); } catch {}
          try { writer?.close().catch(() => {}); } catch {}
          try { tcp?.close().catch(() => {}); } catch {}
        };

        try {
          tcp = connect({ hostname: host, port });
          writer = tcp.writable.getWriter();
        } catch (err) {
          server.send(JSON.stringify({ type: "error", error: `TCP connect failed: ${(err as Error).message}` }));
          closeAll(1011, "tcp-connect-failed");
          return new Response(null, { status: 101, webSocket: client } as ResponseInit);
        }

        // TCP → WS
        (async () => {
          const reader = tcp!.readable.getReader();
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value && value.byteLength > 0 && !closed) {
                // Copy into a fresh ArrayBuffer to satisfy WebSocket.send typing.
                const ab = new ArrayBuffer(value.byteLength);
                new Uint8Array(ab).set(value);
                server.send(ab);
              }
            }
          } catch (err) {
            try { server.send(JSON.stringify({ type: "error", error: `tcp-read: ${(err as Error).message}` })); } catch {}
          } finally {
            closeAll(1000, "tcp-eof");
          }
        })();

        // WS → TCP
        server.addEventListener("message", async (ev: MessageEvent) => {
          if (closed || !writer) return;
          const data = ev.data;
          let bytes: Uint8Array | null = null;
          if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
          else if (data instanceof Uint8Array) bytes = data;
          else if (typeof data === "string") {
            // control messages from the client (e.g. ping)
            try {
              const msg = JSON.parse(data);
              if (msg?.type === "ping") server.send(JSON.stringify({ type: "pong", t: Date.now() }));
            } catch { /* ignore */ }
            return;
          }
          if (!bytes) return;
          try {
            await writer.write(bytes);
          } catch (err) {
            try { server.send(JSON.stringify({ type: "error", error: `tcp-write: ${(err as Error).message}` })); } catch {}
            closeAll(1011, "tcp-write-failed");
          }
        });

        server.addEventListener("close", () => closeAll(1000, "ws-close"));
        server.addEventListener("error", () => closeAll(1011, "ws-error"));

        // Tell the client we're connected.
        server.send(JSON.stringify({ type: "connected", host, port }));

        return new Response(null, { status: 101, webSocket: client } as ResponseInit);
      },
    },
  },
});
