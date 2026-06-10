"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/use-t";

interface Person {
  id: string;
  nickname: string;
  publicNote: string | null;
}

export default function PairForm({ code }: { code: string }) {
  const t = useT();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [personId, setPersonId] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/caregiver/people", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => setPeople(data.people))
      .catch(() => setPeople([]));
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
        protectedPersonId: personId,
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
          <Link href="/caregiver/people">{t("people.title")}</Link>
        </p>
      </main>
    );
  }

  if (people === null) {
    return (
      <main style={{ maxWidth: 480, margin: "64px auto", fontFamily: "system-ui", padding: 16 }}>
        <p>{t("people.loading")}</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "64px auto", fontFamily: "system-ui", padding: 16 }}>
      <h1>{t("pair.title")}</h1>
      <p style={{ color: "#444" }}>{t("pair.description")}</p>

      {people.length === 0 ? (
        <p>
          {t("pair.noPersons")}{" "}
          <Link href="/caregiver/people">{t("pair.addPerson")}</Link>
        </p>
      ) : (
        <form onSubmit={onSubmit}>
          <label style={{ display: "block", marginBottom: 12 }}>
            {t("pair.selectPerson")}
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              required
              style={{ display: "block", width: "100%", padding: 8 }}
            >
              <option value="">{t("pair.selectPlaceholder")}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname}
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
          <button type="submit" disabled={submitting || !personId}>
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
