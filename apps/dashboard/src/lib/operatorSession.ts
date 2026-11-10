import { getApiBaseUrl } from "@/lib/api";

/**
 * The admin center has its own sign-in, separate from the shop app: its token is kept in
 * sessionStorage (gone when the tab closes) and is never mixed with a shop login.
 */
const KEY = "fluxen_operator_session";
const EVENT = "fluxen:operator-session";

export type OperatorInfo = { id: string; email: string; name: string | null };
export type OperatorSession = {
  token: string;
  operator: OperatorInfo;
  expiresAt: number;
};

export function readSessionRaw(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function subscribeSession(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function parseSession(raw: string | null): OperatorSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as OperatorSession;
    if (typeof s.token !== "string" || !(s.expiresAt > Date.now())) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveSession(token: string, operator: OperatorInfo, minutes: number) {
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ token, operator, expiresAt: Date.now() + minutes * 60_000 }),
    );
  } catch {
    // Storage blocked: the operator will have to sign in again on the next page.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(EVENT));
}

export type ApiResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  message: string | null;
};

async function request<T>(
  path: string,
  init: RequestInit,
  token: string | null,
): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    const res = await fetch(`${getApiBaseUrl()}/operator${path}`, { ...init, headers });
    const json = await res.json().catch(() => null);
    const raw = json?.message;
    return {
      ok: res.ok,
      status: res.status,
      data: res.ok ? (json as T) : null,
      message: res.ok
        ? null
        : Array.isArray(raw)
          ? raw.join(" ")
          : typeof raw === "string"
            ? raw
            : "Something went wrong.",
    };
  } catch {
    return { ok: false, status: 0, data: null, message: "Network error. Please try again." };
  }
}

/** Sign-in steps: no session token yet. */
export const publicRequest = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) }, null);

/** Everything else: attaches the operator token, and signs out if the server rejects it. */
export async function operatorRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const token = parseSession(readSessionRaw())?.token ?? null;
  const r = await request<T>(path, init, token);
  if (r.status === 401 && token) clearSession();
  return r;
}
