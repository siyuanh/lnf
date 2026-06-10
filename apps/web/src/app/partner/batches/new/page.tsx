"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import JSZip from "jszip";
import { useT } from "@/lib/i18n/use-t";

interface MintResponse {
  batchId: string;
  size: number;
  downloadUrl: string;
  expiresAt: string;
  codes?: string[];
}

const PREVIEW_CAP = 100;
const QR_PIXEL_SIZE = 256;

function urlForCode(code: string): string {
  // Per requirements §5.3: the QR encodes https://<domain>/f/<code>.
  // Same origin as the portal — partners scan the printed QR with any
  // phone, browser opens this same site, and the /f/[code] route decides
  // what to render.
  return `${window.location.origin}/f/${code}`;
}

async function generateZip(label: string, batchId: string, codes: string[]): Promise<Blob> {
  const zip = new JSZip();
  zip.file("codes.csv", codes.join("\n") + "\n");
  zip.file("README.txt", `Batch ${batchId}\n${codes.length} codes\nLabel: ${label || "(none)"}\n`);
  const qrFolder = zip.folder("qr")!;
  // PNGs sequentially to keep memory bounded — 10k codes × ~1KB ≈ 10MB,
  // generating them all in parallel can spike past that on mobile.
  for (const code of codes) {
    const png = await QRCode.toBuffer(urlForCode(code), {
      type: "png",
      width: QR_PIXEL_SIZE,
      margin: 1,
      errorCorrectionLevel: "M",
    });
    qrFolder.file(`${code}.png`, png);
  }
  return zip.generateAsync({ type: "blob" });
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function QrPreview({ code }: { code: string }) {
  const [src, setSrc] = useState<string | null>(null);
  // Render once per code; toDataURL is fast enough that we don't need
  // memoization for a 100-item grid.
  if (src === null) {
    QRCode.toDataURL(urlForCode(code), { width: 128, margin: 1, errorCorrectionLevel: "M" }).then(setSrc);
  }
  return (
    <figure style={{ margin: 0, textAlign: "center" }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={code} width={128} height={128} style={{ display: "block" }} />
      ) : (
        <div style={{ width: 128, height: 128, background: "#f0f0f0" }} />
      )}
      <figcaption style={{ fontSize: 11, fontFamily: "monospace", marginTop: 4 }}>{code}</figcaption>
    </figure>
  );
}

export default function NewBatchPage() {
  const router = useRouter();
  const t = useT();
  const [size, setSize] = useState(100);
  const [label, setLabel] = useState("");
  const [result, setResult] = useState<MintResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zipping, setZipping] = useState(false);

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
      setError(`${t("newBatch.statusError")} ${res.status}`);
      return;
    }
    setResult(await res.json());
  }

  async function onDownloadZip() {
    if (!result?.codes) return;
    setZipping(true);
    try {
      const blob = await generateZip(label, result.batchId, result.codes);
      const stem = label.replace(/[^a-zA-Z0-9_-]+/g, "-") || result.batchId;
      downloadBlob(blob, `${stem}.zip`);
    } finally {
      setZipping(false);
    }
  }

  if (result && result.codes) {
    const previewCodes = result.codes.slice(0, PREVIEW_CAP);
    const overflow = result.codes.length - previewCodes.length;
    return (
      <main style={{ maxWidth: 960, margin: "32px auto", fontFamily: "system-ui", padding: "0 16px" }}>
        <h1>{t("newBatch.created")}</h1>
        <p>
          {t("newBatch.batchId")}: <code>{result.batchId}</code> &middot; {t("newBatch.codeCount", { n: result.size })}
        </p>
        <p style={{ color: "crimson" }}>{t("newBatch.warning")}</p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
          <button onClick={onDownloadZip} disabled={zipping}>
            {zipping ? t("newBatch.buildingZip") : t("newBatch.downloadZip")}
          </button>
          <a href={result.downloadUrl} download style={{ fontSize: 14 }}>
            {t("newBatch.csvOnly")}
          </a>
        </div>

        <h2 style={{ fontSize: 16 }}>
          {t("newBatch.preview")}{" "}
          {previewCodes.length < result.codes.length
            ? t("newBatch.previewSubset", { shown: previewCodes.length, total: result.size })
            : ""}
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 16,
            marginTop: 12,
          }}
        >
          {previewCodes.map((c) => (
            <QrPreview key={c} code={c} />
          ))}
        </div>
        {overflow > 0 && (
          <p style={{ marginTop: 16, color: "#666", fontSize: 13 }}>
            {t("newBatch.overflow", { n: overflow })}
          </p>
        )}
        <p style={{ marginTop: 24 }}>
          <button onClick={() => router.push("/partner/batches")}>{t("newBatch.back")}</button>
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "32px auto", fontFamily: "system-ui" }}>
      <h1>{t("newBatch.title")}</h1>
      <form onSubmit={onSubmit}>
        <label style={{ display: "block", marginBottom: 12 }}>
          {t("newBatch.size")}
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
          {t("newBatch.label")}
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
          {busy ? t("newBatch.submitting") : t("newBatch.submit")}
        </button>
      </form>
    </main>
  );
}
