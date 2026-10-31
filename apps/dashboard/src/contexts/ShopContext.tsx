"use client";

import type { Shop } from "@/lib/types/shop";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, EFFECTIVE_SHOP_STORAGE_KEY } from "@/lib/api";

const STORAGE_KEY = EFFECTIVE_SHOP_STORAGE_KEY;

type ShopContextValue = {
  effectiveShopCode: string;
  setEffectiveShopCode: (code: string) => void;
  shops: Shop[];
  shopsLoading: boolean;
  shopSwitcherEnabled: boolean;
  /** The shop record for `effectiveShopCode`, once loaded. */
  activeShop: Shop | undefined;
  /** Replace a shop in the loaded list after a successful save (no page reload). */
  updateShop: (shop: Shop) => void;
};

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopsLoading, setShopsLoading] = useState(false);
  const [effectiveShopCode, setEffectiveShopCodeState] = useState("");

  const defaultEnv =
    process.env.NEXT_PUBLIC_API_DEFAULT_SHOP_CODE ?? "";

  const requestIdRef = useRef(0);
  const role = user?.role;
  const userShopCode = user?.shopCode;

  // Signing out drops the loaded shops, so the next account on this tab never sees
  // the previous account's shop (or its branding) while its own shops load.
  const [wasAuthenticated, setWasAuthenticated] = useState(isAuthenticated);
  if (wasAuthenticated !== isAuthenticated) {
    setWasAuthenticated(isAuthenticated);
    if (!isAuthenticated) {
      setShops([]);
      setEffectiveShopCodeState("");
    }
  }

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const requestId = ++requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;

    setShopsLoading(true);

    if (role === "SUPER_ADMIN") {
      apiFetch("/shops")
        .then(async (res) => {
          if (!res.ok) throw new Error(res.statusText);
          return res.json() as Promise<Shop[]>;
        })
        .then((list) => {
          if (isStale()) return;
          setShops(list);
          const codes = new Set(list.map((s) => s.shopCode));
          const stored =
            typeof window !== "undefined"
              ? localStorage.getItem(STORAGE_KEY)
              : null;
          const fromStorage = stored && codes.has(stored) ? stored : null;
          const defaultShop = codes.has(defaultEnv)
            ? defaultEnv
            : list.find((s) => s.shopCode === "calcutta-main")?.shopCode;
          const fallback =
            fromStorage ||
            defaultShop ||
            list[0]?.shopCode ||
            userShopCode;
          setEffectiveShopCodeState(fallback ?? '');
          if (typeof window !== "undefined" && fallback) {
            localStorage.setItem(STORAGE_KEY, fallback);
          }
        })
        .catch(() => {
          if (isStale()) return;
          setEffectiveShopCodeState((prev) => prev || userShopCode || defaultEnv);
        })
        .finally(() => {
          if (!isStale()) setShopsLoading(false);
        });
    } else {
      apiFetch("/shops/current")
        .then(async (res) => {
          if (!res.ok) throw new Error(res.statusText);
          return res.json() as Promise<Shop>;
        })
        .then((shop) => {
          if (isStale()) return;
          setShops([shop]);
          const code = shop.shopCode || userShopCode || defaultEnv;
          setEffectiveShopCodeState(code);
          if (typeof window !== "undefined" && code) {
            localStorage.setItem(STORAGE_KEY, code);
          }
        })
        .catch(() => {
          if (isStale()) return;
          const code = userShopCode || defaultEnv;
          setEffectiveShopCodeState((prev) => prev || code);
          if (typeof window !== "undefined" && code) {
            localStorage.setItem(STORAGE_KEY, code);
          }
        })
        .finally(() => {
          if (!isStale()) setShopsLoading(false);
        });
    }
  }, [isAuthenticated, role, userShopCode, defaultEnv]);

  const setEffectiveShopCode = useCallback((code: string) => {
    if (!code || shopsLoading) return;

    setEffectiveShopCodeState(code);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, code);
        setTimeout(() => {
          window.location.reload();
        }, 50);
      } catch (e) {
        console.error("Failed to persist shop code", e);
        window.location.reload();
      }
    }
  }, [shopsLoading]);

  const shopSwitcherEnabled = useMemo(() => {
    if (shops.length === 0) return true;
    const current = shops.find((s) => s.shopCode === effectiveShopCode) ?? shops[0];
    return current?.allowShopSwitcher !== false;
  }, [shops, effectiveShopCode]);

  const activeShop = useMemo(
    () => shops.find((s) => s.shopCode === effectiveShopCode),
    [shops, effectiveShopCode],
  );

  const updateShop = useCallback((shop: Shop) => {
    setShops((prev) => prev.map((s) => (s.id === shop.id ? { ...s, ...shop } : s)));
  }, []);

  const value = useMemo<ShopContextValue>(
    () => ({
      effectiveShopCode,
      setEffectiveShopCode,
      shops,
      shopsLoading,
      shopSwitcherEnabled,
      activeShop,
      updateShop,
    }),
    [
      effectiveShopCode,
      setEffectiveShopCode,
      shops,
      shopsLoading,
      shopSwitcherEnabled,
      activeShop,
      updateShop,
    ],
  );

  return (
    <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
  );
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) {
    throw new Error("useShop must be used within ShopProvider");
  }
  return ctx;
}

/** Safe hook when provider may be absent (e.g. tests). */
export function useShopOptional(): ShopContextValue | null {
  return useContext(ShopContext);
}
