'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { apiFetch, EFFECTIVE_SHOP_STORAGE_KEY } from '@/lib/api';

const AUTH_STORAGE_KEY = 'calcutta_auth';

export type RolePermissions = {
  canAccessDashboard: boolean;
  canAccessBilling: boolean;
  canAccessOrders: boolean;
  canAccessProducts: boolean;
  canAccessInventory: boolean;
  canAccessCategories: boolean;
  canAccessReports: boolean;
  canAccessUsers: boolean;
  canAccessSettings: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  role?: string;
  shopCode?: string;
  phone?: string | null;
  avatarUrl?: string | null;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  permissions: RolePermissions | null;
  isAuthenticated: boolean;
  isLoading: boolean;
};

type AuthContextValue = AuthState & {
  setAuth: (token: string, user: AuthUser | null, permissions?: RolePermissions | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Users other than SUPER_ADMIN can only act on their own shop (the API rejects any
 * other X-Shop). Store it before the first request so it is sent instead of the
 * env default shop, which made the first calls after login fail with 403.
 */
function pinOwnShop(user: AuthUser | null) {
  if (!user || user.role === 'SUPER_ADMIN' || !user.shopCode) return;
  try {
    localStorage.setItem(EFFECTIVE_SHOP_STORAGE_KEY, user.shopCode);
  } catch {
    // Storage blocked: the API still scopes the user to their own shop.
  }
}

function getStoredAuth(): Pick<AuthState, 'token' | 'user' | 'permissions'> {
  if (typeof window === 'undefined') return { token: null, user: null, permissions: null };
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return { token: null, user: null, permissions: null };
    const { token, user, permissions } = JSON.parse(stored);
    return { token: token || null, user: user || null, permissions: permissions || null };
  } catch {
    return { token: null, user: null, permissions: null };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Must match server + client first paint: never read localStorage in useState.
  // Otherwise the server renders "loading" while the client renders "logged in/out"
  // and React hydration fails (AuthLayout / AuthGuard skeleton vs real UI).
  const [state, setState] = useState<AuthState>(() => ({
    token: null,
    user: null,
    permissions: null,
    isAuthenticated: false,
    isLoading: true,
  }));

  useEffect(() => {
    const { token, user, permissions } = getStoredAuth();
    pinOwnShop(user);
    setState({
      token,
      user,
      permissions,
      isAuthenticated: !!token,
      isLoading: false,
    });
  }, []);

  const setAuth = useCallback((token: string, user: AuthUser | null, permissions: RolePermissions | null = null) => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user, permissions }));
    pinOwnShop(user);
    setState({
      token,
      user,
      permissions,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    // The next person to sign in on this tab must not inherit an unfinished sale.
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith("calcutta_pos_draft:")) sessionStorage.removeItem(key);
      }
    } catch {
      // Storage blocked: nothing was saved.
    }
    setState({
      token: null,
      user: null,
      permissions: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  /**
   * After hydration, revalidate user + permissions from the API so role / overrides /
   * deactivation changes apply on reload (localStorage alone would stay stale).
   */
  useEffect(() => {
    if (!state.token) return;
    const token = state.token;
    let cancelled = false;

    (async () => {
      try {
        const [meRes, permRes] = await Promise.all([
          apiFetch('/users/profile/me'),
          apiFetch('/settings/role-permissions'),
        ]);
        if (cancelled) return;

        if (meRes.status === 401 || permRes.status === 401) {
          logout();
          return;
        }
        if (!meRes.ok || !permRes.ok) return;

        const me = (await meRes.json()) as AuthUser & { isActive?: boolean };
        const perms = (await permRes.json()) as RolePermissions;
        if (cancelled) return;

        if (typeof perms.canAccessDashboard !== 'boolean') return;

        const user: AuthUser = {
          id: me.id,
          email: me.email,
          name: me.name,
          role: me.role,
          shopCode: me.shopCode,
          phone: me.phone ?? null,
          avatarUrl: me.avatarUrl ?? null,
        };

        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user, permissions: perms }));
        setState((prev) => ({
          ...prev,
          user,
          permissions: perms,
          isAuthenticated: true,
          isLoading: false,
        }));
      } catch {
        // Offline / transient errors: keep restored session from storage.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.token, logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      setAuth,
      logout,
    }),
    [state, setAuth, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
