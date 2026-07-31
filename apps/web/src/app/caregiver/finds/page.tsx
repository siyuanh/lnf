"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/use-t";
import { useLocale } from "@/lib/i18n/provider";
import type { DictKey } from "@/lib/i18n/dict";

type FindStatus = "reported" | "acknowledged" | "claimed" | "resolved" | "false_positive" | "expired";

interface FindRow {
  id: string;
  tagCode: string;
  status: FindStatus;
  locationKind: "gps" | "address";
  lat: string | null;
  lon: string | null;
  addressText: string | null;
  finderMessage: string | null;
  finderContact: string | null;
  createdAt: string;
  collapsedCount: number;
}

interface TagOption {
  code: string;
  label: string | null;
  personName: string | null;
}

const CLOSABLE: FindStatus[] = ["reported", "acknowledged", "expired"];
const STATUS_KEY: Record<FindStatus, DictKey> = {
  reported: "find.status.reported",
  acknowledged: "find.status.acknowledged",
  claimed: "find.status.claimed",
  resolved: "find.status.resolved",
  false_positive: "find.status.false_positive",
  expired: "find.status.expired",
};

// §5.7 caregiver alert handling: history of finds per tag (the protected
// person is tag-scoped today), with ack / resolve / false-positive actions.
export default function FindsPage() {
  const t = useT();
  const locale = useLocale();
  const [finds, setFinds] = useState<FindRow[] | null>(null);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [tagFilter, setTagFilter] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    const qs = tagFilter ? `?tag=${encodeURIComponent(tagFilter)}` : "";
    fetch(`/api/caregiver/finds${qs}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { finds: FindRow[] }) => setFinds(data.finds))
      .catch(() => setFinds([]));
  }, [tagFilter]);

  useEffect(load, [load]);

  useEffect(() => {
    fetch("/api/caregiver/tags", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { tags: TagOption[] }) => setTags(data.tags))
      .catch(() => setTags([]));
  }, []);

  async function act(findId: string, action: "ack" | "resolve" | "false-positive") {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/caregiver/finds/${findId}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(String(res.status));
      load();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 860, margin: "32px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>{t("finds.title")}</h1>
        <Link href="/caregiver/tags" style={{ fontSize: 13 }}>
          {t("finds.linkToTags")}
        </Link>
      </div>
      <p style={{ color: "#555", fontSize: 14 }}>{t("finds.subtitle")}</p>

      <label style={{ fontSize: 13 }}>
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="">{t("finds.filterAll")}</option>
          {tags.map((tag) => (
            <option key={tag.code} value={tag.code}>
              {tag.code}
              {tag.personName ? ` — ${tag.personName}` : tag.label ? ` — ${tag.label}` : ""}
            </option>
          ))}
        </select>
      </label>

      {error && <p style={{ color: "#b00" }}>{t("finds.actionError")}</p>}
      {finds === null && <p>{t("finds.loading")}</p>}
      {finds !== null && finds.length === 0 && <p>{t("finds.empty")}</p>}
      {finds !== null && finds.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead>
            <tr>
              <th align="left">{t("finds.colWhen")}</th>
              <th align="left">{t("finds.colTag")}</th>
              <th align="left">{t("finds.colLocation")}</th>
              <th align="left">{t("finds.colMessage")}</th>
              <th align="left">{t("finds.colStatus")}</th>
              <th align="left">{t("finds.colReports")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {finds.map((f) => (
              <tr key={f.id} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "10px 4px 10px 0", whiteSpace: "nowrap" }}>
                  {new Date(f.createdAt).toLocaleString(locale)}
                </td>
                <td style={{ fontFamily: "monospace" }}>{f.tagCode}</td>
                <td>{f.locationKind === "address" ? f.addressText : `${t("finds.locationGps")} (${f.lat}, ${f.lon})`}</td>
                <td style={{ color: "#555" }}>
                  {f.finderMessage ?? "—"}
                  {f.finderContact && (
                    <span style={{ display: "block", fontSize: 12, color: "#333" }}>{f.finderContact}</span>
                  )}
                </td>
                <td>
                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 10,
                      background: f.status === "reported" ? "#ffe9a8" : f.status === "resolved" ? "#cdeccd" : "#e3e3e3",
                    }}
                  >
                    {t(STATUS_KEY[f.status])}
                  </span>
                </td>
                <td>{f.collapsedCount > 0 ? `+${f.collapsedCount}` : "1"}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {f.status === "reported" && (
                    <button disabled={busy} onClick={() => act(f.id, "ack")} style={{ marginRight: 8 }}>
                      {t("finds.ack")}
                    </button>
                  )}
                  {CLOSABLE.includes(f.status) && (
                    <>
                      <button disabled={busy} onClick={() => act(f.id, "resolve")} style={{ marginRight: 8 }}>
                        {t("finds.resolve")}
                      </button>
                      <button disabled={busy} onClick={() => act(f.id, "false-positive")}>
                        {t("finds.falsePositive")}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
