"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/use-t";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";

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
  const [personName, setPersonName] = useState("");
  const [personDetails, setPersonDetails] = useState("");
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
        personName: personName.trim() ? personName.trim() : undefined,
        personDetails: personDetails.trim() ? personDetails.trim() : undefined,
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
      <main className="mx-auto max-w-md px-4 py-16 text-center sm:py-20">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-navy-900">{t("pair.success")}</h1>
        <p className="mt-6">
          <Link href="/caregiver/contacts" className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
            {t("pair.done")}
          </Link>
        </p>
      </main>
    );
  }

  if (contacts === null) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 sm:py-20">
        <p className="text-slate-600">{t("contacts.loading")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight text-navy-900">{t("pair.title")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{t("pair.description")}</p>

      {contacts.length === 0 ? (
        <Alert className="mt-6">
          {t("pair.noContacts")}{" "}
          <Link href="/caregiver/contacts" className="font-medium text-brand-600 hover:underline">
            {t("pair.addContact")}
          </Link>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5">
          <div>
            <Label htmlFor="pair-contact">{t("pair.selectContact")}</Label>
            <select
              id="pair-contact"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              required
              className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
            >
              <option value="">{t("pair.selectPlaceholder")}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {contactLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="pair-person-name">
              {t("pair.personName")}{" "}
              <span className="font-normal text-slate-400">{t("pair.personNameHint")}</span>
            </Label>
            <Input
              id="pair-person-name"
              type="text"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div>
            <Label htmlFor="pair-person-details">
              {t("pair.personDetails")}{" "}
              <span className="font-normal text-slate-400">{t("pair.personDetailsHint")}</span>
            </Label>
            <Textarea
              id="pair-person-details"
              value={personDetails}
              onChange={(e) => setPersonDetails(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="pair-label">
              {t("pair.label")}{" "}
              <span className="font-normal text-slate-400">{t("pair.labelHint")}</span>
            </Label>
            <Input
              id="pair-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
            />
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <Button type="submit" variant="accent" size="lg" disabled={submitting || !contactId} className="w-full">
            {submitting ? t("pair.submitting") : t("pair.submit")}
          </Button>
        </form>
      )}

      <p className="mt-10 text-center font-mono text-xs text-slate-400">
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
