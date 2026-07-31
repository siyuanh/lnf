"use client";
import { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/use-t";

// §5.6 LGPD self-service: export everything the service holds on you, or
// permanently delete the account. Export is a plain navigation (the API
// responds with an attachment); delete requires the account password.
export default function AccountPage() {
  const t = useT();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function onDelete() {
    if (!window.confirm(t("account.deleteConfirm"))) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/caregiver/account/delete", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error(String(res.status));
      // The session died with the account — land on the public home page.
      window.location.href = "/";
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 560, margin: "32px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>{t("account.title")}</h1>
        <Link href="/caregiver/tags" style={{ fontSize: 13 }}>
          {t("finds.linkToTags")}
        </Link>
      </div>
      <p style={{ color: "#555", fontSize: 14 }}>{t("account.subtitle")}</p>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 17 }}>{t("account.exportTitle")}</h2>
        <p style={{ color: "#555", fontSize: 14 }}>{t("account.exportBody")}</p>
        <a href="/api/caregiver/export">
          <button type="button">{t("account.exportButton")}</button>
        </a>
      </section>

      <section style={{ marginTop: 36, borderTop: "1px solid #eee", paddingTop: 20 }}>
        <h2 style={{ fontSize: 17, color: "#a00" }}>{t("account.deleteTitle")}</h2>
        <p style={{ color: "#555", fontSize: 14 }}>{t("account.deleteBody")}</p>
        <label style={{ display: "block", fontSize: 13, marginBottom: 8 }}>
          {t("account.password")}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: 6, width: 260 }}
            autoComplete="current-password"
          />
        </label>
        <button type="button" disabled={busy || password.length === 0} onClick={onDelete}>
          {t("account.deleteSubmit")}
        </button>
        {error && <p style={{ color: "#b00" }}>{t("account.deleteFailed")}</p>}
      </section>
    </main>
  );
}
