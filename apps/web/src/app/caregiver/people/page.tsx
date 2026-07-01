"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/use-t";

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
    <main style={{ maxWidth: 720, margin: "32px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>{t("people.title")}</h1>
        <Link href="/caregiver/contacts" style={{ fontSize: 13 }}>
          {t("contacts.linkFromPeople")}
        </Link>
      </div>

      <section style={{ marginBottom: 32, padding: 16, border: "1px solid #ddd", borderRadius: 6 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>{t("people.addTitle")}</h2>
        <form onSubmit={onSubmit}>
          <label style={{ display: "block", marginBottom: 12 }}>
            {t("people.nickname")}
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
              maxLength={80}
              style={{ display: "block", width: "100%", padding: 8 }}
            />
          </label>
          <label style={{ display: "block", marginBottom: 12 }}>
            {t("people.publicNote")} <span style={{ color: "#999", fontSize: 12 }}>{t("people.publicNoteHint")}</span>
            <textarea
              value={publicNote}
              onChange={(e) => setPublicNote(e.target.value)}
              maxLength={200}
              rows={2}
              style={{ display: "block", width: "100%", padding: 8 }}
            />
          </label>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          <button type="submit" disabled={submitting || !nickname.trim()}>
            {submitting ? t("people.adding") : t("people.add")}
          </button>
        </form>
      </section>

      {people === null && <p>{t("people.loading")}</p>}
      {people !== null && people.length === 0 && <p>{t("people.empty")}</p>}
      {people !== null && people.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">{t("people.colNickname")}</th>
              <th align="left">{t("people.colNote")}</th>
              <th align="left">{t("people.colCreated")}</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "8px 0" }}>{p.nickname}</td>
                <td style={{ color: "#555" }}>{p.publicNote ?? "—"}</td>
                <td style={{ fontSize: 12, color: "#666" }}>
                  {new Date(p.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
