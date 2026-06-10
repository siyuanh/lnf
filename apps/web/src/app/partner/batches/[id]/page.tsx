"use client";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";
import { useT } from "@/lib/i18n/use-t";

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

const STATE_COLOR: Record<TagState, { bg: string; fg: string }> = {
  inactive: { bg: "#eee", fg: "#555" },
  active: { bg: "#d1f0d5", fg: "#1f6b32" },
  registered: { bg: "#cfe1ff", fg: "#1d4889" },
  deprecated: { bg: "#f7d4d4", fg: "#8a1f1f" },
};

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
    <img src={src} alt={code} width={64} height={64} style={{ display: "block" }} />
  ) : (
    <div style={{ width: 64, height: 64, background: "#f5f5f5" }} />
  );
}

function StateBadge({ state, t }: { state: TagState; t: ReturnType<typeof useT> }) {
  const c = STATE_COLOR[state];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 12,
        background: c.bg,
        color: c.fg,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.4,
      }}
    >
      {t(`tagState.${state}`)}
    </span>
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
      <main style={{ maxWidth: 720, margin: "32px auto", fontFamily: "system-ui" }}>
        <p>{t("batchDetail.loading")}</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 960, margin: "32px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      <p style={{ fontSize: 13 }}>
        <Link href="/partner/batches">← {t("batchDetail.back")}</Link>
      </p>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{data.batch.label ?? t("batchDetail.title")}</h1>
          <p style={{ color: "#666", fontSize: 13, margin: 0 }}>
            {t("batchDetail.created")}: {new Date(data.batch.createdAt).toLocaleString()} ·{" "}
            {t("batchDetail.size")}: {data.batch.size}
          </p>
        </div>
        <a
          href={`/api/partner/batches/${data.batch.id}/codes.csv`}
          download
          style={{
            padding: "8px 14px",
            border: "1px solid #888",
            borderRadius: 4,
            textDecoration: "none",
            color: "#222",
            fontSize: 14,
          }}
        >
          {t("batchDetail.download")}
        </a>
      </header>

      {data.tags.length === 0 ? (
        <p>{t("batchDetail.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th />
              <th align="left">{t("batchDetail.colCode")}</th>
              <th align="left">{t("batchDetail.colState")}</th>
              <th align="left">{t("batchDetail.colActivated")}</th>
            </tr>
          </thead>
          <tbody>
            {data.tags.map((row) => (
              <tr key={row.code} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "8px 0" }}>
                  <QrCell code={row.code} />
                </td>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{row.code}</td>
                <td>
                  <StateBadge state={row.state} t={t} />
                </td>
                <td style={{ fontSize: 12, color: "#555" }}>
                  {row.activatedAt ? new Date(row.activatedAt).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data.nextCursor && (
        <p style={{ marginTop: 16 }}>
          <button onClick={() => loadPage(data.nextCursor)} disabled={loading}>
            {loading ? t("batchDetail.loading") : t("batchDetail.loadMore")}
          </button>
        </p>
      )}
    </main>
  );
}
