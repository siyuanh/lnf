"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewBatchPage() {
  const router = useRouter();
  const [size, setSize] = useState(100);
  const [label, setLabel] = useState("");
  const [result, setResult] = useState<{ batchId: string; downloadUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/partner/batches`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ size, label: label || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(`status ${res.status}`);
      return;
    }
    setResult(await res.json());
  }

  if (result) {
    return (
      <main style={{ maxWidth: 720, margin: "32px auto", fontFamily: "system-ui" }}>
        <h1>Batch created</h1>
        <p>
          Batch ID: <code>{result.batchId}</code>
        </p>
        <p style={{ color: "crimson" }}>The CSV is single-use. Download it now and store it safely.</p>
        <a href={result.downloadUrl} download>
          Download CSV
        </a>
        <p>
          <button onClick={() => router.push("/partner/batches")}>Back to list</button>
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "32px auto", fontFamily: "system-ui" }}>
      <h1>New batch</h1>
      <form onSubmit={onSubmit}>
        <label style={{ display: "block", marginBottom: 12 }}>
          Size
          <input
            type="number"
            min={1}
            max={10_000}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          Label (optional)
          <input
            type="text"
            maxLength={120}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Minting…" : "Mint batch"}
        </button>
      </form>
    </main>
  );
}
