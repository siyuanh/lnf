"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/use-t";

export default function CaregiverSignupPage() {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await authClient.signUp.email({ email, password, name: email });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? t("signup.failed"));
      return;
    }
    router.push("/caregiver/people");
  }

  return (
    <main style={{ maxWidth: 360, margin: "64px auto", fontFamily: "system-ui" }}>
      <h1>{t("signup.title")}</h1>
      <form onSubmit={onSubmit}>
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
      </form>
      <p style={{ marginTop: 16, fontSize: 13, color: "#666" }}>
        {t("signup.haveAccount")} <Link href="/caregiver/login">{t("signup.signIn")}</Link>
      </p>
    </main>
  );
}
