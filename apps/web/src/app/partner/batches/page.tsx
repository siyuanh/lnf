"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Batch {
  id: string;
  size: number;
  label: string | null;
  createdAt: string;
  csvDownloadedAt: string | null;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  useEffect(() => {
    fetch(`${API}/partner/batches`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setBatches(data.batches));
  }, []);
  return (
    <main style={{ maxWidth: 720, margin: "32px auto", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Batches</h1>
        <Link href="/partner/batches/new">New batch</Link>
      </header>
      {batches === null && <p>Loading…</p>}
      {batches !== null && batches.length === 0 && <p>No batches yet.</p>}
      {batches !== null && batches.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Created</th>
              <th align="left">Label</th>
              <th align="right">Size</th>
              <th align="left">CSV</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{new Date(b.createdAt).toLocaleString()}</td>
                <td>{b.label ?? "—"}</td>
                <td align="right">{b.size}</td>
                <td>{b.csvDownloadedAt ? "downloaded" : "pending"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
