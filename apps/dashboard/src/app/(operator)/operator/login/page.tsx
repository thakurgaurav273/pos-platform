"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "antd";
import { ShieldCheck } from "lucide-react";
import styles from "@/components/Operator/Operator.module.css";
import {
  parseSession,
  publicRequest,
  readSessionRaw,
  saveSession,
  type OperatorInfo,
} from "@/lib/operatorSession";

type Step = "credentials" | "verify" | "enroll";
type Session = { token: string; expiresInMinutes: number; operator: OperatorInfo };
type Enrol = { secret: string; qrDataUrl: string };

export default function OperatorLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [enrol, setEnrol] = useState<Enrol | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in: go straight to the console.
  useEffect(() => {
    if (parseSession(readSessionRaw())) router.replace("/operator");
  }, [router]);

  const fail = (message: string | null) => setError(message ?? "Something went wrong.");

  const submitCredentials = async () => {
    setBusy(true);
    setError(null);
    const r = await publicRequest<{ mode: "verify" | "enroll"; challengeToken: string }>(
      "/auth/login",
      { email, password },
    );
    if (!r.ok || !r.data) {
      setBusy(false);
      return fail(r.message);
    }
    setChallenge(r.data.challengeToken);
    if (r.data.mode === "enroll") {
      const e = await publicRequest<Enrol>("/auth/enroll/start", {
        challengeToken: r.data.challengeToken,
      });
      setBusy(false);
      if (!e.ok || !e.data) return fail(e.message);
      setEnrol(e.data);
      setStep("enroll");
    } else {
      setBusy(false);
      setStep("verify");
    }
    setPassword("");
  };

  const submitCode = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    const r = await publicRequest<Session>(
      step === "enroll" ? "/auth/enroll/confirm" : "/auth/verify",
      { challengeToken: challenge, code },
    );
    setBusy(false);
    setCode("");
    if (!r.ok || !r.data) {
      // An expired step means starting over.
      if (r.status === 401 && /expired/i.test(r.message ?? "")) back();
      return fail(r.message);
    }
    saveSession(r.data.token, r.data.operator, r.data.expiresInMinutes);
    router.replace("/operator");
  };

  const back = () => {
    setStep("credentials");
    setChallenge("");
    setEnrol(null);
    setCode("");
  };

  const codeField = (cta: string) => (
    <>
      <label className={styles.loginLabel} htmlFor="op-code">
        6-digit code
      </label>
      <Input
        id="op-code"
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        onPressEnter={() => void submitCode()}
        style={{ textAlign: "center", fontSize: 18, letterSpacing: "0.4em" }}
      />
      <Button
        type="primary"
        block
        size="large"
        loading={busy}
        disabled={code.length !== 6}
        onClick={() => void submitCode()}
        style={{ marginTop: 14 }}
      >
        {cta}
      </Button>
      <button type="button" className={styles.linkBtn} onClick={back}>
        ← Use a different account
      </button>
    </>
  );

  return (
    <div className={styles.loginBg}>
      <div className={styles.loginCard}>
        <div className={styles.loginBrand}>
          <span className={styles.brandMark}>
            <ShieldCheck size={18} aria-hidden />
          </span>
          <span>
            <span className={styles.brandName} style={{ color: "#111827" }}>
              Fluxen Admin
            </span>
            <span className={styles.brandSub} style={{ color: "#6b7280" }}>
              Operator console
            </span>
          </span>
        </div>

        {step === "credentials" ? (
          <>
            <h1 className={styles.loginTitle}>Sign in</h1>
            <p className={styles.loginSub}>
              Manage businesses, trials and plans. This area is for platform operators only.
            </p>
            {error ? (
              <p role="alert" className={styles.loginError}>
                {error}
              </p>
            ) : null}
            <label className={styles.loginLabel} htmlFor="op-email">
              Email
            </label>
            <Input
              id="op-email"
              autoFocus
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onPressEnter={() => void submitCredentials()}
            />
            <label className={styles.loginLabel} htmlFor="op-password" style={{ marginTop: 14 }}>
              Password
            </label>
            <Input.Password
              id="op-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onPressEnter={() => void submitCredentials()}
            />
            <Button
              type="primary"
              block
              size="large"
              loading={busy}
              disabled={!email || !password}
              onClick={() => void submitCredentials()}
              style={{ marginTop: 18 }}
            >
              Continue
            </Button>
          </>
        ) : null}

        {step === "verify" ? (
          <>
            <h1 className={styles.loginTitle}>Two-step verification</h1>
            <p className={styles.loginSub}>
              Open your authenticator app and enter the current 6-digit code.
            </p>
            {error ? (
              <p role="alert" className={styles.loginError}>
                {error}
              </p>
            ) : null}
            {codeField("Verify and sign in")}
          </>
        ) : null}

        {step === "enroll" && enrol ? (
          <>
            <h1 className={styles.loginTitle}>Set up your authenticator</h1>
            <p className={styles.loginSub}>
              Scan this QR code with Google Authenticator, Authy or 1Password, then enter the code
              it shows. You only do this once.
            </p>
            {error ? (
              <p role="alert" className={styles.loginError}>
                {error}
              </p>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL, nothing to optimise */}
            <img
              src={enrol.qrDataUrl}
              alt="Authenticator QR code"
              width={200}
              height={200}
              className={styles.qr}
            />
            <span className={styles.loginSub} style={{ display: "block", margin: 0, textAlign: "center" }}>
              Can&apos;t scan? Enter this key:
            </span>
            <code className={styles.secret}>{enrol.secret}</code>
            {codeField("Turn on and sign in")}
          </>
        ) : null}
      </div>
    </div>
  );
}
