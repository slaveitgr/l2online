import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  indexClientFiles,
  getManifest,
  clearCache,
  validateManifest,
  formatBytes,
  type ClientManifest,
  type IndexProgress,
} from "../lib/l2-assets";

export const Route = createFileRoute("/select-files")({
  head: () => ({
    meta: [
      { title: "Select Client — Lineage II Web" },
      { name: "description", content: "Point the web client at your local Interlude installation." },
    ],
  }),
  component: SelectFiles,
});

function SelectFiles() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [manifest, setManifest] = useState<ClientManifest | null>(null);
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getManifest().then(setManifest);
  }, []);

  const onPick = () => inputRef.current?.click();

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const m = await indexClientFiles(files, (p) => setProgress(p));
      const v = validateManifest(m);
      setManifest(m);
      if (!v.ok) {
        setError(`Indexed, but missing expected folders: ${v.missing.join(", ")}. You can still continue, but rendering may fail.`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const onForget = async () => {
    await clearCache();
    setManifest(null);
  };

  const validation = manifest ? validateManifest(manifest) : null;
  const progressPct = progress ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 px-6 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-sm bg-gradient-to-br from-primary to-blood flex items-center justify-center font-display text-primary-foreground font-bold">L</div>
          <div>
            <h1 className="font-display text-gold text-lg leading-none tracking-widest group-hover:brightness-125 transition">LINEAGE II</h1>
            <p className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">Asset Selection</p>
          </div>
        </Link>
        <Link to="/" className="text-xs text-muted-foreground hover:text-gold transition">← Back</Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-3xl space-y-6">
          <div className="text-center">
            <p className="text-gold/80 font-mono text-xs tracking-[0.4em] uppercase mb-3">Step 2 of 3</p>
            <h2 className="font-display text-3xl text-foreground">Locate your Interlude client</h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              Select the root folder of your Lineage II Interlude installation. Files are indexed locally in your browser
              (IndexedDB) and never uploaded anywhere.
            </p>
          </div>

          <div className="panel rounded p-8">
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              // @ts-expect-error non-standard but widely supported
              webkitdirectory=""
              directory=""
              multiple
              onChange={(e) => onFiles(e.target.files)}
            />

            {busy && progress ? (
              <div className="space-y-4">
                <div className="flex justify-between text-sm font-mono">
                  <span className="text-gold">Indexing…</span>
                  <span className="text-muted-foreground">{progress.processed} / {progress.total}</span>
                </div>
                <div className="h-2 bg-input rounded overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-gold transition-all" style={{ width: `${progressPct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground font-mono truncate">{progress.currentFile}</p>
              </div>
            ) : manifest ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest font-display">Cached client</p>
                    <p className="font-display text-xl text-gold mt-1">{manifest.rootName}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground font-mono">
                    <div>{manifest.fileCount.toLocaleString()} files</div>
                    <div>{formatBytes(manifest.totalSize)}</div>
                    <div>indexed {new Date(manifest.indexedAt).toLocaleString()}</div>
                  </div>
                </div>

                <div className="gold-divider" />

                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest font-display mb-3">Folders detected</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(manifest.folders).map(([name, count]) => (
                      <div key={name} className="bg-input/50 border border-border rounded px-3 py-2 text-sm font-mono flex justify-between">
                        <span className="text-foreground">{name}</span>
                        <span className="text-gold-muted">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {validation && !validation.ok && (
                  <div className="border border-destructive/50 bg-destructive/10 rounded px-4 py-3 text-sm text-destructive-foreground">
                    Missing expected folders: <span className="font-mono">{validation.missing.join(", ")}</span>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => navigate({ to: "/characters" })}
                    className="flex-1 bg-gradient-to-b from-primary to-gold-muted text-primary-foreground font-display tracking-[0.3em] py-3 rounded border border-gold/40 hover:brightness-110 transition-all"
                  >
                    CONTINUE
                  </button>
                  <button
                    onClick={onPick}
                    className="border border-border px-4 py-3 rounded text-sm hover:bg-accent transition"
                  >
                    Re-index
                  </button>
                  <button
                    onClick={onForget}
                    className="border border-destructive/50 text-destructive-foreground/80 px-4 py-3 rounded text-sm hover:bg-destructive/20 transition"
                  >
                    Forget
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-20 h-20 mx-auto mb-6 border-2 border-dashed border-gold-muted/40 rounded-lg flex items-center justify-center">
                  <svg className="w-10 h-10 text-gold-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                </div>
                <button
                  onClick={onPick}
                  className="bg-gradient-to-b from-primary to-gold-muted text-primary-foreground font-display tracking-[0.3em] px-8 py-3 rounded border border-gold/40 hover:brightness-110 transition-all"
                >
                  SELECT CLIENT FOLDER
                </button>
                <p className="text-xs text-muted-foreground mt-4 font-mono">
                  Choose the folder containing <span className="text-gold">system/</span>, <span className="text-gold">maps/</span>, <span className="text-gold">textures/</span>…
                </p>
              </div>
            )}

            {error && (
              <div className="mt-4 border border-destructive/50 bg-destructive/10 rounded px-4 py-3 text-sm">
                {error}
              </div>
            )}
          </div>

          <div className="text-center text-[10px] text-muted-foreground/70 font-mono leading-relaxed">
            Files stay on your device. Indexed bytes are written to IndexedDB only.<br />
            Lineage 2 and the Interlude client are property of NCSOFT. This project distributes no game assets.
          </div>
        </div>
      </main>
    </div>
  );
}
