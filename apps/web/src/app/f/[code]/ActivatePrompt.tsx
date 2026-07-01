import Link from "next/link";
import { getT } from "@/lib/i18n/server";

// Rendered when a scanner hits /f/<code> for a pairable tag but has no
// caregiver session. Deliberately not a form: we ask them to sign in first,
// carrying a `next` param so login/signup can redirect back to this same URL
// and the pair flow picks up automatically.
export default async function ActivatePrompt({ code }: { code: string }) {
  const { t } = await getT();
  const next = encodeURIComponent(`/f/${code}`);
  return (
    <main style={{ maxWidth: 480, margin: "48px auto", fontFamily: "system-ui", padding: 16 }}>
      <h1 style={{ fontSize: 22 }}>{t("activate.title")}</h1>
      <p style={{ color: "#444" }}>{t("activate.body")}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <Link
          href={`/caregiver/login?next=${next}`}
          style={{
            flex: 1,
            padding: "10px 12px",
            textAlign: "center",
            background: "#0b6",
            color: "white",
            borderRadius: 6,
            textDecoration: "none",
          }}
        >
          {t("activate.signIn")}
        </Link>
        <Link
          href={`/caregiver/signup?next=${next}`}
          style={{
            flex: 1,
            padding: "10px 12px",
            textAlign: "center",
            border: "1px solid #999",
            borderRadius: 6,
            textDecoration: "none",
            color: "#333",
          }}
        >
          {t("activate.signUp")}
        </Link>
      </div>
      <p style={{ marginTop: 24, fontSize: 12, color: "#999", fontFamily: "monospace", textAlign: "center" }}>
        {t("finder.tag")}: {code}
      </p>
    </main>
  );
}
