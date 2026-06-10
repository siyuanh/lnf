import { getT } from "@/lib/i18n/server";

interface PageProps {
  params: Promise<{ code: string }>;
}

// Public finder route. Per requirements §5.3, the QR encodes a URL of the
// form https://<domain>/f/<code>. Both the caregiver (with the LNF app
// installed) and a finder (no app) hit this same URL — the system decides
// what to render based on tag state. Until the activation/finding flow is
// built, every code reads as "unactivated".
export default async function FinderPage({ params }: PageProps) {
  const { code } = await params;
  const { t } = await getT();
  return (
    <main style={{ maxWidth: 480, margin: "64px auto", fontFamily: "system-ui", textAlign: "center", padding: 16 }}>
      <h1 style={{ fontSize: 24 }}>{t("finder.title")}</h1>
      <p style={{ color: "#444" }}>{t("finder.body")}</p>
      <p style={{ marginTop: 24, fontSize: 12, color: "#999", fontFamily: "monospace" }}>
        {t("finder.tag")}: {code}
      </p>
    </main>
  );
}
