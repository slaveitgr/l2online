/**
 * L2LauncherShell — shared chrome for the pre-game screens (login + server
 * select). Renders the looping login video as background (with a mute/unmute
 * toggle so the soundtrack can play), a row of vertical side links on the
 * right (New Account / Lost Account / Links / Settings / CDN Cache), an
 * "Update" button that flushes the CDN cache + service worker and reloads,
 * and a bottom branding bar. Children render centered on top.
 */
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";

const CLIENT_VIDEO = "/hud/videos/login_web.mp4";

const SIDE_LINKS: { label: string; href?: string; to?: string }[] = [
  { label: "New Account", href: "https://www.slave.gr/register" },
  { label: "Lost Account", href: "https://www.slave.gr/recover" },
  { label: "Links", href: "https://www.slave.gr" },
  { label: "Settings", href: "https://www.slave.gr/settings" },
  { label: "CDN Cache", to: "/cdn-cache" },
];

const sideLinkStyle = {
  color: "#d8c996",
  fontSize: 13,
  fontFamily: "Arial, Helvetica, sans-serif",
  textShadow: "0 1px 2px #000, 0 0 4px #000",
  letterSpacing: 0.5,
  cursor: "pointer",
} as const;

function SideLinks({ onUpdate, updating }: { onUpdate: () => void; updating: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        right: "2.2%",
        bottom: "6%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 6,
        zIndex: 4,
        pointerEvents: "auto",
      }}
    >
      {SIDE_LINKS.map((l) => {
        const inner = <span style={sideLinkStyle}>{l.label}</span>;
        return l.to ? (
          <Link key={l.label} to={l.to} className="l2-side-link">
            {inner}
          </Link>
        ) : (
          <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="l2-side-link">
            {inner}
          </a>
        );
      })}
      <button
        type="button"
        onClick={onUpdate}
        disabled={updating}
        className="l2-side-link"
        style={{
          ...sideLinkStyle,
          background: "transparent",
          border: 0,
          padding: 0,
          marginTop: 4,
          opacity: updating ? 0.6 : 1,
          color: "#ffd97a",
        }}
        title="Clear CDN cache and reload"
      >
        {updating ? "Updating…" : "Update"}
      </button>
    </div>
  );
}

function BrandBar() {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 8,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 16,
        zIndex: 4,
        pointerEvents: "none",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#cfc6a4",
        textShadow: "0 1px 2px #000",
        fontSize: 12,
      }}
    >
      <span
        style={{
          fontWeight: 800,
          letterSpacing: 1,
          color: "#fff",
          background: "#000",
          padding: "1px 6px",
          borderRadius: 2,
          border: "1px solid #555",
        }}
      >
        nc
      </span>
      <span style={{ opacity: 0.5 }}>|</span>
      <span
        style={{
          fontFamily: "Cinzel, 'Trajan Pro', Georgia, serif",
          letterSpacing: 5,
          color: "#e6dcb6",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        LINEAGE&nbsp;II
      </span>
      <span style={{ opacity: 0.5 }}>|</span>
      <span style={{ color: "#e6dcb6" }}>
        <span
          style={{
            display: "inline-block",
            marginRight: 4,
            width: 14,
            height: 14,
            borderRadius: 14,
            background: "#3a7be0",
            color: "#fff",
            textAlign: "center",
            lineHeight: "14px",
            fontWeight: 800,
            fontSize: 10,
            verticalAlign: "middle",
          }}
        >
          ✦
        </span>
        slave.gr
      </span>
      <span style={{ opacity: 0.55 }}>
        © Slave.gr · Powered by NCSOFT Lineage II. All Rights Reserved.
      </span>
    </div>
  );
}

function MuteToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={muted ? "Unmute" : "Mute"}
      aria-label={muted ? "Unmute soundtrack" : "Mute soundtrack"}
      style={{
        position: "absolute",
        left: 16,
        bottom: 32,
        zIndex: 5,
        width: 34,
        height: 34,
        borderRadius: "50%",
        background:
          "linear-gradient(180deg,#3a3424 0%,#1f1a10 55%,#2a2418 100%)",
        border: "1px solid #6a5630",
        boxShadow: "inset 0 1px 0 rgba(255,235,180,0.10), 0 2px 6px rgba(0,0,0,0.7)",
        color: "#e6dcb6",
        fontSize: 16,
        cursor: "pointer",
        textShadow: "0 1px 2px #000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}

async function flushAndReload() {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    try {
      sessionStorage.removeItem("l2_gslog");
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") window.location.reload();
}

export function L2LauncherShell({ children }: { children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [updating, setUpdating] = useState(false);

  // try to unmute as soon as the user interacts anywhere on the shell
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (!muted) {
      v.play().catch(() => {
        /* autoplay-with-sound may be blocked until interaction */
      });
    }
  }, [muted]);

  function toggleMute() {
    setMuted((m) => !m);
  }

  async function onUpdate() {
    if (updating) return;
    setUpdating(true);
    await flushAndReload();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "#000",
        color: "#d6cfaa",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <video
        ref={videoRef}
        src={CLIENT_VIDEO}
        autoPlay
        muted={muted}
        loop
        playsInline
        preload="auto"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35) 100%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "absolute", inset: 0, zIndex: 3 }}>{children}</div>
      <MuteToggle muted={muted} onToggle={toggleMute} />
      <SideLinks onUpdate={onUpdate} updating={updating} />
      <BrandBar />
    </div>
  );
}
