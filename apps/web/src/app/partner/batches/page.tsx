"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/use-t";

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
    <main style={{ maxWidth: 720, margin: "32px auto", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>{t("batches.title")}</h1>
        <Link href="/partner/batches/new">{t("batches.newBatch")}</Link>
      </header>
      {batches === null && <p>{t("batches.loading")}</p>}
      {batches !== null && batches.length === 0 && <p>{t("batches.empty")}</p>}
      {batches !== null && batches.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">{t("batches.colCreated")}</th>
              <th align="left">{t("batches.colLabel")}</th>
              <th align="right">{t("batches.colSize")}</th>
              <th align="left">{t("batches.colCsv")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{new Date(b.createdAt).toLocaleString()}</td>
                <td>{b.label ?? t("batches.dash")}</td>
                <td align="right">{b.size}</td>
                <td>{b.csvDownloadedAt ? t("batches.csvDownloaded") : t("batches.csvPending")}</td>
                <td>
                  <Link href={`/partner/batches/${b.id}`}>{t("batches.view")}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
