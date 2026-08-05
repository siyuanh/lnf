"use client";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";
import { useT } from "@/lib/i18n/use-t";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

type TagState = "inactive" | "active" | "registered" | "deprecated";

interface TagRow {
  code: string;
  state: TagState;
  activatedAt: string | null;
  deprecatedAt: string | null;
}

interface BatchDetail {
  batch: {
    id: string;
    size: number;
    label: string | null;
    createdAt: string;
    csvDownloadedAt: string | null;
  };
  tags: TagRow[];
  nextCursor: string | null;
}

const STATE_VARIANT = {
  inactive: "muted",
  active: "info",
  registered: "success",
  deprecated: "danger",
} as const satisfies Record<TagState, "muted" | "info" | "success" | "danger">;

function urlForCode(code: string): string {
  return `${window.location.origin}/f/${code}`;
}

function QrCell({ code }: { code: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(urlForCode(code), { width: 96, margin: 1, errorCorrectionLevel: "M" }).then(
      (url) => {
        if (!cancelled) setSrc(url);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [code]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={code} width={64} height={64} className="block rounded border border-slate-200" />
  ) : (
    <div className="h-16 w-16 rounded bg-slate-100" />
  );
}

export default function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useT();
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const loadPage = useCallback(
    async (cursor: string | null) => {
      if (!id) return;
      setLoading(true);
      const url = cursor
        ? `/api/partner/batches/${id}?cursor=${encodeURIComponent(cursor)}`
        : `/api/partner/batches/${id}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const next: BatchDetail = await res.json();
      setData((prev) =>
        prev && cursor
          ? { ...next, tags: [...prev.tags, ...next.tags] }
          : next,
      );
      setLoading(false);
    },
    [id],
  );

  useEffect(() => {
    if (id) loadPage(null);
  }, [id, loadPage]);

  if (!data) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-slate-600">{t("batchDetail.loading")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-sm">
        <Link href="/partner/batches" className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
          ← {t("batchDetail.back")}
        </Link>
      </p>
      <header className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">
            {data.batch.label ?? t("batchDetail.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t("batchDetail.created")}: {new Date(data.batch.createdAt).toLocaleString()} ·{" "}
            {t("batchDetail.size")}: {data.batch.size}
          </p>
        </div>
        <a
          href={`/api/partner/batches/${data.batch.id}/codes.csv`}
          download
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          {t("batchDetail.download")}
        </a>
      </header>

      {data.tags.length === 0 ? (
        <p className="text-slate-600">{t("batchDetail.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[560px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-6 py-3" />
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">{t("batchDetail.colCode")}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">{t("batchDetail.colState")}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">{t("batchDetail.colActivated")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.tags.map((row) => (
                <tr key={row.code} className="hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <QrCell code={row.code} />
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-slate-900">{row.code}</td>
                  <td className="px-6 py-3">
                    <Badge variant={STATE_VARIANT[row.state]}>{t(`tagState.${row.state}`)}</Badge>
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-600">
                    {row.activatedAt ? new Date(row.activatedAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.nextCursor && (
        <p className="mt-6">
          <Button variant="outline" onClick={() => loadPage(data.nextCursor)} disabled={loading}>
            {loading ? t("batchDetail.loading") : t("batchDetail.loadMore")}
          </Button>
        </p>
      )}
    </main>
  );
}
