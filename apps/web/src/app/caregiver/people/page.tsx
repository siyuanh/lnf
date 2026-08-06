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
}
interface Person {
  id: string;
  nickname: string;
  publicNote: string | null;
  fullName: string | null;
  bloodType: string | null;
  medicalConditions: string | null;
  allergies: string | null;
  medications: string | null;
  primaryContact: Contact | null;
  secondaryContact: Contact | null;
  createdAt: string;
}

const selectClass =
  "flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1";

export default function PeoplePage() {
  const t = useT();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [nickname, setNickname] = useState("");
  const [publicNote, setPublicNote] = useState("");
  const [fullName, setFullName] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [medicalConditions, setMedicalConditions] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");
  const [primaryContactId, setPrimaryContactId] = useState("");
  const [secondaryContactId, setSecondaryContactId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/caregiver/people", { credentials: "include" });
    if (!res.ok) {
      setPeople([]);
      return;
    }
    const data = await res.json();
    setPeople(data.people);
  }

  useEffect(() => {
    load();
    fetch("/api/caregiver/contacts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { contacts: Contact[] }) => setContacts(data.contacts))
      .catch(() => setContacts([]));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/caregiver/people", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nickname,
        publicNote: publicNote.trim() ? publicNote.trim() : undefined,
        fullName: fullName.trim() ? fullName.trim() : undefined,
        bloodType: bloodType.trim() ? bloodType.trim() : undefined,
        medicalConditions: medicalConditions.trim() ? medicalConditions.trim() : undefined,
        allergies: allergies.trim() ? allergies.trim() : undefined,
        medications: medications.trim() ? medications.trim() : undefined,
        primaryContactId: primaryContactId || undefined,
        secondaryContactId: secondaryContactId || undefined,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(t("people.addError"));
      return;
    }
    setNickname("");
    setPublicNote("");
    setFullName("");
    setBloodType("");
    setMedicalConditions("");
    setAllergies("");
    setMedications("");
    setPrimaryContactId("");
    setSecondaryContactId("");
    load();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-navy-900">{t("people.title")}</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t("people.addTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="person-nickname">{t("people.nickname")}</Label>
              <Input
                id="person-nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required
                maxLength={80}
              />
            </div>
            <div>
              <Label htmlFor="person-fullname">
                {t("people.fullName")}{" "}
                <span className="font-normal text-slate-400">{t("people.fullNameHint")}</span>
              </Label>
              <Input
                id="person-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="person-note">
                {t("people.publicNote")}{" "}
                <span className="font-normal text-slate-400">{t("people.publicNoteHint")}</span>
              </Label>
              <Textarea
                id="person-note"
                value={publicNote}
                onChange={(e) => setPublicNote(e.target.value)}
                maxLength={200}
                rows={2}
              />
            </div>

            <fieldset className="rounded-lg border border-slate-200 p-4">
              <legend className="px-1 text-sm font-medium text-navy-900">{t("people.medicalTitle")}</legend>
              <div className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="person-conditions">{t("people.medicalConditions")}</Label>
                  <Input
                    id="person-conditions"
                    type="text"
                    value={medicalConditions}
                    onChange={(e) => setMedicalConditions(e.target.value)}
                    maxLength={500}
                  />
                </div>
                <div>
                  <Label htmlFor="person-allergies">{t("people.allergies")}</Label>
                  <Input
                    id="person-allergies"
                    type="text"
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    maxLength={500}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="person-medications">{t("people.medications")}</Label>
                    <Input
                      id="person-medications"
                      type="text"
                      value={medications}
                      onChange={(e) => setMedications(e.target.value)}
                      maxLength={500}
                    />
                  </div>
                  <div>
                    <Label htmlFor="person-blood">{t("people.bloodType")}</Label>
                    <Input
                      id="person-blood"
                      type="text"
                      value={bloodType}
                      onChange={(e) => setBloodType(e.target.value)}
                      maxLength={20}
                      placeholder="O+"
                    />
                  </div>
                </div>
              </div>
            </fieldset>

            {contacts.length > 0 && (
              <fieldset className="rounded-lg border border-slate-200 p-4">
                <legend className="px-1 text-sm font-medium text-navy-900">{t("people.contactsTitle")}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="person-primary">{t("people.primaryContact")}</Label>
                    <select
                      id="person-primary"
                      value={primaryContactId}
                      onChange={(e) => setPrimaryContactId(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">{t("people.noContact")}</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>{contactLabel(c)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="person-secondary">{t("people.secondaryContact")}</Label>
                    <select
                      id="person-secondary"
                      value={secondaryContactId}
                      onChange={(e) => setSecondaryContactId(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">{t("people.noContact")}</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>{contactLabel(c)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </fieldset>
            )}

            {error && <Alert variant="destructive">{error}</Alert>}
            <div>
              <Button type="submit" variant="accent" disabled={submitting || !nickname.trim()}>
                {submitting ? t("people.adding") : t("people.add")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {people === null && <p className="mt-6 text-slate-600">{t("people.loading")}</p>}
      {people !== null && people.length === 0 && <p className="mt-6 text-slate-600">{t("people.empty")}</p>}
      {people !== null && people.length > 0 && (
        <ul className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {people.map((p) => (
            <li key={p.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-navy-900">{p.fullName ?? p.nickname}</p>
                  {p.fullName && <p className="text-xs text-slate-500">{p.nickname}</p>}
                  {p.publicNote && <p className="mt-0.5 text-sm text-slate-600">{p.publicNote}</p>}
                  {medicalSummary(p) && (
                    <p className="mt-0.5 text-sm text-slate-600">{medicalSummary(p)}</p>
                  )}
                  {(p.primaryContact || p.secondaryContact) && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[p.primaryContact, p.secondaryContact]
                        .filter((c): c is Contact => c !== null)
                        .map(contactLabel)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-mono text-xs text-slate-400" title={p.id}>
                  {p.id.slice(0, 8)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function contactLabel(c: Contact): string {
  const who = c.label ? `${c.label}${c.relationship ? ` (${c.relationship})` : ""}` : c.relationship;
  return who ? `${who} — ${c.value}` : c.value;
}

function medicalSummary(p: Person): string | null {
  const parts = [p.medicalConditions, p.allergies, p.medications, p.bloodType].filter(
    (x): x is string => !!x,
  );
  return parts.length ? parts.join(" · ") : null;
}
