/**
 * Native Android WebView bridge for USB thermal printing (ESC/POS).
 * The sideloaded app exposes `window.Android.printBill(jsonString)`.
 */

export type NativeAndroidBillItem = {
  name: string;
  qty: number;
  rate: number;
  amount: number;
  discount?: number;
};

export type NativeAndroidBillPayload = {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  gstin: string;
  showShopGstin: boolean;
  fssaiNumber: string;
  billNumber: string;
  billTitle?: string;
  billerName?: string;
  customerName: string;
  customerPhone: string;
  customerGstin: string;
  showCustomerGstin: boolean;
  items: NativeAndroidBillItem[];
  taxableBase: number;
  subtotal: number;
  discount: number;
  tax: number;
  taxLabel: string;
  cgstPercent: number;
  sgstPercent: number;
  cgstAmount: number;
  sgstAmount: number;
  total: number;
  /** Display label of the mode ("Cash", "UPI", "Card", "Split"). */
  paymentMode: string;
  /** Bill total settled (sum of payments; excludes change). */
  amountPaid: number;
  /** Per-mode legs; `mode` is the display label. Omitted for single-mode bills from older callers. */
  payments?: { mode: string; amount: number }[];
  /** Cash handed over, and change returned (only when change > 0). */
  cashTendered?: number;
  changeDue?: number;
  footerMessage: string;
  footerNote?: string;
  bankAccountNumber: string;
  bankIfsc: string;
  poweredBy?: string;
  /** ISO-8601, e.g. from `new Date().toISOString()` */
  issuedAt?: string;
  /**
   * Pre-formatted 80mm plain text (42 cols). If the Android bridge supports it,
   * print this body with ESC/POS feed+cut instead of rebuilding from fields.
   */
  thermalPlainText?: string;
};

type AndroidBridge = {
  printBill: (json: string) => void;
  getPrinterStatus?: () => string;
  scanPrinter?: () => void;
};

function getAndroidBridge(): AndroidBridge | null {
  if (typeof window === 'undefined') return null;
  const a = (window as unknown as { Android?: AndroidBridge }).Android;
  if (a && typeof a.printBill === 'function') return a;
  return null;
}

export function isNativeUsbPrinterAvailable(): boolean {
  return getAndroidBridge() != null;
}

function waitForPrintResult(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as {
      onPrintResult?: (success: boolean, message: string) => void;
    };
    const prev = w.onPrintResult;
    const timer = window.setTimeout(() => {
      w.onPrintResult = prev;
      reject(new Error('Print timed out. Check the USB printer and permissions.'));
    }, timeoutMs);
    w.onPrintResult = (success, message) => {
      window.clearTimeout(timer);
      w.onPrintResult = prev;
      if (success) resolve();
      else reject(new Error(message || 'Print failed'));
    };
  });
}

export async function printBillViaNativeAndroid(
  payload: NativeAndroidBillPayload,
): Promise<void> {
  const bridge = getAndroidBridge();
  if (!bridge) {
    throw new Error(
      'Thermal print needs the Fluxen POS Android app (WebView). Open the dashboard there, not in a normal browser.',
    );
  }
  const done = waitForPrintResult(25_000);
  bridge.printBill(JSON.stringify(payload));
  await done;
}
