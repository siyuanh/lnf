"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import JSZip from "jszip";
import { useT } from "@/lib/i18n/use-t";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

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
    <figure className="m-0 text-center">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={code} width={128} height={128} className="mx-auto block rounded-lg border border-slate-200" />
      ) : (
        <div className="mx-auto h-32 w-32 rounded-lg bg-slate-100" />
      )}
      <figcaption className="mt-1 font-mono text-xs text-slate-600">{code}</figcaption>
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
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">{t("newBatch.created")}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {t("newBatch.batchId")}: <code className="font-mono text-xs">{result.batchId}</code> &middot;{" "}
          {t("newBatch.codeCount", { n: result.size })}
        </p>
        <Alert variant="warning" className="mt-4">{t("newBatch.warning")}</Alert>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button variant="primary" onClick={onDownloadZip} disabled={zipping}>
            {zipping ? t("newBatch.buildingZip") : t("newBatch.downloadZip")}
          </Button>
          <a href={result.downloadUrl} download className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline">
            {t("newBatch.csvOnly")}
          </a>
        </div>

        <h2 className="mt-10 text-lg font-semibold text-navy-900">
          {t("newBatch.preview")}{" "}
          {previewCodes.length < result.codes.length
            ? t("newBatch.previewSubset", { shown: previewCodes.length, total: result.size })
            : ""}
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {previewCodes.map((c) => (
            <QrPreview key={c} code={c} />
          ))}
        </div>
        {overflow > 0 && (
          <p className="mt-4 text-sm text-slate-500">{t("newBatch.overflow", { n: overflow })}</p>
        )}
        <p className="mt-8">
          <Button variant="outline" onClick={() => router.push("/partner/batches")}>{t("newBatch.back")}</Button>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight text-navy-900">{t("newBatch.title")}</h1>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5">
        <div>
          <Label htmlFor="batch-size">{t("newBatch.size")}</Label>
          <Input
            id="batch-size"
            type="number"
            min={1}
            max={10_000}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            required
          />
        </div>
        <div>
          <Label htmlFor="batch-label">{t("newBatch.label")}</Label>
          <Input
            id="batch-label"
            type="text"
            maxLength={120}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button type="submit" variant="accent" size="lg" disabled={busy} className="w-full">
          {busy ? t("newBatch.submitting") : t("newBatch.submit")}
        </Button>
      </form>
    </main>
  );
}
