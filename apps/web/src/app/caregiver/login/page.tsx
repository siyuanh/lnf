"use client";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/use-t";
import { safeNext } from "@/lib/safe-next";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { getPublicConfig } from "@/lib/config";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);
  const expired = params.get("expired") === "1";
  const next = safeNext(params.get("next"));

  useEffect(() => {
    getPublicConfig().then((config) => setGoogleEnabled(config.googleSignInEnabled));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? t("login.failed"));
      return;
    }
    router.push(next ?? "/caregiver/people");
  }

  return (
    <main style={{ maxWidth: 360, margin: "64px auto", fontFamily: "system-ui" }}>
      <h1>{t("caregiverLogin.title")}</h1>
      {expired && (
        <p style={{ background: "#fff3cd", border: "1px solid #ffe69c", padding: 10, borderRadius: 4 }}>
          {t("login.expired")}
        </p>
      )}
      <form onSubmit={onSubmit}>
        <label style={{ display: "block", marginBottom: 12 }}>
          {t("login.email")}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          {t("login.password")}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? t("login.submitting") : t("login.submit")}
        </button>
      </form>
      {googleEnabled && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0", color: "#999", fontSize: 12 }}>
            <hr style={{ flex: 1 }} />
            {t("oauth.or")}
            <hr style={{ flex: 1 }} />
          </div>
          <GoogleSignInButton
            callbackURL={next ?? "/caregiver/people"}
            label={t("oauth.google")}
          />
        </>
      )}
      <p style={{ marginTop: 16, fontSize: 13, color: "#666" }}>
        {t("caregiverLogin.noAccount")}{" "}
        <Link href={next ? `/caregiver/signup?next=${encodeURIComponent(next)}` : "/caregiver/signup"}>
          {t("caregiverLogin.signUp")}
        </Link>
      </p>
    </main>
  );
}

export default function CaregiverLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
