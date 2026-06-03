/**
 * L2LauncherShell — shared chrome for the pre-game screens (login + server
 * select). Renders only the looping login video as background, a row of
 * vertical side links on the right (New Account / Lost Account / Links /
 * Settings / CDN Cache), and a bottom branding bar
 * (nc | LINEAGE II | 4game.com © NCSOFT…). Children render centered on top.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

const CLIENT_VIDEO = "/hud/videos/login_web.mp4";

const SIDE_LINKS: { label: string; href?: string; to?: string }[] = [
  { label: "New Account", href: "https://www.slave.gr/register" },
  { label: "Lost Account", href: "https://www.slave.gr/recover" },
  { label: "Links", href: "https://www.slave.gr" },
  { label: "Settings", href: "https://www.slave.gr/settings" },
  { label: "CDN Cache", to: "/cdn-cache" },
];

function SideLinks() {
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
        const className = "l2-side-link";
        const inner = (
          <span
            style={{
              color: "#d8c996",
              fontSize: 13,
              fontFamily: "Arial, Helvetica, sans-serif",
              textShadow: "0 1px 2px #000, 0 0 4px #000",
              letterSpacing: 0.5,
              cursor: "pointer",
            }}
          >
            {l.label}
          </span>
        );
        return l.to ? (
          <Link key={l.label} to={l.to} className={className}>
            {inner}
          </Link>
        ) : (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noreferrer"
            className={className}
          >
            {inner}
          </a>
        );
      })}
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

export function L2LauncherShell({ children }: { children: ReactNode }) {
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
        src={CLIENT_VIDEO}
        autoPlay
        muted
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
      <SideLinks />
      <BrandBar />
    </div>
  );
}
