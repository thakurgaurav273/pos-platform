'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Boxes,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Contact,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Package,
  ReceiptIndianRupee,
  ScanBarcode,
  Settings,
  Store,
  Tags,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Drawer, Button, Dropdown, Layout, Menu, Select, Space, Tag } from 'antd';
import Image from 'next/image';
import Link from 'next/link';

import { BrandLogo } from '@/components/BrandLogo/BrandLogo';
import { ColorModeToggle } from '@/components/ColorModeToggle/ColorModeToggle';
import { ActivityNotificationsBell } from '@/components/ActivityNotificationsBell/ActivityNotificationsBell';
import { useAuth } from '@/contexts/AuthContext';
import { useShop } from '@/contexts/ShopContext';
import {
  APP_NAV_ITEMS,
  SIDEBAR_ROUTE_PREFIXES,
  isAppNavAllowed,
} from '@/lib/appNavAccess';
import styles from './AppLayout.module.css';

const { Header, Sider, Content } = Layout;

function formatRole(role?: string): string {
  if (!role) return '';
  return role
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function sidebarSelectedKey(pathname: string): string {
  const hit = SIDEBAR_ROUTE_PREFIXES.find(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
  return hit ?? pathname;
}

/** Sidebar groups; a hairline separates them. Order inside APP_NAV_ITEMS is unchanged. */
const navGroup: Record<string, number> = {
  '/dashboard': 0,
  '/reports/gst-summary': 0,
  '/billing-pos': 1,
  '/orders': 1,
  '/customers': 1,
  '/products': 2,
  '/inventory': 2,
  '/stock-transfers': 2,
  '/categories': 2,
  '/users': 3,
  '/shops': 3,
  '/settings': 3,
};

const navIcons: Record<string, LucideIcon> = {
  '/dashboard': LayoutDashboard,
  '/reports/gst-summary': ReceiptIndianRupee,
  '/billing-pos': ScanBarcode,
  '/orders': ClipboardList,
  '/customers': Contact,
  '/products': Package,
  '/inventory': Boxes,
  '/stock-transfers': ArrowLeftRight,
  '/categories': Tags,
  '/users': Users,
  '/shops': Store,
  '/settings': Settings,
};

const pageTitles: Record<string, string> = {
  '/access-denied': 'Access restricted',
  '/dashboard': 'Dashboard',
  '/reports/gst-summary': 'GST summary',
  '/billing-pos': 'Billing POS',
  '/orders': 'Orders',
  '/customers': 'Customers',
  '/products': 'Products',
  '/inventory': 'Inventory',
  '/stock-transfers': 'Stock Transfers',
  '/categories': 'Categories',
  '/users': 'Users',
  '/settings': 'Settings',
  '/logout': 'Logout',
  '/shops': 'Management Shops',
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, permissions } = useAuth();
  const { effectiveShopCode, setEffectiveShopCode, shops, shopsLoading, shopSwitcherEnabled } =
    useShop();

  const isFactory = useMemo(() => {
    const s = shops.find(x => x.shopCode === effectiveShopCode);
    return !!s?.isFactory;
  }, [shops, effectiveShopCode]);

  const activeShopName = useMemo(
    () => shops.find((x) => x.shopCode === effectiveShopCode)?.name ?? effectiveShopCode,
    [shops, effectiveShopCode],
  );

  const sidebarItems = useMemo(() => {
    return APP_NAV_ITEMS.filter((item) => item.sidebarLabel).filter((item) =>
      isAppNavAllowed(item, {
        user,
        permissions,
        isFactory,
      }),
    ).flatMap((item, i, all) => {
      const Icon = navIcons[item.prefix];
      const startsGroup =
        i > 0 && navGroup[item.prefix] !== navGroup[all[i - 1].prefix];
      const entry = {
      key: item.prefix,
      icon: Icon ? <Icon className="size-[17px]" strokeWidth={1.9} aria-hidden /> : undefined,
      label: (
        <Link
          href={item.prefix}
          className={styles.menuLink}
          scroll={false}
        >
          {item.sidebarLabel}
        </Link>
      ),
      };
      return startsGroup
        ? [{ type: 'divider' as const, key: `divider-${item.prefix}` }, entry]
        : [entry];
    });
  }, [user, permissions, isFactory]);

  const pageTitle =
    pageTitles[pathname] ??
    (pathname.startsWith('/inventory/')
      ? 'Inventory'
      : pathname.startsWith('/categories/')
        ? 'Categories'
        : pathname.startsWith('/orders/')
          ? 'Bill detail'
          : pathname.startsWith('/users/')
            ? 'Edit user'
            : pathname.startsWith('/shops/')
              ? 'Shop details'
              : 'Dashboard');

  const showShopSwitcher = user?.role === 'SUPER_ADMIN' && shops.length > 0;

  const isInventoryListPage = pathname === "/inventory";

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const selectedSidebarKey = useMemo(
    () => sidebarSelectedKey(pathname),
    [pathname],
  );

  const MainMenu = (
    <Menu
      mode="inline"
      selectedKeys={[selectedSidebarKey]}
      items={sidebarItems}
      className={`${styles.menu}`}
    />
  );

  const SidebarContent = (
    <>
      <Link
        href="/dashboard"
        className={`flex h-16 shrink-0 items-center justify-center px-4 ${styles.logoLink}`}
        scroll={false}
      >
        <span className={styles.logoFrame}>
          <BrandLogo shopName={activeShopName} className={styles.logoImage} priority />
        </span>
      </Link>
      {MainMenu}
      {activeShopName && (
        <div className={styles.siderFooter}>
          <div className={styles.siderFooterShop}>
            {isFactory ? 'Factory' : 'Shop'}
          </div>
          <div className={styles.siderFooterName} title={activeShopName}>
            {activeShopName}
          </div>
        </div>
      )}
    </>
  );

  return (
    <Layout className={`min-h-screen flex ${styles.layout}`}>
      <a href="#main-content" className="cs-skip-link">
        Skip to content
      </a>
      <Sider
        width={240}
        aria-label="Main navigation"
        theme="light"
        className={`flex min-h-screen flex-col sticky top-0 h-screen z-10 ${styles.sider}`}
      >
        {SidebarContent}
      </Sider>

      <Drawer
        placement="left"
        onClose={() => setIsMobileMenuOpen(false)}
        open={isMobileMenuOpen}
        styles={{
          body: { padding: 0 },
          wrapper: { width: 240 }
        }}
        closable={false}
        className={styles.mobileDrawer}
      >
        <div className={styles.mobileDrawerInner}>
          <div className={styles.mobileDrawerHeader}>
            <Button
              className={styles.closeButton}
              onClick={() => setIsMobileMenuOpen(false)}
              icon={<X className="size-5" />}
            />
            <Link href="/dashboard" className={styles.drawerLogo} scroll={false}>
              <span className={styles.drawerLogoFrame}>
                <BrandLogo shopName={activeShopName} />
              </span>
            </Link>
          </div>
          
          {MainMenu}

          {showShopSwitcher && (
            <div className={styles.mobileDrawerShopSwitcher}>
              <p className="text-xs font-medium text-[var(--bistre-400)] mb-2 px-1">Active Shop</p>
              <Select
                size="middle"
                className="w-full"
                value={effectiveShopCode}
                disabled={!shopSwitcherEnabled || (shopsLoading && shops.length === 0)}
                options={shops.map((s) => ({
                  value: s.shopCode,
                  label: `${s.name} (${s.shopCode})`,
                }))}
                onChange={(code) => setEffectiveShopCode(code)}
                aria-label="Active shop"
              />
            </div>
          )}
        </div>
      </Drawer>

      <Layout className={`min-h-screen flex-1 ${styles.mainLayout}`}>
        <Header
          className={`flex items-center justify-between gap-4 ${styles.header}`}
        >
          <div className={`flex min-w-0 flex-1 items-center gap-3 ${styles.headerTitleCluster}`}>
            <Button
              className={`${styles.mobileMenuButton} flex shrink-0 items-center justify-center size-9 p-0`}
              onClick={() => setIsMobileMenuOpen(true)}
              icon={<MenuIcon className="size-5" />}
              aria-label="Open navigation menu"
            />
            {/* Context breadcrumb (shop / section); the page itself owns the big title */}
            <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
              <span className={styles.breadcrumbShop}>{activeShopName}</span>
              <ChevronRight className={styles.breadcrumbSep} aria-hidden />
              <span className={styles.breadcrumbPage} aria-current="page">
                {pageTitle}
              </span>
            </nav>
          </div>
          <div className={`flex shrink-0 items-center ${styles.headerToolbar}`}>
            {showShopSwitcher && (
              <div className={styles.headerShopSwitcher}>
                <Select
                  size="middle"
                  className={`${styles.shopSelect} ${styles.headerShopSelect}`}
                  prefix={<Store className="size-4 text-[var(--bistre-400)]" strokeWidth={1.8} aria-hidden />}
                  value={effectiveShopCode}
                  disabled={!shopSwitcherEnabled || (shopsLoading && shops.length === 0)}
                  options={shops.map((s) => ({
                    value: s.shopCode,
                    label: (
                      <span>
                        {s.name}
                        <span className="ml-1.5 text-[var(--text-muted)]">{s.shopCode}</span>
                      </span>
                    ),
                  }))}
                  onChange={(code) => setEffectiveShopCode(code)}
                  aria-label="Active shop"
                  popupMatchSelectWidth={false}
                />
              </div>
            )}

            <ColorModeToggle />
            <ActivityNotificationsBell />

            <div className={styles.headerToolbarDivider} aria-hidden="true" />

            <Dropdown
              menu={{
                items: [
                  {
                    key: 'settings',
                    label: <Link href="/settings" scroll={false}>Account Settings</Link>,
                    icon: (
                      <Settings
                        className="size-[15px] text-[var(--bistre-500)]"
                        strokeWidth={2}
                        aria-hidden
                      />
                    ),
                  },
                  {
                    type: 'divider',
                  },
                  {
                    key: 'logout',
                    danger: true,
                    label: <Link href="/logout" scroll={false}>Logout</Link>,
                    icon: (
                      <LogOut
                        className="size-[15px] text-current"
                        strokeWidth={2}
                        aria-hidden
                      />
                    ),
                  },
                ],
              }}
              trigger={['click']}
              placement="bottomRight"
            >
              <button type="button" className={styles.profileSection} aria-label="Account menu">
                <div className="hidden flex-col items-start justify-center text-left sm:flex">
                  <span className="text-[13px] font-medium text-[var(--header-fg)] leading-tight">
                    {user?.name || 'User'}
                  </span>
                  <span className="mt-0.5 text-[11.5px] text-[var(--header-muted)] leading-tight">
                    {formatRole(user?.role)}
                  </span>
                </div>
                <div className={styles.avatarWrapper}>
                  {user?.avatarUrl ? (
                    <Image
                      src={user.avatarUrl}
                      alt={user.name || 'User'}
                      width={32}
                      height={32}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-[var(--ochre-500)] flex items-center justify-center text-[var(--on-primary)] font-semibold text-sm">
                      {(user?.name || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <ChevronDown className="hidden size-4 text-[var(--header-muted)] sm:block" aria-hidden />
              </button>
            </Dropdown>
          </div>
        </Header>
        <Content
          id="main-content"
          tabIndex={-1}
          className={`flex min-h-0 flex-1 flex-col p-4 sm:p-6 lg:px-8 lg:py-7 ${styles.content} ${isInventoryListPage ? styles.contentInventoryList : ""}`}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
