"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/use-t";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

interface Person {
  id: string;
  nickname: string;
  publicNote: string | null;
  createdAt: string;
}

export default function PeoplePage() {
  const t = useT();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [nickname, setNickname] = useState("");
  const [publicNote, setPublicNote] = useState("");
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
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(t("people.addError"));
      return;
    }
    setNickname("");
    setPublicNote("");
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
            <li key={p.id} className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="font-medium text-navy-900">{p.nickname}</p>
                {p.publicNote && <p className="mt-0.5 text-sm text-slate-600">{p.publicNote}</p>}
              </div>
              <span className="shrink-0 text-xs text-slate-500">
                {new Date(p.createdAt).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
