"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/use-t";
import { safeNext } from "@/lib/safe-next";

// Loose E.164-ish: leading `+` optional, 7–20 chars, digits and separators.
// Real E.164 validation happens server-side + at the SMS provider layer.
const PHONE_RE = /^\+?[\d\s\-().]{7,20}$/;

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const next = safeNext(params.get("next"));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !PHONE_RE.test(trimmedPhone)) {
      setError(t("signup.phoneInvalid"));
      return;
    }
    setLoading(true);
    const res = await authClient.signUp.email({
      email,
      password,
      name: name.trim() || email,
      // Better-Auth accepts additional user fields when registered on the
      // server. Cast because the generated types don't know about `phone`.
      ...(trimmedPhone ? { phone: trimmedPhone } : {}),
    } as Parameters<typeof authClient.signUp.email>[0]);
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? t("signup.failed"));
      return;
    }
    router.push(next ?? "/caregiver/people");
  }

  return (
    <main style={{ maxWidth: 360, margin: "64px auto", fontFamily: "system-ui" }}>
      <h1>{t("signup.title")}</h1>
      <form onSubmit={onSubmit}>
        <label style={{ display: "block", marginBottom: 12 }}>
          {t("signup.name")}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          {t("signup.email")}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          {t("signup.phone")}{" "}
          <span style={{ color: "#999", fontSize: 12 }}>{t("signup.phoneHint")}</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          {t("signup.password")}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? t("signup.submitting") : t("signup.submit")}
        </button>
        <p style={{ marginTop: 8, fontSize: 12, color: "#888" }}>
          {t("signup.verificationNote")}
        </p>
      </form>
      <p style={{ marginTop: 16, fontSize: 13, color: "#666" }}>
        {t("signup.haveAccount")}{" "}
        <Link href={next ? `/caregiver/login?next=${encodeURIComponent(next)}` : "/caregiver/login"}>
          {t("signup.signIn")}
        </Link>
      </p>
    </main>
  );
}

// Suspense wraps useSearchParams to keep Next.js's prerender happy.
export default function CaregiverSignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
