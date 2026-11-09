import type { Shop as DbShop } from "@fluxen/database";

/**
 * Shop as returned by the API. GST rates are DECIMAL in the database but the API
 * serialises every Decimal as a plain JSON number.
 */
export type Shop = Omit<DbShop, "cgstRate" | "sgstRate"> & {
  cgstRate: number;
  sgstRate: number;
};
