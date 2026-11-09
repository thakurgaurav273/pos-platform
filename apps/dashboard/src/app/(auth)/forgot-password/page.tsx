'use client';

import { FluxenLogo } from '@/components/FluxenLogo/FluxenLogo';
import { App, Button, Card, Form, Input } from 'antd';
import {
    ArrowLeft,
    ArrowRight,
    CheckCircle,
    KeyRound,
    Loader2,
    LockKeyhole,
    RotateCcwKey,
    UserIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from '@/lib/api';
import styles from './styles.module.css';

// ─── OTP digit-input widget ────────────────────────────────────────────────
const OtpInput = ({
    value = '',
    onChange,
    disabled,
}: {
    value?: string;
    onChange?: (v: string) => void;
    disabled?: boolean;
}) => {
    const [digits, setDigits] = useState<string[]>(() =>
        [...(value || '').split(''), ...Array(6).fill('')].slice(0, 6),
    );
    const refs = useRef<(HTMLInputElement | null)[]>([]);

    const update = (index: number, val: string) => {
        if (val && !/^\d$/.test(val)) return;
        const next = [...digits];
        next[index] = val;
        setDigits(next);
        onChange?.(next.join(''));
        if (val && index < 5) refs.current[index + 1]?.focus();
    };

    const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !digits[index] && index > 0)
            refs.current[index - 1]?.focus();
    };

    const onPaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
        const next = [...digits];
        pasted.forEach((c, i) => { next[i] = c; });
        setDigits(next);
        onChange?.(next.join(''));
        refs.current[Math.min(pasted.length, 5)]?.focus();
    };

    return (
        <div className="flex items-center gap-2 justify-center">
            {Array.from({ length: 6 }).map((_, i) => (
                <Input
                    key={i}
                    ref={(el) => { refs.current[i] = el?.input ?? null; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className={styles.otp_input}
                    autoFocus={i === 0}
                    value={digits[i]}
                    disabled={disabled}
                    onChange={(e) => update(i, e.target.value)}
                    onKeyDown={(e) => onKeyDown(i, e)}
                    onPaste={onPaste}
                />
            ))}
        </div>
    );
};

// ─── Countdown timer hook ──────────────────────────────────────────────────
function useCountdown(seconds: number) {
    const [remaining, setRemaining] = useState(seconds);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const start = (s: number) => {
        setRemaining(s);
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
            setRemaining((r) => {
                if (r <= 1) {
                    clearInterval(intervalRef.current!);
                    intervalRef.current = null;
                    return 0;
                }
                return r - 1;
            });
        }, 1000);
    };

    useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

    return { remaining, start };
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function ForgotPasswordPage() {
    const { message } = App.useApp();
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const { remaining, start: startTimer } = useCountdown(0);

    // ── Step 1: send OTP ──────────────────────────────────────────────────
    const sendOtp = async (values: { email: string }) => {
        setLoading(true);
        try {
            const res = await fetch(`${getApiBaseUrl()}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: values.email }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 429) {
                message.warning(`Please wait ${data.seconds_remaining ?? 60}s before resending.`);
                startTimer(data.seconds_remaining ?? 60);
                return;
            }
            if (!res.ok) {
                message.error(data.message ?? 'Something went wrong');
                return;
            }
            setEmail(values.email);
            startTimer(60);
            setStep(2);
        } finally {
            setLoading(false);
        }
    };

    // ── Resend OTP ─────────────────────────────────────────────────────────
    const resendOtp = async () => {
        if (remaining > 0) return;
        setLoading(true);
        try {
            const res = await fetch(`${getApiBaseUrl()}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 429) {
                message.warning(`Please wait ${data.seconds_remaining ?? 60}s`);
                startTimer(data.seconds_remaining ?? 60);
                return;
            }
            if (!res.ok) { message.error(data.message ?? 'Could not resend'); return; }
            message.success('OTP resent!');
            startTimer(60);
        } finally {
            setLoading(false);
        }
    };

    // ── Step 2: verify OTP ────────────────────────────────────────────────
    const verifyOtp = async () => {
        if (otp.length < 6) { message.error('Enter the 6-digit OTP'); return; }
        setLoading(true);
        try {
            // POST reset-password with a placeholder newPassword to just check the OTP
            // Instead, use verify-reset-password which only checks OTP and deletes it
            const res = await fetch(`${getApiBaseUrl()}/auth/verify-reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                message.error(data.message ?? 'Invalid or expired OTP');
                return;
            }
            setStep(3);
        } finally {
            setLoading(false);
        }
    };

    // ── Step 3: set new password ──────────────────────────────────────────
    const resetPassword = async (values: { newPassword: string; confirm: string }) => {
        if (values.newPassword !== values.confirm) {
            message.error('Passwords do not match');
            return;
        }
        setLoading(true);
        try {
            // At this point the OTP has been consumed; we need a verified token approach.
            // Since verifyResetPasswordOTP deletes the OTP, we re-use the fact that if we 
            // get here the OTP was valid. The backend resetPassword endpoint also checks OTP
            // so we pass a special "already-verified" flow - instead we'll call a lightweight
            // PATCH on the user endpoint. For now, use the direct reset with the already-
            // verified token stored server-side via a short-lived "verified" key.
            const res = await fetch(`${getApiBaseUrl()}/auth/reset-password-verified`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, newPassword: values.newPassword }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                message.error(data.message ?? 'Could not reset password');
                return;
            }
            setStep(4);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-screen w-full">
            <div className="flex flex-col justify-center h-[80px]">
                <h1 className="flex justify-center p-4"><FluxenLogo size={34} /></h1>
            </div>

            <div className="flex justify-center items-center h-full">


                {step === 1 && (
                    <Card className={styles.card}>
                        <div className="flex justify-center items-center rounded-full p-2">
                            <RotateCcwKey className="w-10 h-10 text-[var(--bistre-500)] bg-[var(--linen-95)] rounded-[var(--ui-radius-md)] p-1" />
                        </div>
                        <p className="font-bold text-lg text-[var(--bistre-500)] text-center mt-2">
                            FORGOT PASSWORD?
                        </p>
                        <p className="text-sm text-[var(--bistre-400)] text-center mt-1 mb-2">
                            Enter your email to receive a reset OTP
                        </p>
                        <Form onFinish={sendOtp} className={styles.form_container}>
                            <p className="font-bold text-xs text-[var(--bistre-500)]">EMAIL</p>
                            <Form.Item
                                className={styles.form_item}
                                name="email"
                                rules={[
                                    { required: true, message: 'Please enter your email' },
                                    { type: 'email', message: 'Enter a valid email' },
                                ]}
                            >
                                <Input
                                    placeholder="your@email.com"
                                    className={styles.input}
                                    prefix={<UserIcon className="text-[var(--bistre-500)]" height={16} width={16} />}
                                />
                            </Form.Item>
                            <Button
                                type="primary"
                                htmlType="submit"
                                className={styles.login_button}
                                loading={loading}
                                icon={<ArrowRight className="w-4 h-4" />}
                            >
                                Send OTP
                            </Button>
                            <Link href="/login" className="flex items-center gap-2 h-[40px] mt-5">
                                <ArrowLeft className="w-4 h-4 text-[var(--bistre-500)]" />
                                <p className="text-sm text-[var(--bistre-500)]">Back to Login</p>
                            </Link>
                        </Form>
                    </Card>
                )}


                {step === 2 && (
                    <Card className={styles.card}>
                        <div className="flex justify-center items-center rounded-full p-2">
                            <CheckCircle className="w-10 h-10 text-[var(--bistre-500)]" />
                        </div>
                        <p className="font-bold text-lg text-[var(--bistre-500)] text-center mt-2">
                            OTP SENT TO YOUR EMAIL
                        </p>
                        <p className="text-sm text-[var(--bistre-400)] text-center mt-1">
                            Check <span className="font-semibold text-[var(--bistre-600)]">{email}</span> for the 6-digit code
                        </p>

                        <div className={styles.form_container}>
                            <OtpInput value={otp} onChange={setOtp} disabled={loading} />


                            <div className="flex items-center justify-center gap-2 mt-4 mb-2 text-sm">
                                {remaining > 0 ? (
                                    <span className="text-[var(--bistre-400)]">
                                        Resend in <span className="font-semibold tabular-nums text-[var(--ochre-600)]">{remaining}s</span>
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={resendOtp}
                                        disabled={loading}
                                        className="text-[var(--ochre-600)] font-semibold hover:underline disabled:opacity-40"
                                    >
                                        Resend OTP
                                    </button>
                                )}
                            </div>

                            <Button
                                type="primary"
                                className={styles.login_button}
                                loading={loading}
                                icon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                onClick={verifyOtp}
                            >
                                Verify OTP
                            </Button>

                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="flex items-center gap-2 h-[40px] mt-5 bg-transparent border-none cursor-pointer"
                            >
                                <ArrowLeft className="w-4 h-4 text-[var(--bistre-500)]" />
                                <p className="text-sm text-[var(--bistre-500)]">Change email</p>
                            </button>
                        </div>
                    </Card>
                )}


                {step === 3 && (
                    <Card className={styles.card}>
                        <div className="flex justify-center items-center rounded-full p-2">
                            <LockKeyhole className="w-10 h-10 text-[var(--bistre-500)] bg-[var(--linen-95)] rounded-[var(--ui-radius-md)] p-1" />
                        </div>
                        <p className="font-bold text-lg text-[var(--bistre-500)] text-center mt-2">
                            SET NEW PASSWORD
                        </p>
                        <p className="text-sm text-[var(--bistre-400)] text-center mt-1 mb-2">
                            OTP verified. Choose a strong new password.
                        </p>
                        <Form onFinish={resetPassword} className={styles.form_container}>
                            <Form.Item
                                className={styles.form_item}
                                name="newPassword"
                                rules={[
                                    { required: true, message: 'Enter new password' },
                                    { min: 8, message: 'At least 8 characters' },
                                ]}
                            >
                                <Input.Password
                                    placeholder="New password"
                                    className={styles.input}
                                    prefix={<KeyRound className="text-[var(--bistre-500)]" height={16} width={16} />}
                                />
                            </Form.Item>
                            <Form.Item
                                className={styles.form_item}
                                name="confirm"
                                rules={[{ required: true, message: 'Confirm your password' }]}
                            >
                                <Input.Password
                                    placeholder="Confirm password"
                                    className={styles.input}
                                    prefix={<KeyRound className="text-[var(--bistre-500)]" height={16} width={16} />}
                                />
                            </Form.Item>
                            <Button
                                type="primary"
                                htmlType="submit"
                                className={styles.login_button}
                                loading={loading}
                                icon={<ArrowRight className="w-4 h-4" />}
                            >
                                Reset Password
                            </Button>
                        </Form>
                    </Card>
                )}


                {step === 4 && (
                    <Card className={styles.card}>
                        <div className="flex justify-center items-center rounded-full p-2">
                            <CheckCircle className="w-10 h-10 text-[var(--success)]" />
                        </div>
                        <p className="font-bold text-lg text-[var(--bistre-500)] text-center mt-2">
                            PASSWORD RESET SUCCESSFULLY
                        </p>
                        <p className="text-sm text-[var(--bistre-400)] text-center mt-2">
                            You can now log in with your new password.
                        </p>
                        <Link href="/login">
                            <Button
                                type="primary"
                                className={`${styles.login_button} mt-8`}
                                icon={<ArrowRight className="w-4 h-4" />}
                            >
                                Go to Login
                            </Button>
                        </Link>
                    </Card>
                )}

            </div>
        </div>
    );
}