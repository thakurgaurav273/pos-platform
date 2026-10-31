'use client';

import { AuthProvider } from '@/contexts/AuthContext';
import { ShopProvider } from '@/contexts/ShopContext';
import { ThemeProvider } from '@/contexts/ThemeContext';

/**
 * Auth -> active shop -> theme. ThemeProvider owns the antd ConfigProvider and App,
 * so antd and the CSS variables always follow the active shop's branding.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ShopProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </ShopProvider>
    </AuthProvider>
  );
}
