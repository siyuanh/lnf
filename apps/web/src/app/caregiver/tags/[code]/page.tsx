"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { useT } from "@/lib/i18n/use-t";

type ContactKind = "phone" | "email" | "address";
interface TagContact {
  id: string;
  kind: ContactKind;
  label: string | null;
  value: string;
  createdAt: string;
  updatedAt: string;
}
interface TagDetail {
  code: string;
  label: string | null;
  state: string;
  registeredAt: string | null;
  contact: TagContact | null;
}

export default function TagDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const t = useT();
  const [tag, setTag] = useState<TagDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [qrSrc, setQrSrc] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/caregiver/tags/${encodeURIComponent(code)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: TagDetail) => setTag(data))
      .catch(() => setNotFound(true));
  }, [code]);

  // Render the QR to a data URL client-side. Encodes the public finder URL
  // (/f/<code>) — the same value the printed tag carries.
  useEffect(() => {
    const url = `${window.location.origin}/f/${code}`;
    QRCode.toDataURL(url, { width: 220, margin: 1, errorCorrectionLevel: "M" })
      .then(setQrSrc)
      .catch(() => setQrSrc(null));
  }, [code]);

  if (notFound) {
    return (
      <main style={{ maxWidth: 560, margin: "48px auto", fontFamily: "system-ui", padding: "0 16px" }}>
        <p>{t("tagDetail.notFound")}</p>
        <Link href="/caregiver/tags">{t("tagDetail.back")}</Link>
      </main>
    );
  }

  if (!tag) {
    return (
      <main style={{ maxWidth: 560, margin: "48px auto", fontFamily: "system-ui", padding: "0 16px" }}>
        <p>{t("tagDetail.loading")}</p>
      </main>
    );
  }

  const finderUrl = `${window.location.origin}/f/${tag.code}`;

  return (
    <main style={{ maxWidth: 560, margin: "32px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/caregiver/tags">{t("tagDetail.back")}</Link>
      </p>

      <h1 style={{ marginBottom: 4 }}>{tag.label || t("tagDetail.untitled")}</h1>
      <p style={{ fontFamily: "monospace", color: "#888", marginTop: 0 }}>{tag.code}</p>

      <section style={{ textAlign: "center", margin: "24px 0" }}>
        {qrSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrSrc}
            alt={t("tagDetail.qrAlt")}
            width={220}
            height={220}
            style={{ border: "1px solid #eee", borderRadius: 8 }}
          />
        ) : (
          <div style={{ height: 220 }} />
        )}
        <p style={{ fontSize: 12, color: "#999", fontFamily: "monospace", wordBreak: "break-all" }}>
          {finderUrl}
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16 }}>{t("tagDetail.tagSection")}</h2>
        <Row k={t("tagDetail.state")} v={t(`tagState.${tag.state}` as never)} />
        <Row
          k={t("tagDetail.registeredAt")}
          v={tag.registeredAt ? new Date(tag.registeredAt).toLocaleString() : "—"}
        />
      </section>

      <section>
        <h2 style={{ fontSize: 16 }}>{t("tagDetail.contactSection")}</h2>
        {tag.contact ? (
          <>
            <Row k={t("tagDetail.contactType")} v={t(`contacts.kind${cap(tag.contact.kind)}` as never)} />
            <Row k={t("tagDetail.contactLabel")} v={tag.contact.label ?? "—"} />
            <Row k={t("tagDetail.contactValue")} v={tag.contact.value} />
          </>
        ) : (
          <p style={{ color: "#888" }}>{t("tagDetail.noContact")}</p>
        )}
        <p style={{ marginTop: 12, fontSize: 13 }}>
          <Link href="/caregiver/contacts">{t("tagDetail.manageContacts")}</Link>
        </p>
      </section>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px solid #f2f2f2" }}>
      <span style={{ minWidth: 140, color: "#888" }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
