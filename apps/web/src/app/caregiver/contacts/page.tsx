"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/use-t";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type ContactKind = "phone" | "email" | "address";
interface Contact {
  id: string;
  kind: ContactKind;
  label: string | null;
  relationship: string | null;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export default function ContactsPage() {
  const t = useT();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [kind, setKind] = useState<ContactKind>("phone");
  const [label, setLabel] = useState("");
  const [relationship, setRelationship] = useState("");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // id being edited → its draft state
  const [editing, setEditing] = useState<{ id: string; label: string; relationship: string; value: string } | null>(null);
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
        relationship: relationship.trim() ? relationship.trim() : undefined,
        value: value.trim(),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(t("contacts.addError"));
      return;
    }
    setLabel("");
    setRelationship("");
    setValue("");
    load();
  }

  function startEdit(c: Contact) {
    setEditing({ id: c.id, label: c.label ?? "", relationship: c.relationship ?? "", value: c.value });
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
        relationship: editing.relationship.trim() ? editing.relationship.trim() : null,
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
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-navy-900">{t("contacts.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("contacts.subtitle")}</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t("contacts.addTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onAdd} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="contact-kind">{t("contacts.kind")}</Label>
              <select
                id="contact-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as ContactKind)}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
              >
                <option value="phone">{t("contacts.kindPhone")}</option>
                <option value="email">{t("contacts.kindEmail")}</option>
                <option value="address">{t("contacts.kindAddress")}</option>
              </select>
            </div>
            <div>
              <Label htmlFor="contact-label">
                {t("contacts.label")}{" "}
                <span className="font-normal text-slate-400">{t("contacts.labelHint")}</span>
              </Label>
              <Input
                id="contact-label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
              />
            </div>
            <div>
              <Label htmlFor="contact-relationship">
                {t("contacts.relationship")}{" "}
                <span className="font-normal text-slate-400">{t("contacts.relationshipHint")}</span>
              </Label>
              <Input
                id="contact-relationship"
                type="text"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                maxLength={80}
              />
            </div>
            <div>
              <Label htmlFor="contact-value">{t("contacts.value")}</Label>
              {kind === "address" ? (
                <Textarea
                  id="contact-value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                  maxLength={200}
                  rows={3}
                />
              ) : (
                <Input
                  id="contact-value"
                  type={kind === "email" ? "email" : "tel"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                  maxLength={200}
                />
              )}
            </div>
            {error && <Alert variant="destructive">{error}</Alert>}
            <div>
              <Button type="submit" variant="accent" disabled={submitting || !value.trim()}>
                {submitting ? t("contacts.adding") : t("contacts.add")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {rowError && <Alert variant="destructive" className="mt-4">{rowError}</Alert>}

      {contacts === null && <p className="mt-6 text-slate-600">{t("contacts.loading")}</p>}
      {contacts !== null && contacts.length === 0 && <p className="mt-6 text-slate-600">{t("contacts.empty")}</p>}
      {contacts !== null && contacts.length > 0 && (
        <ul className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {contacts.map((c) => {
            const isEditing = editing?.id === c.id;
            return (
              <li key={c.id} className="px-5 py-4">
                {isEditing ? (
                  <div className="flex flex-col gap-3">
                    <Input
                      type="text"
                      value={editing!.label}
                      onChange={(e) => setEditing({ ...editing!, label: e.target.value })}
                      maxLength={80}
                      aria-label={t("contacts.label")}
                    />
                    <Input
                      type="text"
                      value={editing!.relationship}
                      onChange={(e) => setEditing({ ...editing!, relationship: e.target.value })}
                      maxLength={80}
                      aria-label={t("contacts.relationship")}
                      placeholder={t("contacts.relationship")}
                    />
                    <Input
                      type="text"
                      value={editing!.value}
                      onChange={(e) => setEditing({ ...editing!, value: e.target.value })}
                      maxLength={200}
                      aria-label={t("contacts.value")}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={saveEdit}
                        disabled={rowBusy === c.id || !editing!.value.trim()}
                      >
                        {rowBusy === c.id ? t("contacts.saving") : t("contacts.save")}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                        {t("contacts.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {t(`contacts.kind${cap(c.kind)}` as never)}
                        {c.label && <span className="ml-2 normal-case text-slate-400">{c.label}</span>}
                        {c.relationship && (
                          <span className="ml-2 normal-case text-slate-400">({c.relationship})</span>
                        )}
                      </p>
                      <p className="mt-0.5 break-words text-sm font-medium text-navy-900">{c.value}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(c)}>
                        {t("contacts.edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => del(c.id)}
                        disabled={rowBusy === c.id}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        {t("contacts.delete")}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
