"use client";

import { useEffect, useRef, useState } from "react";
import { Form, Input, Button, App } from "antd";
import { Lock, Mail, RefreshCw, Shield, ShieldCheck } from "lucide-react";
import { apiFetch } from "../../../../lib/api";
import styles from "./SecuritySection.module.css";

const OtpInput = ({
  value = "",
  onChange,
  disabled,
}: {
  value?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}) => {
  const [digits, setDigits] = useState<string[]>(() =>
    [...(value || "").split(""), ...Array(6).fill("")].slice(0, 6),
  );
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const update = (i: number, val: string) => {
    if (val && !/^\d$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    onChange?.(next.join(""));
    if (val && i < 5) refs.current[i + 1]?.focus();
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0)
      refs.current[i - 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6)
      .split("");
    const next = [...digits];
    pasted.forEach((c, i) => {
      next[i] = c;
    });
    setDigits(next);
    onChange?.(next.join(""));
    refs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div className="flex items-center justify-center gap-2.5 sm:gap-3 my-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          autoFocus={i === 0}
          value={digits[i]}
          onChange={(e) => update(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          className={[
            "w-10 h-11 sm:w-11 sm:h-12 text-center text-lg sm:text-xl font-bold rounded-lg border-2 outline-none transition-all",
            "text-[var(--bistre-800)] bg-[var(--surface)]",
            digits[i]
              ? "border-[var(--ochre-500)] shadow-[var(--ring)]"
              : "border-[var(--pearl-bush)]",
            "focus:border-[var(--ochre-500)] focus:shadow-[0_0_0_3px_var(--ochre-10)]",
            disabled ? "opacity-50 cursor-not-allowed" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      ))}
    </div>
  );
};

function useCountdown(initial = 0) {
  const [remaining, setRemaining] = useState(initial);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = (s: number) => {
    setRemaining(s);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );
  return { remaining, start };
}

export function SecuritySection() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [otp, setOtp] = useState("");
  const { remaining, start: startTimer } = useCountdown(0);
  const [passwords, setPasswords] = useState({ old: "", new: "" });

  const requestOtp = async () => {
    try {
      await form.validateFields([
        "oldPassword",
        "newPassword",
        "confirmPassword",
      ]);
    } catch {
      return;
    }
    const values = form.getFieldsValue();

    setLoading(true);
    try {
      const res = await apiFetch("/auth/send-change-password-otp", {
        method: "POST",
        body: JSON.stringify({ oldPassword: values.oldPassword }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        message.error(
          data.message || "Could not send OTP. Please try again.",
        );
        return;
      }

      setPasswords({ old: values.oldPassword, new: values.newPassword });
      message.success("OTP sent to your registered email");
      startTimer(60);
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (remaining > 0) return;
    setLoading(true);
    try {
      const res = await apiFetch("/auth/send-change-password-otp", {
        method: "POST",
        body: JSON.stringify({ oldPassword: passwords.old }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(data.message || "Could not resend");
        return;
      }
      message.success("OTP resent!");
      startTimer(60);
    } finally {
      setLoading(false);
    }
  };

  const submitPasswordChange = async () => {
    if (otp.length < 6) {
      message.error("Enter the complete 6-digit OTP");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          oldPassword: passwords.old,
          newPassword: passwords.new,
          otp,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(data.message || "Failed to change password");
        return;
      }
      setStep(3);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    form.resetFields();
    setOtp("");
    setStep(1);
  };

  const lockPrefix = (
    <span className={styles.inputIcon} aria-hidden>
      <Lock className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.75} />
    </span>
  );

  const shieldPrefix = (
    <span className={styles.inputIcon} aria-hidden>
      <Shield className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.75} />
    </span>
  );

  return (
    <div className={styles.root}>
      <Form form={form} layout="vertical" preserve className={styles.form}>
        {step === 1 && (
          <div className={styles.step1Shell}>
            <div className={styles.ledeRow}>
              <div className={styles.ledeIcon} aria-hidden>
                <Shield className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <p className={styles.ledeText}>
                Choose a new password. We’ll email you a one-time code to
                confirm the change.
              </p>
            </div>
            <div className={styles.fieldsGrid}>
              <Form.Item
                className={styles.fullRow}
                label="Current password"
                name="oldPassword"
                rules={[
                  { required: true, message: "Enter your current password" },
                ]}
              >
                <Input.Password
                  prefix={lockPrefix}
                  placeholder="Enter current password"
                  size="large"
                  autoComplete="current-password"
                />
              </Form.Item>
              <Form.Item
                label="New password"
                name="newPassword"
                rules={[
                  { required: true, message: "Enter a new password" },
                  { min: 8, message: "Use at least 8 characters" },
                ]}
              >
                <Input.Password
                  prefix={shieldPrefix}
                  placeholder="At least 8 characters"
                  size="large"
                  autoComplete="new-password"
                />
              </Form.Item>
              <Form.Item
                label="Confirm new password"
                name="confirmPassword"
                dependencies={["newPassword"]}
                rules={[
                  { required: true, message: "Confirm your new password" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue("newPassword") === value)
                        return Promise.resolve();
                      return Promise.reject(
                        new Error("Passwords do not match"),
                      );
                    },
                  }),
                ]}
              >
                <Input.Password
                  prefix={shieldPrefix}
                  placeholder="Same as new password"
                  size="large"
                  autoComplete="new-password"
                />
              </Form.Item>
            </div>
            <Button
              type="primary"
              onClick={requestOtp}
              loading={loading}
              size="large"
              className={styles.submit}
            >
              Send OTP &amp; continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className={styles.step2}>
            <div className={styles.emailCard}>
              <div className={styles.emailIcon} aria-hidden>
                <Mail className="w-6 h-6" strokeWidth={1.75} />
              </div>
              <p className={styles.emailTitle}>Check your email</p>
              <p className={styles.emailDesc}>
                We sent a 6-digit code to your registered address. Enter it
                below to finish updating your password.
              </p>
            </div>

            <OtpInput value={otp} onChange={setOtp} disabled={loading} />

            <div className="flex items-center justify-center mt-3 mb-5 text-sm">
              {remaining > 0 ? (
                <span className="text-[var(--bistre-600)]">
                  Resend in{" "}
                  <span className="font-semibold tabular-nums text-[var(--ochre-700)]">
                    {remaining}s
                  </span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={resendOtp}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-[var(--ochre-600)] font-semibold hover:underline disabled:opacity-40 bg-transparent border-none cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                  Resend OTP
                </button>
              )}
            </div>

            <div className={styles.step2Actions}>
              <Button onClick={() => setStep(1)} size="large">
                Back
              </Button>
              <Button
                type="primary"
                onClick={submitPasswordChange}
                loading={loading}
                size="large"
              >
                Verify &amp; update
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={styles.step3}>
            <div className={styles.successIcon} aria-hidden>
              <ShieldCheck className="w-8 h-8" strokeWidth={1.75} />
            </div>
            <p className={styles.successTitle}>Password updated</p>
            <p className={styles.successDesc}>
              Your password was changed. Use it the next time you sign in.
            </p>
            <Button
              type="primary"
              onClick={reset}
              size="large"
              className={styles.doneBtn}
            >
              Done
            </Button>
          </div>
        )}
      </Form>
    </div>
  );
}
