'use client';

import { App, Button, Checkbox, Form, Input } from 'antd';
import styles from './styles.module.css';
import Link from 'next/link';
import { LockIcon, UserIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiBaseUrl, pinActiveShop } from '@/lib/api';
import { FluxenLogo } from '@/components/FluxenLogo/FluxenLogo';
import { AuthAside, AUTH_POINTS } from '@/components/AuthAside/AuthAside';

const LoginPage = () => {
  const { message } = App.useApp();
  const router = useRouter();
  const { setAuth } = useAuth();

  const [demoLoading, setDemoLoading] = useState(false);

  /** Shared by password login and the demo: store the session and open the dashboard. */
  const finishLogin = async (res: Response, failure: string) => {
    const data = await res.json().catch(() => null);
    if (res.ok && data?.access_token) {
      pinActiveShop(data.user?.shopCode);
      setAuth(data.access_token, data.user ?? null);
      router.replace('/dashboard');
    } else {
      message.error(res.ok ? failure : (data?.message ?? failure));
    }
  };

  const onFinish = (values: { email: string; password: string }) => {
    fetch(`${getApiBaseUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
      .then((res) => finishLogin(res, 'Login failed'))
      .catch(() => message.error('Login failed'));
  };

  const tryDemo = () => {
    setDemoLoading(true);
    fetch(`${getApiBaseUrl()}/demo/session`, { method: 'POST' })
      .then((res) => finishLogin(res, 'The demo is not available right now.'))
      .catch(() => message.error('The demo is not available right now.'))
      .finally(() => setDemoLoading(false));
  };

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <header className={styles.topBar}>
          <Link href="/" className={styles.topLogoWrap} aria-label="Fluxen POS home">
            <span className={styles.logoDesk}>
              <FluxenLogo size={34} tone="light" />
            </span>
            <span className={styles.logoMob}>
              <FluxenLogo size={34} />
            </span>
          </Link>
          <Link href="/" className={styles.topTagline}>
            Back to home
          </Link>
        </header>

        <div className={styles.splitCard}>
          <AuthAside heading="Pick up where the day left off." points={AUTH_POINTS} />

          <div className={styles.formPane}>
            <div className={styles.formInner}>
              <h1 className={styles.formTitle}>Welcome back</h1>
              <p className={styles.formSub}>Sign in to your Fluxen POS account</p>

              <Form layout="vertical" requiredMark={false} onFinish={onFinish} className={styles.form}>
                <label className={styles.label} htmlFor="login-email">
                  Username or Email
                </label>
                <Form.Item
                  className={styles.formItem}
                  name="email"
                  rules={[{ required: true, message: 'Please enter your email or username.' }]}
                >
                  <Input
                    id="login-email"
                    autoComplete="username"
                    placeholder="Enter your email"
                    className={styles.input}
                    suffix={<UserIcon className={styles.inputIcon} height={18} width={18} aria-hidden />}
                  />
                </Form.Item>

                <label className={styles.label} htmlFor="login-password">
                  Password
                </label>
                <Form.Item
                  className={styles.formItem}
                  name="password"
                  rules={[{ required: true, message: 'Please enter your password.' }]}
                >
                  <Input.Password
                    id="login-password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={styles.input}
                    visibilityToggle={false}
                    suffix={<LockIcon className={styles.inputIcon} height={18} width={18} aria-hidden />}
                  />
                </Form.Item>

                <div className={styles.row}>
                  <Checkbox className={styles.checkbox}>Remember me</Checkbox>
                  <Link href="/forgot-password" className={styles.forgotLink}>
                    Forgot password?
                  </Link>
                </div>

                <Button type="primary" htmlType="submit" className={styles.loginButton}>
                  Sign In
                </Button>

                <Button
                  htmlType="button"
                  className={styles.demoButton}
                  loading={demoLoading}
                  onClick={tryDemo}
                >
                  Try the demo
                </Button>
                <p className={styles.demoHint}>
                  Explore a ready-made shop with sample products and sales. No setup needed.
                </p>

                <p className={styles.joinRow}>
                  Don&apos;t have an account?{' '}
                  <Link href="/signup" className={styles.joinLink}>
                    Create one
                  </Link>
                </p>
              </Form>
            </div>
          </div>
        </div>

        <footer className={styles.footer}>
          <nav className={styles.footerNav} aria-label="Legal">
            <Link href="/privacy" className={styles.footerLink}>
              Privacy Policy
            </Link>
            <Link href="/terms" className={styles.footerLink}>
              Terms of Service
            </Link>
            <Link href="/contact" className={styles.footerLink}>
              Contact Us
            </Link>
          </nav>
          <p className={styles.copyright}>
            © 2026 Fluxen POS. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default LoginPage;
