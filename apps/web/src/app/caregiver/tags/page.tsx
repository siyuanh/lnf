"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/use-t";

type ContactKind = "phone" | "email" | "address";
interface TagContact {
  id: string;
  kind: ContactKind;
  label: string | null;
  value: string;
}
interface RegisteredTag {
  code: string;
  label: string | null;
  state: string;
  contact: TagContact | null;
  registeredAt: string | null;
}

export default function TagsPage() {
  const t = useT();
  const [tags, setTags] = useState<RegisteredTag[] | null>(null);

  useEffect(() => {
    fetch("/api/caregiver/tags", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { tags: RegisteredTag[] }) => setTags(data.tags))
      .catch(() => setTags([]));
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "32px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>{t("tags.title")}</h1>
        <Link href="/caregiver/contacts" style={{ fontSize: 13 }}>
          {t("tags.linkToContacts")}
        </Link>
      </div>
      <p style={{ color: "#555", fontSize: 14 }}>{t("tags.subtitle")}</p>

      {tags === null && <p>{t("tags.loading")}</p>}
      {tags !== null && tags.length === 0 && (
        <p>
          {t("tags.empty")}{" "}
          <Link href="/caregiver/contacts">{t("tags.emptyLink")}</Link>
        </p>
      )}
      {tags !== null && tags.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">{t("tags.colCode")}</th>
              <th align="left">{t("tags.colLabel")}</th>
              <th align="left">{t("tags.colContact")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr key={tag.code} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "10px 0", fontFamily: "monospace" }}>{tag.code}</td>
                <td style={{ color: "#555" }}>{tag.label ?? "—"}</td>
                <td style={{ color: "#555" }}>{contactSummary(tag.contact)}</td>
                <td style={{ textAlign: "right" }}>
                  <Link href={`/caregiver/tags/${encodeURIComponent(tag.code)}`}>
                    {t("tags.view")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function contactSummary(c: TagContact | null): string {
  if (!c) return "—";
  const prefix = c.kind === "phone" ? "☎" : c.kind === "email" ? "✉" : "🏠";
  return `${prefix} ${c.label ? `${c.label} — ${c.value}` : c.value}`;
}
