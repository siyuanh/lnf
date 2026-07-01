"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/use-t";

type ContactKind = "phone" | "email" | "address";
interface Contact {
  id: string;
  kind: ContactKind;
  label: string | null;
  value: string;
}

export default function PairForm({ code }: { code: string }) {
  const t = useT();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [contactId, setContactId] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/caregiver/contacts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        const list = data.contacts as Contact[];
        setContacts(list);
        // Pre-select first contact so a one-tap "Pair" is the common path.
        if (list.length > 0) setContactId(list[0]!.id);
      })
      .catch(() => setContacts([]));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch(`/api/caregiver/tags/${encodeURIComponent(code)}/pair`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contactId,
        label: label.trim() ? label.trim() : undefined,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
      return;
    }
    if (res.status === 409) {
      setError(t("pair.conflict"));
      return;
    }
    setError(t("pair.error"));
  }

  if (done) {
    return (
      <main style={{ maxWidth: 480, margin: "64px auto", fontFamily: "system-ui", textAlign: "center", padding: 16 }}>
        <h1>{t("pair.success")}</h1>
        <p style={{ marginTop: 16 }}>
          <Link href="/caregiver/contacts">{t("pair.done")}</Link>
        </p>
      </main>
    );
  }

  if (contacts === null) {
    return (
      <main style={{ maxWidth: 480, margin: "64px auto", fontFamily: "system-ui", padding: 16 }}>
        <p>{t("contacts.loading")}</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "64px auto", fontFamily: "system-ui", padding: 16 }}>
      <h1>{t("pair.title")}</h1>
      <p style={{ color: "#444" }}>{t("pair.description")}</p>

      {contacts.length === 0 ? (
        <p>
          {t("pair.noContacts")}{" "}
          <Link href="/caregiver/contacts">{t("pair.addContact")}</Link>
        </p>
      ) : (
        <form onSubmit={onSubmit}>
          <label style={{ display: "block", marginBottom: 12 }}>
            {t("pair.selectContact")}
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              required
              style={{ display: "block", width: "100%", padding: 8 }}
            >
              <option value="">{t("pair.selectPlaceholder")}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {contactLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "block", marginBottom: 12 }}>
            {t("pair.label")}{" "}
            <span style={{ color: "#999", fontSize: 12 }}>{t("pair.labelHint")}</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              style={{ display: "block", width: "100%", padding: 8 }}
            />
          </label>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          <button type="submit" disabled={submitting || !contactId}>
            {submitting ? t("pair.submitting") : t("pair.submit")}
          </button>
        </form>
      )}

      <p style={{ marginTop: 24, fontSize: 12, color: "#999", fontFamily: "monospace" }}>
        {t("finder.tag")}: {code}
      </p>
    </main>
  );
}

function contactLabel(c: Contact): string {
  const prefix = c.kind === "phone" ? "☎" : c.kind === "email" ? "✉" : "🏠";
  const inner = c.label ? `${c.label} — ${c.value}` : c.value;
  return `${prefix} ${inner}`;
}
