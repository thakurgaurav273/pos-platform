/** Login of the shared demo owner. Nobody knows its password: sessions are issued by DemoService. */
export const DEMO_OWNER_EMAIL = 'demo@fluxen.app';
export const DEMO_MANAGER_EMAIL = 'demo.manager@fluxen.app';
export const DEMO_CASHIER_EMAIL = 'demo.cashier@fluxen.app';
export const DEMO_ORG_NAME = 'Fluxen Demo Bakery';

export const DEMO_EMAILS: readonly string[] = [
  DEMO_OWNER_EMAIL,
  DEMO_MANAGER_EMAIL,
  DEMO_CASHIER_EMAIL,
];

export function isDemoEmail(email: string | null | undefined): boolean {
  return DEMO_EMAILS.includes((email ?? '').toLowerCase().trim());
}

/**
 * The public demo is on by default outside production. In production it must be
 * switched on explicitly with DEMO_ENABLED=true, because anyone can open it.
 */
export function isDemoEnabled(): boolean {
  const flag = (process.env['DEMO_ENABLED'] ?? '').trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env['NODE_ENV'] !== 'production';
}
