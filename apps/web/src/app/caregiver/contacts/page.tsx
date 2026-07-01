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
  createdAt: string;
  updatedAt: string;
}

export default function ContactsPage() {
  const t = useT();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [kind, setKind] = useState<ContactKind>("phone");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // id being edited → its draft state
  const [editing, setEditing] = useState<{ id: string; label: string; value: string } | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/caregiver/contacts", { credentials: "include" });
    if (!res.ok) {
      setContacts([]);
      return;
    }
    const data = (await res.json()) as { contacts: Contact[] };
    setContacts(data.contacts);
  }

  useEffect(() => {
    load();
  }, []);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/caregiver/contacts", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind,
        label: label.trim() ? label.trim() : undefined,
        value: value.trim(),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(t("contacts.addError"));
      return;
    }
    setLabel("");
    setValue("");
    load();
  }

  function startEdit(c: Contact) {
    setEditing({ id: c.id, label: c.label ?? "", value: c.value });
    setRowError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    setRowBusy(editing.id);
    setRowError(null);
    const res = await fetch(`/api/caregiver/contacts/${encodeURIComponent(editing.id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: editing.label.trim() ? editing.label.trim() : null,
        value: editing.value.trim(),
      }),
    });
    setRowBusy(null);
    if (!res.ok) {
      setRowError(t("contacts.updateError"));
      return;
    }
    setEditing(null);
    load();
  }

  async function del(id: string) {
    if (!confirm(t("contacts.confirmDelete"))) return;
    setRowBusy(id);
    setRowError(null);
    const res = await fetch(`/api/caregiver/contacts/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    setRowBusy(null);
    if (!res.ok) {
      setRowError(t("contacts.deleteError"));
      return;
    }
    load();
  }

  return (
    <main style={{ maxWidth: 720, margin: "32px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>{t("contacts.title")}</h1>
        <Link href="/caregiver/tags" style={{ fontSize: 13 }}>
          {t("tags.title")}
        </Link>
      </div>
      <p style={{ color: "#555", fontSize: 14 }}>{t("contacts.subtitle")}</p>

      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #ddd", borderRadius: 6 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>{t("contacts.addTitle")}</h2>
        <form onSubmit={onAdd}>
          <label style={{ display: "block", marginBottom: 12 }}>
            {t("contacts.kind")}
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ContactKind)}
              style={{ display: "block", width: "100%", padding: 8 }}
            >
              <option value="phone">{t("contacts.kindPhone")}</option>
              <option value="email">{t("contacts.kindEmail")}</option>
              <option value="address">{t("contacts.kindAddress")}</option>
            </select>
          </label>
          <label style={{ display: "block", marginBottom: 12 }}>
            {t("contacts.label")}{" "}
            <span style={{ color: "#999", fontSize: 12 }}>{t("contacts.labelHint")}</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              style={{ display: "block", width: "100%", padding: 8 }}
            />
          </label>
          <label style={{ display: "block", marginBottom: 12 }}>
            {t("contacts.value")}
            {kind === "address" ? (
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                maxLength={200}
                rows={3}
                style={{ display: "block", width: "100%", padding: 8 }}
              />
            ) : (
              <input
                type={kind === "email" ? "email" : "tel"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                maxLength={200}
                style={{ display: "block", width: "100%", padding: 8 }}
              />
            )}
          </label>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          <button type="submit" disabled={submitting || !value.trim()}>
            {submitting ? t("contacts.adding") : t("contacts.add")}
          </button>
        </form>
      </section>

      {rowError && <p style={{ color: "crimson" }}>{rowError}</p>}

      {contacts === null && <p>{t("contacts.loading")}</p>}
      {contacts !== null && contacts.length === 0 && <p>{t("contacts.empty")}</p>}
      {contacts !== null && contacts.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">{t("contacts.colType")}</th>
              <th align="left">{t("contacts.colLabel")}</th>
              <th align="left">{t("contacts.colValue")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => {
              const isEditing = editing?.id === c.id;
              return (
                <tr key={c.id} style={{ borderTop: "1px solid #eee", verticalAlign: "top" }}>
                  <td style={{ padding: "10px 0" }}>{t(`contacts.kind${cap(c.kind)}` as never)}</td>
                  <td>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editing!.label}
                        onChange={(e) => setEditing({ ...editing!, label: e.target.value })}
                        maxLength={80}
                        style={{ width: "100%", padding: 6 }}
                      />
                    ) : (
                      <span style={{ color: "#555" }}>{c.label ?? "—"}</span>
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editing!.value}
                        onChange={(e) => setEditing({ ...editing!, value: e.target.value })}
                        maxLength={200}
                        style={{ width: "100%", padding: 6 }}
                      />
                    ) : (
                      c.value
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={rowBusy === c.id || !editing!.value.trim()}
                        >
                          {rowBusy === c.id ? t("contacts.saving") : t("contacts.save")}
                        </button>{" "}
                        <button type="button" onClick={() => setEditing(null)}>
                          {t("contacts.cancel")}
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startEdit(c)}>
                          {t("contacts.edit")}
                        </button>{" "}
                        <button
                          type="button"
                          onClick={() => del(c.id)}
                          disabled={rowBusy === c.id}
                        >
                          {t("contacts.delete")}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
