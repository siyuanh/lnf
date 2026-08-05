"use client";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n/use-t";
import { useLocale } from "@/lib/i18n/provider";
import type { DictKey } from "@/lib/i18n/dict";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

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
const STATUS_VARIANT = {
  reported: "warning",
  acknowledged: "info",
  claimed: "info",
  resolved: "success",
  false_positive: "muted",
  expired: "muted",
} as const satisfies Record<FindStatus, "warning" | "info" | "success" | "muted">;

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
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-navy-900">{t("finds.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("finds.subtitle")}</p>

      <select
        value={tagFilter}
        onChange={(e) => setTagFilter(e.target.value)}
        aria-label={t("finds.filterAll")}
        className="mt-4 flex h-10 w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
      >
        <option value="">{t("finds.filterAll")}</option>
        {tags.map((tag) => (
          <option key={tag.code} value={tag.code}>
            {tag.code}
            {tag.personName ? ` — ${tag.personName}` : tag.label ? ` — ${tag.label}` : ""}
          </option>
        ))}
      </select>

      {error && <Alert variant="destructive" className="mt-4">{t("finds.actionError")}</Alert>}
      {finds === null && <p className="mt-6 text-slate-600">{t("finds.loading")}</p>}
      {finds !== null && finds.length === 0 && <p className="mt-6 text-slate-600">{t("finds.empty")}</p>}
      {finds !== null && finds.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {finds.map((f) => (
            <Card key={f.id} className={f.status === "reported" ? "border-amber-300" : undefined}>
              <CardContent className="flex flex-col gap-3 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[f.status]}>{t(STATUS_KEY[f.status])}</Badge>
                    <span className="font-mono text-xs text-slate-500">{f.tagCode}</span>
                    {f.collapsedCount > 0 && (
                      <span className="text-xs text-slate-400">+{f.collapsedCount}</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(f.createdAt).toLocaleString(locale)}
                  </span>
                </div>
                <p className="text-sm font-medium text-navy-900">
                  {f.locationKind === "address"
                    ? f.addressText
                    : `${t("finds.locationGps")} (${f.lat}, ${f.lon})`}
                </p>
                {(f.finderMessage || f.finderContact) && (
                  <div className="text-sm text-slate-600">
                    {f.finderMessage && <p>{f.finderMessage}</p>}
                    {f.finderContact && <p className="mt-0.5 text-xs text-slate-500">{f.finderContact}</p>}
                  </div>
                )}
                {(f.status === "reported" || CLOSABLE.includes(f.status)) && (
                  <div className="flex flex-wrap gap-2">
                    {f.status === "reported" && (
                      <Button variant="accent" size="sm" disabled={busy} onClick={() => act(f.id, "ack")}>
                        {t("finds.ack")}
                      </Button>
                    )}
                    {CLOSABLE.includes(f.status) && (
                      <>
                        <Button variant="primary" size="sm" disabled={busy} onClick={() => act(f.id, "resolve")}>
                          {t("finds.resolve")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => act(f.id, "false-positive")}
                        >
                          {t("finds.falsePositive")}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </ul>
      )}
    </main>
  );
}
