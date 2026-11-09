const AUTH_KEY = "fluxen_auth";
const API_REQUEST_TIMEOUT_MS = 15000;
/** Reports and other heavy reads; also covers an API waking from a cold start. */
const API_LONG_REQUEST_TIMEOUT_MS = 60000;

export const REQUEST_TIMEOUT_MESSAGE =
  "The server took too long to respond. Please try again.";

/** True when a fetch failed because our client-side timeout fired. */
export function isRequestTimeout(e: unknown): boolean {
  return e instanceof DOMException && e.name === "TimeoutError";
}

export const EFFECTIVE_SHOP_STORAGE_KEY = "fluxen_effective_shop";

/**
 * Make `shopCode` the active shop for the next requests. Call right after a fresh
 * sign-in/sign-up: a shop code left over from another account would be rejected by
 * the API (it belongs to a different business) and block the session from loading.
 */
export function pinActiveShop(shopCode: string | null | undefined) {
  if (typeof window === "undefined" || !shopCode) return;
  try {
    localStorage.setItem(EFFECTIVE_SHOP_STORAGE_KEY, shopCode);
  } catch {
    // Storage blocked: the API falls back to the user's own shop.
  }
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const { token } = JSON.parse(raw) as { token?: string };
    return token ?? null;
  } catch {
    return null;
  }
}

export function getEffectiveShopCodeForHeader(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(EFFECTIVE_SHOP_STORAGE_KEY);
  } catch {
    return null;
  }
}

function nestOriginFromEnv(): string {
  const explicit =
    process.env.INTERNAL_API_URL?.trim() ??
    process.env.API_UPSTREAM_URL?.trim() ??
    "";
  if (explicit) {
    const o = explicit.replace(/\/+$/, "");
    return o;
  }
  const pub = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");
  const origin = pub.replace(/\/api$/i, "");
  if (origin.startsWith("http://") || origin.startsWith("https://")) {
    return origin;
  }
  return "http://127.0.0.1:3001";
}

export function getApiBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();
  const directApi =
    process.env.NEXT_PUBLIC_API_SAME_ORIGIN_PROXY === "0" && raw.length > 0;

  if (typeof window !== "undefined") {
    if (directApi) {
      const base = raw.replace(/\/+$/, "");
      return base.endsWith("/api") ? base : `${base}/api`;
    }
    return "/api";
  }

  const internal = nestOriginFromEnv().replace(/\/+$/, "");
  return internal.endsWith("/api") ? internal : `${internal}/api`;
}

/**
 * Same routing as `apiFetch` (same-origin `/api` proxy, so no CORS), with a longer
 * client timeout. Vercel's proxy waits up to 120s for the upstream, above this limit.
 */
export async function apiFetchLong(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = API_LONG_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const base = getApiBaseUrl();
  const pathPart = path.startsWith("/") ? path : `/${path}`;
  const method = (init.method || "GET").toUpperCase();
  const fullUrl = `${base}${pathPart}`;

  const headers = new Headers(init.headers);
  const authHeaders = getAuthHeaders();
  for (const [key, value] of Object.entries(authHeaders)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  if (
    !headers.has("Content-Type") &&
    init.body &&
    !(init.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }

  const { nextInit, cleanup } = withRequestTimeout(init, timeoutMs);
  try {
    return await fetch(fullUrl, { ...nextInit, headers });
  } finally {
    cleanup();
  }
}

export function getAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const token = getAuthToken();
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  const shop =
    getEffectiveShopCodeForHeader() ||
    process.env.NEXT_PUBLIC_API_DEFAULT_SHOP_CODE ||
    "";
  if (shop) {
    h["X-Shop"] = shop;
  }
  return h;
}

function withRequestTimeout(
  init: RequestInit,
  timeoutMs: number = API_REQUEST_TIMEOUT_MS,
): { nextInit: RequestInit; cleanup: () => void } {
  if (typeof AbortController === "undefined") {
    return { nextInit: init, cleanup: () => {} };
  }

  const controller = new AbortController();
  // Abort with a named reason: a bare abort() surfaces to users as the cryptic
  // "signal is aborted without reason".
  const timeoutId = setTimeout(
    () =>
      controller.abort(new DOMException(REQUEST_TIMEOUT_MESSAGE, "TimeoutError")),
    timeoutMs,
  );
  const upstreamSignal = init.signal;

  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort(upstreamSignal.reason);
    } else {
      upstreamSignal.addEventListener("abort", abortFromUpstream, {
        once: true,
      });
    }
  }

  return {
    nextInit: { ...init, signal: controller.signal },
    cleanup: () => {
      clearTimeout(timeoutId);
      if (upstreamSignal) {
        upstreamSignal.removeEventListener("abort", abortFromUpstream);
      }
    },
  };
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = getApiBaseUrl();
  const pathPart = path.startsWith("/") ? path : `/${path}`;
  const method = (init.method || "GET").toUpperCase();
  const fullUrl = `${base}${pathPart}`;

  const headers = new Headers(init.headers);
  const authHeaders = getAuthHeaders();
  for (const [key, value] of Object.entries(authHeaders)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  if (
    !headers.has("Content-Type") &&
    init.body &&
    !(init.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }

  const { nextInit, cleanup } = withRequestTimeout(init);

  if (method === "GET") {
    const shop = headers.get("X-Shop") || "default";
    const dedupeKey = `${method}:${fullUrl}:${shop}`;
    
    const sharedPromise = dedupeInFlight(dedupeKey, () => 
      fetch(fullUrl, { ...nextInit, headers })
    );

    try {
      const response = await sharedPromise;
      return response.clone();
    } finally {
      cleanup();
    }
  }

  try {
    return await fetch(fullUrl, { ...nextInit, headers });
  } finally {
    cleanup();
  }
}

const inFlightByKey = new Map<string, Promise<unknown>>();

export function dedupeInFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = inFlightByKey.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const p = run().finally(() => {
    inFlightByKey.delete(key);
  });
  inFlightByKey.set(key, p);
  return p;
}
