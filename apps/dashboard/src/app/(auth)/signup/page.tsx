'use client';

import { useEffect, useState } from 'react';
import { App, Button, Form, Input } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Lock, Mail, Phone, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiBaseUrl, pinActiveShop } from '@/lib/api';
import { indianMobileOptionalRules, normalizeMobileFormValue } from '@/lib/mobileNumber';
import { FluxenLogo } from '@/components/FluxenLogo/FluxenLogo';
import { AuthAside, AUTH_POINTS } from '@/components/AuthAside/AuthAside';
import loginStyles from '../login/styles.module.css';
import styles from './signup.module.css';

type SignupValues = {
  businessName: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
  confirm: string;
};

function errorMessage(data: { message?: unknown }, fallback: string): string {
  const msg = Array.isArray(data?.message) ? data.message[0] : data?.message;
  return typeof msg === 'string' ? msg : fallback;
}

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export default function SignupPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const { setAuth } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  // Last submitted form, so "Change email" brings the user back to a filled form.
  const [details, setDetails] = useState<SignupValues | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const onFinish = async (values: SignupValues) => {
    setSubmitting(true);
    try {
      const { res, data } = await postJson('/organizations/signup', {
        businessName: values.businessName,
        name: values.name,
        email: values.email,
        phone: values.phone || undefined,
        password: values.password,
      });
      if (res.ok && data?.email) {
        setDetails(values);
        setPendingEmail(data.email);
        setCode('');
        setResendIn(data.resendInSeconds ?? 60);
        return;
      }
      message.error(errorMessage(data, 'We could not create your account. Please try again.'));
    } catch {
      message.error('We could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async (otp: string) => {
    if (!pendingEmail || otp.length !== 6) return;
    setSubmitting(true);
    try {
      const { res, data } = await postJson('/organizations/signup/verify', { email: pendingEmail, otp });
      if (res.ok && data?.access_token) {
        pinActiveShop(data.user?.shopCode);
        setAuth(data.access_token, data.user ?? null);
        router.replace('/onboarding');
        return;
      }
      if (res.status === 410) setPendingEmail(null);
      setCode('');
      message.error(errorMessage(data, 'We could not verify that code. Please try again.'));
    } catch {
      message.error('We could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (!pendingEmail) return;
    setSubmitting(true);
    try {
      const { res, data } = await postJson('/organizations/signup/resend', { email: pendingEmail });
      if (res.ok) {
        setCode('');
        setResendIn(data.resendInSeconds ?? 60);
        message.success('We sent a new code.');
        return;
      }
      if (res.status === 429 && data?.seconds_remaining) setResendIn(data.seconds_remaining);
      if (res.status === 410) setPendingEmail(null);
      message.error(errorMessage(data, 'We could not send a new code. Please try again.'));
    } catch {
      message.error('We could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`${loginStyles.page} ${styles.compact}`}>
      <div className={loginStyles.layout}>
        <header className={loginStyles.topBar}>
          <Link href="/" className={loginStyles.topLogoWrap} aria-label="Fluxen POS home">
            <span className={loginStyles.logoDesk}>
              <FluxenLogo size={34} tone="light" />
            </span>
            <span className={loginStyles.logoMob}>
              <FluxenLogo size={34} />
            </span>
          </Link>
          <Link href="/" className={loginStyles.topTagline}>
            Back to home
          </Link>
        </header>

        <div className={loginStyles.splitCard}>
          <AuthAside heading="One account for your factory and every shop." points={AUTH_POINTS} />

          <div className={loginStyles.formPane}>
            <div className={`${loginStyles.formInner} ${styles.wide}`}>
              {pendingEmail ? (
                <>
              <button type="button" className={styles.backLink} onClick={() => setPendingEmail(null)} disabled={submitting}>
                <ArrowLeft size={16} aria-hidden /> Change details
              </button>
              <h1 className={`${loginStyles.formTitle} ${styles.title}`}>Check your email</h1>
              <p className={loginStyles.formSub}>
                We sent a 6-digit code to <strong>{pendingEmail}</strong>. Enter it to create your account.
              </p>
              <div className={styles.otpRow}>
                <Input.OTP
                  length={6}
                  value={code}
                  onChange={(v) => {
                    setCode(v);
                    void verify(v);
                  }}
                  disabled={submitting}
                  autoFocus
                  aria-label="Verification code"
                />
              </div>
              <Button
                type="primary"
                loading={submitting}
                disabled={code.length !== 6}
                onClick={() => void verify(code)}
                className={loginStyles.loginButton}
              >
                Verify and create account
              </Button>
              <p className={loginStyles.joinRow}>
                Didn&apos;t get it? Check spam, or{' '}
                <button type="button" className={`${loginStyles.joinLink} ${styles.linkButton}`} onClick={() => void resend()} disabled={submitting || resendIn > 0}>
                  {resendIn > 0 ? `send a new code in ${resendIn}s` : 'send a new code'}
                </button>
              </p>
                </>
              ) : (
                <>
              <h1 className={`${loginStyles.formTitle} ${styles.title}`}>Create your account</h1>
              <p className={loginStyles.formSub}>Start with your business. You will add shops next.</p>

              <Form<SignupValues>
                initialValues={details ?? undefined}
                layout="vertical"
                requiredMark={false}
                onFinish={onFinish}
                className={loginStyles.form}
                disabled={submitting}
              >
                <div className={styles.row2}>
                  <div>
<label className={loginStyles.label} htmlFor="su-business">
                  Business name
                </label>
                <Form.Item
                  className={loginStyles.formItem}
                  name="businessName"
                  rules={[
                    { required: true, message: 'Enter your business name.' },
                    { min: 2, message: 'Business name is too short.' },
                  ]}
                >
                  <Input id="su-business" autoComplete="organization" placeholder="e.g. Sharma Sweets" className={loginStyles.input} suffix={<Building2 className={loginStyles.inputIcon} size={18} aria-hidden />} />
                </Form.Item>
                  </div>
                  <div>
<label className={loginStyles.label} htmlFor="su-name">
                  Your name
                </label>
                <Form.Item className={loginStyles.formItem} name="name" rules={[{ required: true, message: 'Enter your name.' }]}>
                  <Input id="su-name" autoComplete="name" placeholder="Full name" className={loginStyles.input} suffix={<User className={loginStyles.inputIcon} size={18} aria-hidden />} />
                </Form.Item>
                  </div>
                </div>

                <div className={styles.row2}>
                  <div>
<label className={loginStyles.label} htmlFor="su-email">
                  Email
                </label>
                <Form.Item
                  className={loginStyles.formItem}
                  name="email"
                  rules={[
                    { required: true, message: 'Enter your email.' },
                    { type: 'email', message: 'Enter a valid email address.' },
                  ]}
                >
                  <Input id="su-email" type="email" autoComplete="email" placeholder="you@business.com" className={loginStyles.input} suffix={<Mail className={loginStyles.inputIcon} size={18} aria-hidden />} />
                </Form.Item>
                  </div>
                  <div>
<label className={loginStyles.label} htmlFor="su-phone">
                  Mobile <span className={styles.optional}>(optional)</span>
                </label>
                <Form.Item
                  className={loginStyles.formItem}
                  name="phone"
                  normalize={normalizeMobileFormValue}
                  rules={indianMobileOptionalRules}
                >
                  <Input id="su-phone" inputMode="numeric" autoComplete="tel-national" placeholder="10 digits" maxLength={10} className={loginStyles.input} suffix={<Phone className={loginStyles.inputIcon} size={18} aria-hidden />} />
                </Form.Item>
                  </div>
                </div>

                <div className={styles.row2}>
                  <div>
<label className={loginStyles.label} htmlFor="su-password">
                  Password
                </label>
                <Form.Item
                  className={loginStyles.formItem}
                  name="password"
                  rules={[
                    { required: true, message: 'Choose a password.' },
                    { min: 8, message: 'Use at least 8 characters.' },
                    { max: 72, message: 'Use at most 72 characters.' },
                  ]}
                >
                  <Input.Password id="su-password" autoComplete="new-password" placeholder="8+ characters" className={loginStyles.input} suffix={<Lock className={loginStyles.inputIcon} size={18} aria-hidden />} visibilityToggle={false} />
                </Form.Item>
                  </div>
                  <div>
<label className={loginStyles.label} htmlFor="su-confirm">
                  Confirm password
                </label>
                <Form.Item
                  className={loginStyles.formItem}
                  name="confirm"
                  dependencies={['password']}
                  rules={[
                    { required: true, message: 'Re-enter your password.' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('password') === value) return Promise.resolve();
                        return Promise.reject(new Error('Passwords do not match.'));
                      },
                    }),
                  ]}
                >
                  <Input.Password id="su-confirm" autoComplete="new-password" placeholder="Repeat password" className={loginStyles.input} suffix={<Lock className={loginStyles.inputIcon} size={18} aria-hidden />} visibilityToggle={false} />
                </Form.Item>
                  </div>
                </div>

                <Button type="primary" htmlType="submit" loading={submitting} className={loginStyles.loginButton}>
                  Create account
                </Button>
                <p className={loginStyles.demoHint}>
                  14-day free trial. No card needed.
                </p>
                <p className={loginStyles.demoHint}>
                  By creating an account you agree to our{' '}
                  <Link href="/terms" className={loginStyles.joinLink}>
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className={loginStyles.joinLink}>
                    Privacy Policy
                  </Link>
                  .
                </p>

                <p className={loginStyles.joinRow}>
                  Already have an account?{' '}
                  <Link href="/login" className={loginStyles.joinLink}>
                    Sign in
                  </Link>
                </p>
              </Form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
