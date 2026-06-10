"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/use-t";

export default function PartnerLoginPage() {
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
    const res = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? t("login.failed"));
      return;
    }
    router.push("/partner/batches");
  }

  return (
    <main style={{ maxWidth: 360, margin: "64px auto", fontFamily: "system-ui" }}>
      <h1>{t("login.title")}</h1>
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
    </main>
  );
}
