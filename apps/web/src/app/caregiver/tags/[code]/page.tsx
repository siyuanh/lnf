"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { useT } from "@/lib/i18n/use-t";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ContactKind = "phone" | "email" | "address";
type TagState = "inactive" | "active" | "registered" | "deprecated";
interface TagContact {
  id: string;
  kind: ContactKind;
  label: string | null;
  value: string;
  createdAt: string;
  updatedAt: string;
}
interface TagDetail {
  code: string;
  label: string | null;
  state: string;
  personName: string | null;
  personDetails: string | null;
  registeredAt: string | null;
  contact: TagContact | null;
}

const STATE_VARIANT = {
  inactive: "muted",
  active: "info",
  registered: "success",
  deprecated: "danger",
} as const;

export default function TagDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const t = useT();
  const [tag, setTag] = useState<TagDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [qrSrc, setQrSrc] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/caregiver/tags/${encodeURIComponent(code)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: TagDetail) => setTag(data))
      .catch(() => setNotFound(true));
  }, [code]);

  // Render the QR to a data URL client-side. Encodes the public finder URL
  // (/f/<code>) — the same value the printed tag carries.
  useEffect(() => {
    const url = `${window.location.origin}/f/${code}`;
    QRCode.toDataURL(url, { width: 220, margin: 1, errorCorrectionLevel: "M" })
      .then(setQrSrc)
      .catch(() => setQrSrc(null));
  }, [code]);

  if (notFound) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <p className="text-slate-600">{t("tagDetail.notFound")}</p>
        <Link href="/caregiver/tags" className="mt-2 inline-block font-medium text-brand-600 hover:underline">
          {t("tagDetail.back")}
        </Link>
      </main>
    );
  }

  if (!tag) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <p className="text-slate-600">{t("tagDetail.loading")}</p>
      </main>
    );
  }

  const finderUrl = `${window.location.origin}/f/${tag.code}`;
  const stateVariant = STATE_VARIANT[tag.state as TagState] ?? "muted";

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <p>
        <Link href="/caregiver/tags" className="text-sm font-medium text-brand-600 hover:underline">
          ← {t("tagDetail.back")}
        </Link>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-navy-900">{tag.label || t("tagDetail.untitled")}</h1>
        <Badge variant={stateVariant}>{t(`tagState.${tag.state}` as never)}</Badge>
      </div>
      <p className="mt-1 font-mono text-xs text-slate-500">{tag.code}</p>

      <Card className="mt-6">
        <CardContent className="flex flex-col items-center py-6">
          {qrSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrSrc}
              alt={t("tagDetail.qrAlt")}
              width={220}
              height={220}
              className="rounded-lg border border-slate-200"
            />
          ) : (
            <div className="h-[220px] w-[220px] rounded-lg bg-slate-100" />
          )}
          <p className="mt-3 break-all text-center font-mono text-xs text-slate-400">{finderUrl}</p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">{t("tagDetail.tagSection")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row k={t("tagDetail.state")} v={t(`tagState.${tag.state}` as never)} />
          <Row
            k={t("tagDetail.registeredAt")}
            v={tag.registeredAt ? new Date(tag.registeredAt).toLocaleString() : "—"}
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">{t("tagDetail.personSection")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row k={t("tagDetail.personName")} v={tag.personName ?? "—"} />
          <div className="flex gap-3 border-b border-slate-100 py-2 last:border-0">
            <span className="w-36 shrink-0 text-sm text-slate-500">{t("tagDetail.personDetails")}</span>
            <span className="whitespace-pre-wrap text-sm text-slate-900">{tag.personDetails ?? "—"}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">{t("tagDetail.contactSection")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {tag.contact ? (
            <>
              <Row k={t("tagDetail.contactType")} v={t(`contacts.kind${cap(tag.contact.kind)}` as never)} />
              <Row k={t("tagDetail.contactLabel")} v={tag.contact.label ?? "—"} />
              <Row k={t("tagDetail.contactValue")} v={tag.contact.value} />
            </>
          ) : (
            <p className="text-sm text-slate-500">{t("tagDetail.noContact")}</p>
          )}
          <p className="mt-3">
            <Link href="/caregiver/contacts" className="text-sm font-medium text-brand-600 hover:underline">
              {t("tagDetail.manageContacts")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="w-36 shrink-0 text-sm text-slate-500">{k}</span>
      <span className="text-sm text-slate-900">{v}</span>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
