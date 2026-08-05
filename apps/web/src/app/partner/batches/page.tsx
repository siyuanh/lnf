"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/use-t";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Batch {
  id: string;
  size: number;
  label: string | null;
  createdAt: string;
  csvDownloadedAt: string | null;
}

export default function BatchesPage() {
  const t = useT();
  const [batches, setBatches] = useState<Batch[] | null>(null);

  useEffect(() => {
    fetch(`/api/partner/batches`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setBatches(data.batches));
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">{t("batches.title")}</h1>
        <Link href="/partner/batches/new" className={cn(buttonVariants({ variant: "primary" }))}>
          {t("batches.newBatch")}
        </Link>
      </header>

      {batches === null && <p className="text-slate-600">{t("batches.loading")}</p>}

      {batches !== null && batches.length === 0 && <p className="text-slate-600">{t("batches.empty")}</p>}

      {batches !== null && batches.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">
                  {t("batches.colCreated")}
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">
                  {t("batches.colLabel")}
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-700">
                  {t("batches.colSize")}
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">
                  {t("batches.colCsv")}
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-900">
                    {new Date(b.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-900">
                    {b.label ?? t("batches.dash")}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm text-slate-900">
                    {b.size}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={b.csvDownloadedAt ? "success" : "muted"}>
                      {b.csvDownloadedAt ? t("batches.csvDownloaded") : t("batches.csvPending")}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/partner/batches/${b.id}`}
                      className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      {t("batches.view")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
