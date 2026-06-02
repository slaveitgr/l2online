import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  clearCache,
  formatBytes,
  getCacheStats,
  prefetchFolders,
  type CacheStats,
  type PrefetchProgress,
} from "@/lib/l2-assets";
import { loadManifest, summarizeFolders, type FolderSummary, type ManifestFile } from "@/lib/cdn-manifest";

interface RangeTestResult {
  file: string;
  size: number;
  head: {
    status: number;
    contentLength: string | null;
    acceptRanges: string | null;
    cors: string | null;
    ok: boolean;
  };
  range: {
    status: number;
    contentRange: string | null;
    bytesReceived: number;
    expectedBytes: number;
    cors: string | null;
    ok: boolean;
  };
  durationMs: number;
}

async function runRangeTest(file: ManifestFile): Promise<RangeTestResult> {
  const url = `/api/cdn/${file.path}`;
  const t0 = performance.now();

  const head = await fetch(url, { method: "HEAD" });
  const expectedBytes = Math.min(1024, file.size);
  const rangeEnd = expectedBytes - 1;
  const range = await fetch(url, { headers: { Range: `bytes=0-${rangeEnd}` } });
  const buf = await range.arrayBuffer();

  return {
    file: file.path,
    size: file.size,
    head: {
      status: head.status,
      contentLength: head.headers.get("content-length"),
      acceptRanges: head.headers.get("accept-ranges"),
      cors: head.headers.get("access-control-allow-origin"),
      ok: head.ok && head.headers.get("accept-ranges") === "bytes",
    },
    range: {
      status: range.status,
      contentRange: range.headers.get("content-range"),
      bytesReceived: buf.byteLength,
      expectedBytes,
      cors: range.headers.get("access-control-allow-origin"),
      ok: range.status === 206 && buf.byteLength === expectedBytes,
    },
    durationMs: Math.round(performance.now() - t0),
  };
}

export const Route = createFileRoute("/cdn-cache")({
  head: () => ({
    meta: [
      { title: "Asset Distribution — Lineage II Web Client" },
      { name: "description", content: "Stream Lineage 2 client assets on demand from the CDN." },
    ],
  }),
  component: CdnCachePage,
});

const ESSENTIALS = ["system", "Maps"];

function CdnCachePage() {
  const navigate = useNavigate();
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<PrefetchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [rangeTests, setRangeTests] = useState<RangeTestResult[]>([]);
  const [rangeTesting, setRangeTesting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function onRangeTest() {
    setRangeTesting(true);
    setError(null);
    try {
      const m = await loadManifest();
      // pick first .ukx and first .utx, plus a small system file as control
      const ukx = m.files.find((f) => f.path.toLowerCase().endsWith(".ukx") && f.size > 100_000);
      const utx = m.files.find((f) => f.path.toLowerCase().endsWith(".utx") && f.size > 100_000);
      const sys = m.files.find((f) => f.path.toLowerCase().startsWith("system/") && f.size > 1024);
      const targets = [ukx, utx, sys].filter(Boolean) as ManifestFile[];
      const results: RangeTestResult[] = [];
      for (const f of targets) {
        try {
          results.push(await runRangeTest(f));
        } catch (e) {
          results.push({
            file: f.path, size: f.size, durationMs: 0,
            head: { status: 0, contentLength: null, acceptRanges: null, cors: null, ok: false },
            range: { status: 0, contentRange: null, bytesReceived: 0, expectedBytes: 0, cors: null, ok: false },
          });
          console.error("Range test failed", f.path, e);
        }
      }
      setRangeTests(results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRangeTesting(false);
    }
  }


  async function refreshAll() {
    try {
      const m = await loadManifest();
      setFolders(summarizeFolders(m));
      setStats(await getCacheStats());
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        setStorage({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  async function runPrefetch(targets: string[]) {
    setError(null);
    setBusy(true);
    setProgress(null);
    abortRef.current = new AbortController();
    try {
      await prefetchFolders(targets, setProgress, { signal: abortRef.current.signal, concurrency: 6 });
      await refreshAll();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function onClear() {
    await clearCache();
    await refreshAll();
  }

  const cachedPct = stats ? (stats.cachedBytes / stats.totalBytes) * 100 : 0;
  const progressPct = progress ? (progress.bytesDone / Math.max(1, progress.bytesTotal)) * 100 : 0;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 px-6 py-3 flex items-center justify-between backdrop-blur">
        <div className="flex items-center gap-3">
          <Link to="/" className="w-8 h-8 rounded-sm bg-gradient-to-br from-primary to-blood flex items-center justify-center font-display text-primary-foreground font-bold">L</Link>
          <div>
            <h1 className="font-display text-gold text-lg leading-none tracking-widest">ASSET DISTRIBUTION</h1>
            <p className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">CDN streaming · slave.gr</p>
          </div>
        </div>
        <Link to="/select-files" className="text-xs text-muted-foreground hover:text-gold transition-colors font-mono">
          Upload local folder instead →
        </Link>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-6 space-y-6">
        {/* Overall stats */}
        <section className="panel p-6 rounded">
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-[10px] text-muted-foreground font-mono tracking-[0.3em] uppercase">Cache</p>
              <p className="font-display text-3xl text-gold mt-1">
                {stats ? formatBytes(stats.cachedBytes) : "—"}{" "}
                <span className="text-foreground/40 text-xl">/ {stats ? formatBytes(stats.totalBytes) : "—"}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                {stats ? `${stats.cachedFiles.toLocaleString()} / ${stats.totalFiles.toLocaleString()} files` : ""}
              </p>
            </div>
            <div className="text-right">
              {storage && (
                <p className="text-xs text-muted-foreground font-mono">
                  Browser storage: {formatBytes(storage.usage)} used · {formatBytes(storage.quota)} quota
                </p>
              )}
            </div>
          </div>
          <div className="h-2 bg-input rounded overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-gold transition-all"
              style={{ width: `${cachedPct.toFixed(2)}%` }}
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => runPrefetch(ESSENTIALS)}
              disabled={busy}
              className="bg-gradient-to-b from-primary to-gold-muted text-primary-foreground font-display tracking-[0.2em] px-5 py-2.5 rounded border border-gold/40 hover:brightness-110 transition-all shadow disabled:opacity-50"
            >
              PREFETCH ESSENTIALS (~3.6 GB)
            </button>
            <button
              onClick={() => navigate({ to: "/characters" })}
              disabled={!stats || stats.cachedFiles === 0}
              className="border border-border hover:border-gold text-foreground/80 hover:text-gold font-display tracking-[0.2em] px-5 py-2.5 rounded transition-colors disabled:opacity-30"
            >
              ENTER WORLD →
            </button>
            <button
              onClick={onClear}
              disabled={busy}
              className="text-xs text-muted-foreground hover:text-blood transition-colors font-mono uppercase tracking-widest disabled:opacity-30 ml-auto"
            >
              Clear cache
            </button>
          </div>
        </section>

        {/* Progress */}
        {progress && (
          <section className="panel p-4 rounded">
            <div className="flex items-center justify-between text-xs font-mono mb-2">
              <span className="text-gold">
                {progress.done}/{progress.total} · {formatBytes(progress.bytesDone)} / {formatBytes(progress.bytesTotal)}
              </span>
              <span className="text-muted-foreground truncate ml-3 max-w-[60%]" title={progress.currentFile}>
                {progress.currentFile}
              </span>
              {busy && (
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="ml-3 text-blood hover:brightness-125"
                >
                  ABORT
                </button>
              )}
            </div>
            <div className="h-1.5 bg-input rounded overflow-hidden">
              <div
                className="h-full bg-gold transition-all"
                style={{ width: `${progressPct.toFixed(2)}%` }}
              />
            </div>
            {progress.failed > 0 && (
              <p className="text-xs text-blood mt-2 font-mono">{progress.failed} failed downloads</p>
            )}
          </section>
        )}

        {error && (
          <section className="panel p-4 rounded border border-blood/40 text-sm text-blood font-mono">
            {error}
          </section>
        )}

        {/* Folder table */}
        <section className="panel rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-input/50 text-xs text-muted-foreground tracking-widest uppercase font-display">
              <tr>
                <th className="text-left px-4 py-3">Folder</th>
                <th className="text-right px-4 py-3">Files</th>
                <th className="text-right px-4 py-3">Size</th>
                <th className="text-right px-4 py-3">Cached</th>
                <th className="text-right px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {folders.map((f) => {
                const c = stats?.perFolder[f.name];
                const pct = c ? (c.cachedBytes / Math.max(1, f.totalSize)) * 100 : 0;
                return (
                  <tr key={f.name} className="border-t border-border/40 hover:bg-input/30">
                    <td className="px-4 py-3 font-mono">{f.name}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {f.fileCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {formatBytes(f.totalSize)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={pct > 99 ? "text-gold" : pct > 0 ? "text-foreground" : "text-muted-foreground/40"}>
                        {pct.toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => runPrefetch([f.name])}
                        disabled={busy || pct > 99.9}
                        className="text-xs px-3 py-1 border border-border hover:border-gold hover:text-gold rounded font-mono uppercase tracking-widest disabled:opacity-30"
                      >
                        {pct > 99.9 ? "Done" : "Prefetch"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <p className="text-[10px] text-muted-foreground/60 font-mono text-center">
          Files stream from <span className="text-gold/70">l2client.slave.gr</span> via the local CORS proxy.
          sha256 integrity is verified on files &lt; 32 MB. Larger files trust the TLS / Cloudflare layer.
        </p>
      </main>
    </div>
  );
}
