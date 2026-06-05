/**
 * SSO helpers for the L2 Slave launcher hand-off.
 *
 * Flow: launcher opens this web client with ?sso=<token>.
 * We POST that token to https://l2.slave.gr/api/public/launcher/sso-verify
 * and receive { login, sessionToken, expiresAt } that we then use as
 * username + password against the existing L2 login flow.
 */

const SSO_VERIFY_URL = "https://l2.slave.gr/api/public/launcher/sso-verify";
const SESSION_KEY = "l2.session";

export type SsoSession = {
  login: string;
  sessionToken: string;
  /** ISO string or epoch ms. */
  expiresAt: string | number;
};

export type SsoVerifyResult =
  | { ok: true; login: string; sessionToken: string; expiresAt: string | number }
  | { ok: false; reason: string };

export function readSsoTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("sso");
    return t && t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

export function stripSsoFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    history.replaceState({}, "", window.location.pathname);
  } catch {
    /* ignore */
  }
}

export async function verifySsoToken(token: string): Promise<SsoVerifyResult> {
  try {
    const res = await fetch(SSO_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as Partial<SsoVerifyResult> & {
      login?: string;
      sessionToken?: string;
      expiresAt?: string | number;
    };
    if (data && data.ok && data.login && data.sessionToken && data.expiresAt != null) {
      return {
        ok: true,
        login: data.login,
        sessionToken: data.sessionToken,
        expiresAt: data.expiresAt,
      };
    }
    return { ok: false, reason: (data && (data as { reason?: string }).reason) || "invalid response" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "network error" };
  }
}

function expiresAtToMs(v: string | number): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  if (Number.isFinite(n) && String(n) === String(v)) return n;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

export function saveSsoSession(s: SsoSession): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadSsoSession(): SsoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SsoSession;
    if (!parsed?.login || !parsed?.sessionToken || parsed.expiresAt == null) return null;
    if (expiresAtToMs(parsed.expiresAt) <= Date.now()) {
      clearSsoSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSsoSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
